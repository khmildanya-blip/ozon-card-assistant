from openai import OpenAI
from dotenv import load_dotenv
import base64
import json
import re
import os
import mimetypes


load_dotenv()


YANDEX_API_KEY = os.getenv("YANDEX_API_KEY")
YANDEX_FOLDER_ID = os.getenv("YANDEX_FOLDER_ID")
IMAGE_PATH = os.getenv("IMAGE_PATH", "img.png")

if not YANDEX_API_KEY or not YANDEX_FOLDER_ID:
    print("❌ Ошибка: не найдены YANDEX_API_KEY или YANDEX_FOLDER_ID в .env")
    exit(1)

if not os.path.exists(IMAGE_PATH):
    print(f" Ошибка: файл {IMAGE_PATH} не найден")
    print(f"Полный путь: {os.path.abspath(IMAGE_PATH)}")
    exit(1)

print(f"✅ Файл найден: {os.path.abspath(IMAGE_PATH)}")
print(f"📏 Размер: {os.path.getsize(IMAGE_PATH)} байт\n")

client = OpenAI(
    api_key=YANDEX_API_KEY,
    base_url="https://ai.api.cloud.yandex.net/v1",
    project=YANDEX_FOLDER_ID,
)


def image_to_base64(image_path):
    mime_type, _ = mimetypes.guess_type(image_path)
    if not mime_type or not mime_type.startswith("image/"):
        mime_type = "image/jpeg"

    with open(image_path, "rb") as image_file:
        b64_data = base64.b64encode(image_file.read()).decode("utf-8")

    return f"data:{mime_type};base64,{b64_data}"


def analyze_product(image_path):
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

    print("🚀 Отправляю запрос к YandexGPT...")

    response = client.chat.completions.create(
        model=f"gpt://{YANDEX_FOLDER_ID}/qwen3.6-35b-a3b",
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

    print("\n🔎 Сырой ответ модели:")
    print("=" * 50)
    print(result_text)
    print("=" * 50)


    cleaned_text = result_text.strip()
    if cleaned_text.startswith("```json"):
        cleaned_text = cleaned_text[7:]
    if cleaned_text.startswith("```"):
        cleaned_text = cleaned_text[3:]
    if cleaned_text.endswith("```"):
        cleaned_text = cleaned_text[:-3]
    cleaned_text = cleaned_text.strip()

    print(f"\n🧹 После очистки markdown: {cleaned_text[:100]}...")

    # Ищем JSON
    json_match = re.search(r'\{[\s\S]*"rag_keyword"[\s\S]*"ozon_description"[\s\S]*\}', cleaned_text)
    if json_match:
        json_str = json_match.group(0)
        print(f"\n📦 Найденный JSON ({len(json_str)} символов): {json_str[:200]}...")
        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"\n⚠️ JSON невалиден: {e}")
            print(f"Полный текст: {json_str}")
            if not json_str.endswith("}"):
                json_str += '}'
                try:
                    return json.loads(json_str)
                except:
                    pass

    raise ValueError(f"Модель не вернула валидный JSON. Сырой ответ:\n{result_text}")

if __name__ == "__main__":
    print(f"🔍 Анализирую: {IMAGE_PATH}\n")
    try:
        result = analyze_product(IMAGE_PATH)
        print("\n✅ УСПЕХ!\n")
        print(" Ключевое слово для RAG:")
        print(result["rag_keyword"])
        print("\n Описание для Ozon:")
        print(result["ozon_description"])
    except Exception as e:
        print(f"\n❌ Ошибка: {e}")
