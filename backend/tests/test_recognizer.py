import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from recognizer import parse_product_result


class RecognitionParsingTests(unittest.TestCase):
    def test_json_property_order_does_not_break_recognition(self):
        self.assertEqual(parse_product_result('{"ozon_description": "Описание", "rag_keyword": "Мышь"}')["rag_keyword"], "Мышь")

    def test_markdown_wrapped_json_is_supported(self):
        self.assertEqual(parse_product_result('```json\n{"rag_keyword": "Коробка", "ozon_description": "Описание"}\n```')["rag_keyword"], "Коробка")

    def test_empty_name_and_invalid_responses_are_rejected(self):
        for text in [None, "not JSON", "[]", '{"rag_keyword": "", "ozon_description": "Описание"}', '{"rag_keyword": "Мышь"}']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_product_result(text)


if __name__ == "__main__":
    unittest.main()
