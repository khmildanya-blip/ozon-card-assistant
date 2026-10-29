from openai import OpenAI
from dotenv import load_dotenv
import base64
import json
import re
import os
import mimetypes


load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.example"))


YANDEX_API_KEY = os.getenv("YANDEX_API_KEY")
YANDEX_FOLDER_ID = os.getenv("YANDEX_FOLDER_ID")
IMAGE_PATH = os.getenv("IMAGE_PATH", "img.png")




def image_to_base64(image_path):
    mime_type, _ = mimetypes.guess_type(image_path)
    if not mime_type or not mime_type.startswith("image/"):
        mime_type = "image/jpeg"

    with open(image_path, "rb") as image_file:
        b64_data = base64.b64encode(image_file.read()).decode("utf-8")

    return f"data:{mime_type};base64,{b64_data}"


def analyze_product(image_path):
    api_key = os.getenv("YANDEX_API_KEY")
    folder_id = os.getenv("YANDEX_FOLDER_ID")
    if not api_key or not folder_id:
        raise RuntimeError("Распознавание фото не настроено: задайте YANDEX_API_KEY и YANDEX_FOLDER_ID в backend/.env. Категорию можно найти по названию.")
    client = OpenAI(
        api_key=api_key,
        base_url="https://ai.api.cloud.yandex.net/v1",
        project=folder_id,
        timeout=90,
        max_retries=0,
    )
    image_data_url = image_to_base64(image_path)

    prompt = """Ты — ассистент для заполнения карточек товаров на Ozon.
Проанализируй ИЗОБРАЖЕНИЕ и верни СТРОГО валидный JSON объект.

КРИТИЧЕСКИ ВАЖНО:
- Сначала внимательно посмотри на изображение и определи, что на нем изображено
- НЕ добавляй markdown-обёртки типа ```json ... ```
- Верни ТОЛЬКО JSON, начиная с { и заканчивая }
- НЕ копируй примеры — они только для понимания формата
- Описывай ТОЛЬКО то, что видишь на фото

Правила:
1. Только русский язык.
2. "rag_keyword" — 1-2 слова, название товара в именительном падеже.
3. "ozon_description" — продающее описание (5-7 предложений).
   - Описывай ТОЛЬКО товар, а не фон или окружение.
   - ЗАПРЕЩЕНО: "на изображении", "на фото", "лежит на", "видна".
   - Используй эмодзи и маркированный список.
   - ЗАПРЕЩЕНО: "лучший", "топ", "скидка", "акция".

ФОРМАТ ОТВЕТА (верни ТОЛЬКО это, без ```json):
{
  "rag_keyword": "название товара",
  "ozon_description": "Описание товара..."
}

Верни JSON для товара на изображении:"""

    print("Отправляю запрос к YandexGPT...")

    response = client.chat.completions.create(
        model=os.getenv("YANDEX_MODEL", f"gpt://{folder_id}/qwen3.6-35b-a3b"),
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                ],
            }
        ],
        temperature=0.1,
        max_tokens=2000,
    )

    result_text = response.choices[0].message.content

    return parse_product_result(result_text)


def parse_product_result(text):
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned).strip()
    try:
        result = json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        raise ValueError("Модель не вернула валидный JSON с названием товара.")
    if not isinstance(result, dict) or not isinstance(result.get("rag_keyword"), str) or not result["rag_keyword"].strip():
        raise ValueError("Модель не определила название товара.")
    if not isinstance(result.get("ozon_description"), str):
        raise ValueError("Модель не вернула описание товара.")
    return {"rag_keyword": result["rag_keyword"].strip(), "ozon_description": result["ozon_description"]}


if __name__ == "__main__":
    if not YANDEX_API_KEY or not YANDEX_FOLDER_ID:
        print("Ошибка: не найдены YANDEX_API_KEY или YANDEX_FOLDER_ID в .env")
        exit(1)

    if not os.path.exists(IMAGE_PATH):
        print(f" Ошибка: файл {IMAGE_PATH} не найден")
        print(f"Полный путь: {os.path.abspath(IMAGE_PATH)}")
        exit(1)

    print(f"Файл найден: {os.path.abspath(IMAGE_PATH)}")
    print(f"Размер: {os.path.getsize(IMAGE_PATH)} байт\n")
    print(f"Анализирую: {IMAGE_PATH}\n")
    try:
        result = analyze_product(IMAGE_PATH)
        print(" Ключевое слово для RAG:")
        print(result["rag_keyword"])
        print("\n Описание для Ozon:")
        print(result["ozon_description"])
    except Exception as e:
        print(f"\nОшибка: {e}")
