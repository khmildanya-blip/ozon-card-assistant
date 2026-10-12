import json
import re
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from dotenv import load_dotenv
from openai import OpenAI
import os

# 1. Подключение к существующей базе ChromaDB
DB_DIR = "./chroma_db"
COLLECTION = "ozon_categories"

load_dotenv()

embeddings = HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-base")

db = Chroma(
    persist_directory=DB_DIR,
    embedding_function=embeddings,
    collection_name=COLLECTION,
)

# 2. Настройка подключения через VseGPT
VSEGPT_API_KEY = os.getenv("VSEGPT_API_KEY")

client = OpenAI(
    api_key=VSEGPT_API_KEY,
    base_url="https://api.vsegpt.ru/v1"
)


def find_ozon_category(user_query: str, top_k: int = 8):
    # Префикс 'query: ' обязателен для моделей семейства multilingual-e5
    search_query = f"query: {user_query}"

    # Ищем близкие категории в ChromaDB
    retrieved_docs = db.similarity_search(search_query, k=top_k)

    candidates = []
    for doc in retrieved_docs:
        meta = doc.metadata
        # Берем только конечные категории товаров (уровень 3)
        if meta.get("level") == 3:
            candidates.append({
                "path": meta.get("path"),
                "description_category_id": meta.get("category_id"),
                "type_id": meta.get("id")
            })

    if not candidates:
        return {"error": "В базе не найдены подходящие категории конечного уровня."}

    # Формируем запрос для модели
    prompt = f"""Пользователь ищет категорию товара на Ozon: "{user_query}".
Вот список кандидатов из справочника Ozon:
{json.dumps(candidates, ensure_ascii=False, indent=2)}

Выбери ровно одну наиболее подходящую категорию.
Верни ответ СТРОГО в формате JSON без каких-либо пояснений и без markdown-разметки:
{{"description_category_id": <число>, "type_id": <число>, "category_name": "<строка>"}}"""

    try:
        response = client.chat.completions.create(
            model="deepseek/deepseek-chat",  # Запуск DeepSeek V3 через VseGPT
            messages=[
                {
                    "role": "system",
                    "content": "Ты эксперт по каталогу Ozon. Твоя задача — сопоставить товар с категорией и вернуть только сырой JSON-объект."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.0
        )

        raw_content = response.choices[0].message.content.strip()

        # Очистка на случай, если модель добавит markdown блоки ```json ... ```
        cleaned_json = re.sub(r"^```json\s*|\s*```$", "", raw_content, flags=re.MULTILINE).strip()
        return json.loads(cleaned_json)

    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    query = "найди мне категорию для ботинок в поход"
    print(f"Поисковый запрос: {query}\n")

    result = find_ozon_category(query)
    print("Итоговый результат:")
    print(json.dumps(result, ensure_ascii=False, indent=2))