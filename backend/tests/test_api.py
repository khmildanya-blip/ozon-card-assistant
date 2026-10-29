"""API contract smoke tests; external Ozon/AI services are mocked."""
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
import os
import json

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
import main


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def test_all_attribute_metadata_is_preserved(self):
        attrs = [{"id": 1, "is_required": False, "dictionary_id": 4, "group_name": "Цвет"}]
        with patch.object(main, "ozon_request", new=AsyncMock(return_value={"result": attrs})):
            response = self.client.post("/api/get-category-attributes", json={"description_category_id": 2, "type_id": 3})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["attributes"], attrs)

    def test_dictionary_pagination_and_limit(self):
        with patch.object(main, "ozon_request", new=AsyncMock(return_value={"result": [], "has_next": False})) as upstream:
            response = self.client.post("/api/attribute-values", json={"description_category_id": 2, "type_id": 3, "attribute_id": 1, "last_value_id": 10, "limit": 5000})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(upstream.call_args.args[1]["limit"], 1000)
        self.assertEqual(upstream.call_args.args[1]["last_value_id"], 10)

    def test_rejects_unsupported_and_oversized_images(self):
        response = self.client.post("/api/recognize-image", files={"file": ("test.txt", b"x", "text/plain")})
        self.assertEqual(response.status_code, 400)
        response = self.client.post("/api/recognize-image", files={"file": ("test.png", b"x" * (10 * 1024 * 1024 + 1), "image/png")})
        self.assertEqual(response.status_code, 413)

    def test_category_tree_contract(self):
        tree = {"result": [{"description_category_id": 2, "children": [{"type_id": 3}]}]}
        with patch.object(main, "ozon_request", new=AsyncMock(return_value=tree)):
            self.assertEqual(self.client.get("/api/categories").json(), tree)

    def test_openapi_without_initializing_ai(self):
        self.assertEqual(self.client.get("/openapi.json").status_code, 200)

    def test_manual_search_endpoint_works_without_photo_or_ai(self):
        with patch("rag.retrieve_category_candidates", side_effect=RuntimeError("No database")):
            response = self.client.post("/api/search-categories", json={"query": "компьютерная мышь"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["source"], "catalogue")
        self.assertTrue(response.json()["categories"])

    def test_manual_search_rejects_empty_query(self):
        self.assertEqual(self.client.post("/api/search-categories", json={"query": "  "}).status_code, 422)

    def test_recognition_returns_keywords_and_preserves_png_mime_suffix(self):
        def recognize(path):
            self.assertTrue(path.endswith(".png"))
            return {"rag_keyword": "Органайзер", "ozon_description": "Описание"}
        with patch.dict(sys.modules, {"recognizer": SimpleNamespace(analyze_product=recognize)}):
            response = self.client.post("/api/recognize-image", files={"file": ("test.png", b"png", "image/png")})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rag_keyword"], "Органайзер")

    def test_recognition_missing_config_is_not_a_connection_error(self):
        def recognize(_path):
            raise RuntimeError("Распознавание фото не настроено: задайте YANDEX_API_KEY")
        with patch.dict(sys.modules, {"recognizer": SimpleNamespace(analyze_product=recognize)}):
            response = self.client.post("/api/recognize-image", files={"file": ("test.jpg", b"jpg", "image/jpeg")})
        self.assertEqual(response.status_code, 503)
        self.assertIn("YANDEX_API_KEY", response.json()["detail"])

    def test_health_does_not_require_credentials_or_ai_dependencies(self):
        data = self.client.get("/api/health").json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "ozon-card-assistant")
        self.assertIn("recognize-product", data["capabilities"])

    def test_photo_pipeline_keeps_rag_category_and_uses_its_two_ids_for_attributes(self):
        pair = {"description_category_id": 17028715, "type_id": 96250, "category_name": "Дом и сад → Аксессуары для цветов → Горшок для цветов"}
        recognized = main.RecognitionResponse(rag_keyword="Горшок для цветов", ozon_description="Описание")
        with patch.object(main, "recognize_image", new=AsyncMock(return_value=recognized)), patch("rag.find_ozon_category", return_value={**pair, "source": "rag", "notice": "Проверьте категорию", "candidates": [pair]}):
            response = self.client.post("/api/recognize-product", files={"file": ("pot.jpg", b"photo", "image/jpeg")})
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["category"], pair)
        self.assertEqual(result["category_source"], "rag")
        fixture = json.loads((Path(__file__).resolve().parents[2] / "data" / "attributes_17028715_96250.json").read_text())
        with patch.object(main, "ozon_request", new=AsyncMock(return_value=fixture)) as upstream:
            attributes = self.client.post("/api/get-category-attributes", json={key: result["category"][key] for key in ("description_category_id", "type_id")})
        self.assertEqual(attributes.status_code, 200)
        self.assertEqual(attributes.json()["attributes"], fixture["result"])
        self.assertEqual(upstream.call_args.args[1]["description_category_id"], 17028715)
        self.assertEqual(upstream.call_args.args[1]["type_id"], 96250)

    def test_rag_failure_does_not_erase_successful_photo_recognition(self):
        recognized = main.RecognitionResponse(rag_keyword="Горшок для цветов", ozon_description="Описание")
        with patch.object(main, "recognize_image", new=AsyncMock(return_value=recognized)), patch("rag.find_ozon_category", return_value={"error": "База ещё строится", "error_code": "rag_index_building"}):
            response = self.client.post("/api/recognize-product", files={"file": ("pot.jpg", b"photo", "image/jpeg")})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rag_keyword"], "Горшок для цветов")
        self.assertIsNone(response.json()["category"])
        self.assertEqual(response.json()["category_error_code"], "rag_index_building")
        self.assertTrue(response.json()["candidates"])


if __name__ == "__main__":
    unittest.main()
