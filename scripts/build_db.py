"""Build the actual category RAG index without deleting an existing database."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from category_search import CATALOGUE_PATH, catalogue_categories
from rag import COLLECTION, DB_DIR, EMBEDDING_MODEL, get_embeddings


def category_documents():
    from langchain_core.documents import Document

    return [Document(
        page_content=f"passage: Категория товара: {item['category_name'].split(' → ')[-1]}\nПолный путь: {item['category_name']}",
        metadata={"id": item["type_id"], "category_id": item["description_category_id"], "level": 3, "path": item["category_name"]},
    ) for item in catalogue_categories()]


def build(db_dir=DB_DIR, batch_size=64):
    from langchain_chroma import Chroma

    destination = Path(db_dir)
    manifest_path = destination / "manifest.json"
    expected = {"catalogue_sha256": hashlib.sha256(CATALOGUE_PATH.read_bytes()).hexdigest(), "model": EMBEDDING_MODEL, "schema": 1}
    if manifest_path.is_file():
        previous = json.loads(manifest_path.read_text())
        if (destination / "chroma.sqlite3").is_file() and all(previous.get(key) == value for key, value in expected.items()):
            (destination / "building.json").unlink(missing_ok=True)
            print(f"Индекс уже готов: {previous['count']} типов товара. Изменений нет.", flush=True)
            return
        raise SystemExit("Каталог или модель изменились. Укажите новый каталог индекса через --db-dir; существующая база сохранена.")
    destination.mkdir(parents=True, exist_ok=True)
    building_path = destination / "building.json"
    building_path.write_text(json.dumps({"status": "building", **expected}))
    docs = category_documents()
    print(f"Загрузка {EMBEDDING_MODEL}. Типов товара: {len(docs)}", flush=True)
    db = Chroma(persist_directory=str(destination), embedding_function=get_embeddings(), collection_name=COLLECTION)
    for start in range(0, len(docs), batch_size):
        batch = docs[start:start + batch_size]
        ids = [f"ozon:{doc.metadata['category_id']}:{doc.metadata['id']}" for doc in batch]
        # Stable IDs make reruns/resumption idempotent; no rmtree or duplicate documents.
        db.add_documents(batch, ids=ids)
        print(f"Индексировано {min(start + batch_size, len(docs))}/{len(docs)}", flush=True)
    manifest_path.write_text(json.dumps({**expected, "count": len(docs)}, ensure_ascii=False, indent=2) + "\n")
    building_path.unlink(missing_ok=True)
    print(f"RAG готов: {destination}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-dir", default=DB_DIR)
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()
    if args.batch_size < 1:
        parser.error("--batch-size должен быть положительным")
    build(args.db_dir, args.batch_size)
