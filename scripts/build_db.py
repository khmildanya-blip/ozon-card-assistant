import json
from pathlib import Path, os
from langchain_core.documents import Document
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

DB_DIR = str(Path(__file__).resolve().parents[1] / "chroma_db")
COLLECTION = "ozon_categories"

def build():
    flat_docs = []
    with open(Path(__file__).resolve().parents[1] / "data" / "flat_docs.jsonl", encoding="utf-8") as f:
        for line in f:
            flat_docs.append(json.loads(line))

    chunks = [
        Document(page_content=d["page_content"], metadata=d["metadata"])
        for d in flat_docs
    ]

    embeddings = HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-base")

    db = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=DB_DIR,
        collection_name=COLLECTION,
    )
    print(f"БД построена: {len(chunks)} документов → {DB_DIR}")


if __name__ == "__main__":
    build()