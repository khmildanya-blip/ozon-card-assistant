import json
import os
import shutil  # Библиотека для физического удаления папок
from langchain_core.documents import Document
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

# Получаем абсолютный путь к корню проекта
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Путь к базе данных
DB_DIR = os.path.join(BASE_DIR, "chroma_db")
COLLECTION = "ozon_categories"

# Путь к файлу flat_docs.jsonl
FLAT_DOCS_PATH = os.path.join(BASE_DIR, "data", "flat_docs.jsonl")


def build():
    flat_docs = []

    # 1. Открываем файл с данными
    try:
        with open(FLAT_DOCS_PATH, encoding="utf-8") as f:
            for line in f:
                flat_docs.append(json.loads(line))
    except FileNotFoundError:
        print(f"Ошибка: Файл не найден по пути: {FLAT_DOCS_PATH}")
        return

    # 2. Формируем документы
    chunks = []
    for d in flat_docs:
        content = f"passage: {d['page_content']}"
        chunks.append(Document(page_content=content, metadata=d["metadata"]))

    # 3. ФИЗИЧЕСКИ удаляем старую базу, если она существует
    # Это гарантирует, что не будет никаких конфликтов с заблокированными файлами
    if os.path.exists(DB_DIR):
        print("Удаление старой базы данных...")
        try:
            shutil.rmtree(DB_DIR)
        except Exception as e:
            print(f"Ошибка при удалении папки: {e}")
            print("Пожалуйста, закройте все терминалы и удалите папку chroma_db вручную.")
            return

    # 4. Загружаем модель
    print("Загрузка модели эмбеддингов...")
    embeddings = HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-base")

    # 5. Создаем абсолютно чистую базу с нуля
    print("Создание новой базы данных...")
    db = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=DB_DIR,
        collection_name=COLLECTION,
    )
    print(f"БД успешно построена: {len(chunks)} документов → {DB_DIR}")

    import time
    print("Сохранение индексов на диск... Пожалуйста, не закрывайте терминал 10 секунд.")
    time.sleep(10)
    print("Сохранение завершено! База полностью готова.")


if __name__ == "__main__":
    build()