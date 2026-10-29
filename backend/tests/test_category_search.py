import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from category_search import search_categories, search_catalogue
from rag import retrieve_category_candidates, find_ozon_category, RagUnavailable
import os


class CategorySearchTests(unittest.TestCase):
    def test_real_catalogue_search_without_ai_or_ozon_keys(self):
        results = search_catalogue("компьютерная мышь")
        self.assertTrue(results)
        self.assertTrue(all(item["description_category_id"] and item["type_id"] for item in results))
        self.assertIn("мышь", results[0]["category_name"].lower())

    def test_empty_catalogue_result(self):
        self.assertEqual(search_catalogue("несуществующийтовар1234567890"), [])

    def test_explicit_catalogue_fallback_when_index_is_absent(self):
        with patch("rag.retrieve_category_candidates", side_effect=RuntimeError("No index")):
            result = search_categories("мышь")
        self.assertEqual(result["source"], "catalogue")
        self.assertTrue(result["categories"])
        self.assertTrue(result["notice"])

    def test_semantic_candidates_are_used_for_manual_search(self):
        candidate = {"description_category_id": 2, "type_id": 3, "category_name": "Кухонный контейнер"}
        with patch("rag.retrieve_category_candidates", return_value=[candidate]) as retrieve:
            result = search_categories("ёмкость для завтрака")
        retrieve.assert_called_once_with("ёмкость для завтрака", top_k=20)
        self.assertEqual(result["source"], "rag")
        self.assertIn(candidate, result["categories"])

    def test_retrieval_filters_leaves_before_search_and_keeps_real_ids(self):
        db = MagicMock()
        db.similarity_search.return_value = [SimpleNamespace(metadata={"level": 3, "category_id": 2, "id": 3, "path": "Дом > Коробка"})]
        with patch("rag.get_db", return_value=db):
            result = retrieve_category_candidates("коробка", top_k=5)
        db.similarity_search.assert_called_once_with("query: коробка", k=5, filter={"level": 3})
        self.assertEqual(result, [{"description_category_id": 2, "type_id": 3, "category_name": "Дом > Коробка"}])

    def test_rag_result_does_not_require_vsegpt_refinement(self):
        pair = {"description_category_id": 17028715, "type_id": 96250, "category_name": "Горшок для цветов"}
        with patch("rag.retrieve_category_candidates", return_value=[pair]), patch.dict(os.environ, {"VSEGPT_API_KEY": ""}):
            result = find_ozon_category("горшок")
        self.assertEqual(result["description_category_id"], 17028715)
        self.assertEqual(result["type_id"], 96250)
        self.assertEqual(result["source"], "rag")
        self.assertNotIn("error", result)

    def test_vsegpt_failure_keeps_valid_retrieved_category(self):
        pair = {"description_category_id": 17028715, "type_id": 96250, "category_name": "Горшок для цветов"}
        with patch("rag.retrieve_category_candidates", return_value=[pair]), patch("rag.select_category_with_llm", side_effect=ValueError("invalid result")), patch.dict(os.environ, {"VSEGPT_API_KEY": "test-only-token"}):
            result = find_ozon_category("горшок")
        self.assertEqual(result["type_id"], 96250)
        self.assertTrue(result["notice"])
        self.assertNotIn("error", result)

    def test_rag_errors_have_actionable_reason(self):
        with patch("rag.retrieve_category_candidates", side_effect=RagUnavailable("Подготовьте индекс", "rag_index_missing")):
            result = find_ozon_category("горшок")
        self.assertEqual(result["error_code"], "rag_index_missing")
        self.assertEqual(result["error"], "Подготовьте индекс")


if __name__ == "__main__":
    unittest.main()
