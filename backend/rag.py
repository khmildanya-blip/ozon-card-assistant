"""Lazy RAG initialization: starting FastAPI must not download models or require keys."""
import json
import os
import re
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "backend" / ".env")
DB_DIR = os.getenv("RAG_DB_DIR", str(ROOT / "chroma_db"))
COLLECTION = "ozon_categories"


EMBEDDING_MODEL = "intfloat/multilingual-e5-base"
MODEL_CACHE = ROOT / ".cache" / "models"


class RagUnavailable(RuntimeError):
    def __init__(self, message, code="rag_unavailable"):
        super().__init__(message)
        self.code = code


@lru_cache(maxsize=1)
def get_embeddings(local_files_only=False):
    try:
        from langchain_huggingface import HuggingFaceEmbeddings
    except ImportError:
        raise RagUnavailable("Не установлены зависимости RAG: .venv/bin/python -m pip install -r backend/requirements.txt", "rag_dependencies_missing")
    return HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
        cache_folder=str(MODEL_CACHE),
        model_kwargs={"local_files_only": local_files_only},
        encode_kwargs={"normalize_embeddings": True, "batch_size": 32},
    )


@lru_cache(maxsize=1)
def get_db():
    if (Path(DB_DIR) / "building.json").is_file():
        raise RagUnavailable("Индекс RAG ещё строится. Дождитесь завершения scripts/build_db.py.", "rag_index_building")
    if not (Path(DB_DIR) / "chroma.sqlite3").is_file():
        raise RagUnavailable("База RAG не подготовлена: .venv/bin/python scripts/build_db.py", "rag_index_missing")
    try:
        from langchain_chroma import Chroma
    except ImportError:
        raise RagUnavailable("Не установлены зависимости RAG: .venv/bin/python -m pip install -r backend/requirements.txt", "rag_dependencies_missing")
    return Chroma(persist_directory=DB_DIR, embedding_function=get_embeddings(local_files_only=True), collection_name=COLLECTION)


def retrieve_category_candidates(user_query: str, top_k: int = 8):
    docs = get_db().similarity_search(f"query: {user_query}", k=top_k, filter={"level": 3})
    candidates = {}
    for doc in docs:
        meta = doc.metadata
        if meta.get("level") != 3 or not meta.get("category_id") or not meta.get("id"):
            continue
        key = (int(meta["category_id"]), int(meta["id"]))
        candidates[key] = {
            "description_category_id": key[0],
            "type_id": key[1],
            "category_name": meta.get("path") or meta.get("name") or "",
        }
    return list(candidates.values())


def select_category_with_llm(user_query, candidates, api_key):
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url="https://api.vsegpt.ru/v1", timeout=60, max_retries=0)
    response = client.chat.completions.create(
        model=os.getenv("VSEGPT_MODEL", "deepseek/deepseek-v4.1-flash-alt-thinking"),
        messages=[
            {"role": "system", "content": "Выбери одну категорию Ozon только из кандидатов. Верни JSON с description_category_id и type_id, без markdown."},
            {"role": "user", "content": f"Товар: {user_query}\nКандидаты: {json.dumps(candidates, ensure_ascii=False)}"},
        ],
        temperature=0.0,
    )
    raw = (response.choices[0].message.content or "").strip()
    result = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", raw).strip())
    if not isinstance(result, dict):
        raise ValueError("Неверный формат категории")
    for candidate in candidates:
        if (candidate["description_category_id"], candidate["type_id"]) == (result.get("description_category_id"), result.get("type_id")):
            return candidate
    raise ValueError("Категория отсутствует среди результатов RAG")


def find_ozon_category(user_query: str, top_k: int = 8):
    try:
        candidates = retrieve_category_candidates(user_query, top_k)
    except RagUnavailable as error:
        return {"error": str(error), "error_code": error.code}
    except Exception:
        return {"error": "Не удалось загрузить модель или прочитать индекс RAG. Проверьте установку модели и базу chroma_db.", "error_code": "rag_retrieval_failed"}
    if not candidates:
        return {"error": "В индексе RAG нет подходящих типов товара. Проверьте построение базы или найдите категорию по названию.", "error_code": "rag_no_candidates"}
    # Retrieval itself already determines a real category. Optional LLM refinement
    # must not discard this result when VseGPT is unconfigured or unavailable.
    selected = candidates[0]
    source = "rag"
    notice = "Категория предложена поиском RAG. Проверьте её перед продолжением."
    api_key = os.getenv("VSEGPT_API_KEY")
    if api_key:
        try:
            selected = select_category_with_llm(user_query, candidates, api_key)
            source = "rag_llm"
            notice = ""
        except Exception:
            notice = "Уточнение категории через ИИ недоступно. Показан результат поиска RAG — проверьте категорию."
    return {**selected, "source": source, "notice": notice, "candidates": candidates}
