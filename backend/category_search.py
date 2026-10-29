"""Category discovery from the existing RAG index or the checked-in Ozon catalogue."""
import json
import logging
import re
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)
CATALOGUE_PATH = Path(__file__).resolve().parents[1] / "data" / "ozon_categories.json"


@lru_cache(maxsize=1)
def catalogue_categories():
    with CATALOGUE_PATH.open(encoding="utf-8") as source:
        tree = json.load(source)
    result = []

    def visit(nodes, parent_id=None, path=()):
        for node in nodes:
            if node.get("disabled"):
                continue
            names = (*path, node.get("category_name") or node.get("type_name") or "")
            if node.get("type_id") and parent_id:
                result.append({
                    "description_category_id": parent_id,
                    "type_id": node["type_id"],
                    "category_name": " → ".join(filter(None, names)),
                })
            else:
                visit(node.get("children", []), node.get("description_category_id") or parent_id, names)

    visit(tree.get("result", []))
    return tuple(result)


def normalized(text):
    return " ".join(re.findall(r"[\w]+", text.casefold().replace("ё", "е")))


def search_catalogue(query, limit=20):
    words = [word for word in normalized(query).split() if word not in {"для", "на", "и", "из", "с", "в", "по"}]
    if not words:
        return []
    scored = []
    for category in catalogue_categories():
        name = normalized(category["category_name"])
        matches = sum(word in name for word in words)
        # Names in the Ozon catalogue are often shorter than a product query:
        # e.g. "компьютерная мышь" must still find the actual type "Мышь".
        if not matches or matches < len(words) / 2:
            continue
        leaf = normalized(category["category_name"].split(" → ")[-1])
        leaf_matches = sum(word in leaf for word in words)
        score = (leaf == normalized(query), matches, leaf_matches, -len(leaf))
        scored.append((score, category))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [category for _, category in scored[:limit]]


def search_categories(query, limit=20):
    # Literal matches are useful for manual selection, even without AI services.
    literal = search_catalogue(query, limit)
    try:
        from rag import retrieve_category_candidates
        semantic = retrieve_category_candidates(query, top_k=limit)
    except Exception:
        logger.info("RAG unavailable; using the checked-in Ozon catalogue")
        return {
            "categories": literal,
            "source": "catalogue",
            "notice": "Поиск по сохранённому каталогу Ozon. Семантический поиск RAG сейчас недоступен.",
        }
    merged = {}
    for category in [*literal, *semantic]:
        merged.setdefault((category["description_category_id"], category["type_id"]), category)
    return {"categories": list(merged.values())[:limit], "source": "rag", "notice": ""}
