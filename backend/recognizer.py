from openai import OpenAI, APIStatusError
from dotenv import load_dotenv
import base64
import json
import re
import os
import mimetypes
import sys

load_dotenv()

YANDEX_API_KEY = os.getenv("YANDEX_API_KEY")
YANDEX_FOLDER_ID = os.getenv("YANDEX_FOLDER_ID")

if not YANDEX_API_KEY or not YANDEX_FOLDER_ID:
    print("Ошибка: не найдены YANDEX_API_KEY или YANDEX_FOLDER_ID в .env")
    raise ValueError("Не найдены YANDEX_API_KEY или YANDEX_FOLDER_ID в .env файле")

client = OpenAI(
    api_key=YANDEX_API_KEY,
    base_url="https://ai.api.cloud.yandex.net/v1",
    project=YANDEX_FOLDER_ID,
)

try:
    from PIL import Image
    import io
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

MAX_IMAGE_SIZE = (1024, 1024)

def image_to_base64(image_path):
    mime_type, _ = mimetypes.guess_type(image_path)
    if not mime_type or not mime_type.startswith("image/"):
        mime_type = "image/jpeg"
    if HAS_PIL:
        with Image.open(image_path) as img:
            img.thumbnail(MAX_IMAGE_SIZE, Image.LANCZOS)
            if img.mode != "RGB":
                img = img.convert("RGB")
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=85)
            b64_data = base64.b64encode(buffer.getvalue()).decode("utf-8")
        return f"data:image/jpeg;base64,{b64_data}"
    with open(image_path, "rb") as image_file:
        b64_data = base64.b64encode(image_file.read()).decode("utf-8")
    return f"data:{mime_type};base64,{b64_data}"

def get_universal_prompt():
    return """Ты — умный ассистент для анализа товаров по фото.
Твоя задача: проанализировать изображения, определить тип товара и извлечь данные.

ШАГ 1: Определи тип товара.
- Если это КНИГА (видны обложка, корешок, страницы, титульный лист, аннотация), используй формат "book".
- Если это ЛЮБОЙ ДРУГОЙ ТОВАР (кружка, техника, одежда, продукты, бытовая химия), используй формат "general".

ШАГ 2: Верни СТРОГО валидный JSON без markdown-обёрток.
НЕ пиши никаких приветствий или пояснений, только JSON, начиная с { и заканчивая }.

ФОРМАТ 1 (Если это КНИГА):
{
  "category": "book",
  "title": "Название книги",
  "rag_keyword": "1-2 слова, название товара в именительном падеже",
  "author": "Автор (ФИО)",
  "author_on_cover": "текст с именем автора с обложки",
  "publisher": "Издательство",
  "year": 1990,
  "pages_count": 300,
  "paper_type": "Газетная",
  "language": "Русский",
  "isbn": "000-000-000",
  "cover_type": "Твердый переплет",
  "condition": "Хорошая",
  "raw_text": "Весь распознанный текст с фото"
}

ФОРМАТ 2 (Если это ОБЫЧНЫЙ ТОВАР):
{
  "category": "general",
  "rag_keyword": "1-2 слова, название товара в именительном падеже",
  "ozon_description": "Продающее описание товара (5-7 предложений, с эмодзи и маркированным списком. Без слов 'на фото', 'лучший', 'скидка').",
  "raw_text": "Текст с упаковки или самого товара"
}

Правила:
1. Только русский язык.
2. Числовые поля (year, pages_count) должны быть числами, а не строками.
3. Если какого-то поля для книги нет (например, ISBN), ставь "0" или 0.
4. Отвечай СРАЗУ, без длинных размышлений.
"""

def find_json_object(text):
    """Ищем первый сбалансированный {...} перебором скобок - надёжнее regex."""
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return text[start:] + "}"

def normalize_keys(data):
    """Режем пробелы из ключей: 'category ' -> 'category'."""
    if not isinstance(data, dict):
        return data
    out = {}
    for k, v in data.items():
        key = k.strip() if isinstance(k, str) else k
        out[key] = v
    return out

def extract_result(response):
    """Достаём текст из content, при пустом content пробуем reasoning_content."""
    msg = response.choices[0].message
    text = msg.content
    if not text:
        text = getattr(msg, "reasoning_content", None)
        if text:
            print("content пуст, извлекаю JSON из reasoning_content")
    return text

def clean_markdown(text):
    t = text.strip()
    if t.startswith("```json"):
        t = t[7:]
    if t.startswith("```"):
        t = t[3:]
    if t.endswith("```"):
        t = t[:-3]
    return t.strip()

def call_model(content, max_tokens, disable_thinking):
    kwargs = dict(
        model=f"gpt://{YANDEX_FOLDER_ID}/qwen3.6-35b-a3b",
        messages=[{"role": "user", "content": content}],
        temperature=0.1,
        max_tokens=max_tokens,
    )
    if disable_thinking:
        kwargs["extra_body"] = {"thinking": {"type": "disabled"}}
    return client.chat.completions.create(**kwargs)

def analyze_product(image_paths):
    content = [{"type": "text", "text": get_universal_prompt()}]
    for path in image_paths:
        if not os.path.exists(path):
            print(f"Файл не найден, пропускаем: {path}")
            continue
        image_data_url = image_to_base64(path)
        content.append({"type": "image_url", "image_url": {"url": image_data_url}})

    if len(content) == 1:
        raise ValueError("Не удалось добавить ни одного изображения для анализа.")


    attempts = [
        {"disable_thinking": True,  "max_tokens": 8000},
        {"disable_thinking": False, "max_tokens": 8000},
        {"disable_thinking": False, "max_tokens": 16000},
    ]

    last_error = None
    for i, cfg in enumerate(attempts, 1):
        try:
            response = call_model(content, cfg["max_tokens"], cfg["disable_thinking"])
        except APIStatusError as e:
            last_error = e
            print(f"Попытка {i}: API отверг параметры ({e.status_code}), пробуем иначе...")
            continue

        finish = response.choices[0].finish_reason
        raw = extract_result(response)

        if raw:
            cleaned = clean_markdown(raw)
            json_str = find_json_object(cleaned)
            if json_str:
                try:
                    data = json.loads(json_str)
                    return normalize_keys(data)
                except json.JSONDecodeError as e:
                    last_error = f"JSON невалиден: {e}"
                    print(f"Попытка {i}: {last_error}")
                    continue
            else:
                last_error = f"JSON не найден в ответе:\n{raw[:300]}"
        elif finish == "length":
            last_error = "Модель израсходовала весь бюджет токенов на размышления (finish_reason=length)"
            print(f"Попытка {i}: {last_error}")
            continue
        else:
            last_error = f"Пустой ответ (finish_reason={finish})"

    raise ValueError(f"Все попытки исчерпаны. Последняя ошибка:\n{last_error}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        images_to_analyze = sys.argv[1:]
    else:
        images_to_analyze = [os.getenv("IMAGE_PATH", "img.png")]

    existing_images = [p for p in images_to_analyze if os.path.exists(p)]
    if not existing_images:
        print("Ошибка: не найдено ни одного изображения для анализа.")

    print(f"Анализирую {len(existing_images)} изображений:\n")
    for img in existing_images:
        print(f" - {os.path.basename(img)} ({os.path.getsize(img) // 1024} KB)")
    print()

    try:
        result = analyze_product(existing_images)
        category = result.get("category")
        if category == "book":
            print("ОПРЕДЕЛЕНО: КНИГА")
            print("-" * 40)
            print("Название:", result.get("title"))
            print("Ключевое слово (RAG):", result.get("rag_keyword"))
            print("Автор:", result.get("author"))
            print("Автор на обложке:", result.get("author_on_cover"))
            print("Издательство:", result.get("publisher"))
            print("Год:", result.get("year"))
            print("Тип бумаги:", result.get("paper_type"))
            print("Язык:", result.get("language"))
            print("ISBN:", result.get("isbn"))
            print("Переплет:", result.get("cover_type"))
            print("Сохранность:", result.get("condition"))
        else:
            print("ОПРЕДЕЛЕНО: ОБЫЧНЫЙ ТОВАР")
            print("-" * 40)
            print("Ключевое слово (RAG):", result.get("rag_keyword"))
            print("\nОписание для Ozon:")
            print(result.get("ozon_description"))

        print("\n" + "=" * 50)
        print("Распознанный текст (raw_text):")
        print(result.get("raw_text", "Текст не найден"))
    except Exception as e:
        print(f"\nОшибка: {e}")
