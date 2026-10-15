import json
from pathlib import Path


def flatten_categories(categories, current_path=None, current_desc_id=None, flat_list=None):
    if current_path is None:
        current_path = []
    if flat_list is None:
        flat_list = []

    for item in categories:
        # Если это узел-родитель (есть category_name)
        if "category_name" in item:
            new_path = current_path + [item["category_name"]]
            new_desc_id = item.get("description_category_id", current_desc_id)
            flatten_categories(item.get("children", []), new_path, new_desc_id, flat_list)

        # Если это конечный товар (есть type_name)
        elif "type_name" in item:
            full_path = " -> ".join(current_path + [item["type_name"]])
            flat_list.append({
                "text_path": full_path,
                "description_category_id": current_desc_id,
                "type_id": item["type_id"]
            })

    return flat_list


# Запуск скрипта
with open(Path(__file__).resolve().parents[1] / 'data' / 'ozon_categories.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Предполагается, что категории лежат в корне по ключу "result"
flat_data = flatten_categories(data['result'])

# Сохраняем результат в новый файл
with open(Path(__file__).resolve().parents[1] / 'data' / 'flat_categories.json', 'w', encoding='utf-8') as f:
    json.dump(flat_data, f, ensure_ascii=False, indent=2)

print(f"Готово! Обработано конечных категорий: {len(flat_data)}")