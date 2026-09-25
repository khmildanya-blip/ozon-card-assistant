import json

def flatten_tree(nodes, parent_path="", parent_id=None):
    flat_list = []
    for node in nodes:
        name = node.get("category_name") or node.get("type_name")
        node_id = node.get("description_category_id") or node.get("type_id")
        current_path = f"{parent_path} > {name}" if parent_path else name
        text_repr = (
            f"Категория: {name}\n"
            f"Полный путь: {current_path}\n"
            f"ID: {node_id}\n"
            f"Тип ID: {'category' if 'description_category_id' in node else 'type'}"
        )
        flat_list.append({
            "page_content": text_repr,
            "metadata": {
                "id": node_id, "name": name, "path": current_path,
                "parent_id": parent_id, "level": current_path.count(">") + 1,
            },
        })
        if node.get("children"):
            flat_list.extend(flatten_tree(node["children"], current_path, node_id))
    return flat_list


if __name__ == "__main__":
    with open("ozon_categories.json", encoding="utf-8") as f:
        data = json.load(f)

    flat_docs = flatten_tree(data["result"])
    print(f"Всего узлов: {len(flat_docs)}")

    with open("flat_docs.jsonl", "w", encoding="utf-8") as f:
        for doc in flat_docs:
            f.write(json.dumps(doc, ensure_ascii=False) + "\n")

    print("flat_docs.jsonl сохранён")