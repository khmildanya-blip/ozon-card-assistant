import os
import requests
import json
from pathlib import Path
from rag import find_ozon_category

def fetch_category_attributes(client_id, api_key, category_id, type_id):
    url = "https://api-seller.ozon.ru/v1/description-category/attribute"

    headers = {
        "Client-Id": client_id,
        "Api-Key": api_key,
        "Content-Type": "application/json"
    }
    
    payload = {
        "description_category_id": category_id,
        "type_id": type_id,
        "language": "RU"
    }
    
    print(f"Запрашиваем список атрибутов для категории {category_id} и типа {type_id}...")
    response = requests.post(url, headers=headers, json=payload)
    
    if response.status_code == 200:
        data = response.json()
        
        filename = f"attributes_{category_id}_{type_id}.json"
        
        with open(Path(__file__).resolve().parents[1] / "data" / filename, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        print(f"Атрибуты успешно сохранены в файл {filename}")
        
        print("\nОБЯЗАТЕЛЬНЫЕ ПОЛЯ ДЛЯ ЗАПОЛНЕНИЯ:")
        attributes = data.get("result", [])
        for attr in attributes:
            if attr.get("is_required"):
                # Выводим название, ID и тип данных, чтобы понимать, что именно Ozon ждет в этом поле
                print(f"- {attr.get('name')} (ID: {attr.get('id')}, Тип значения: {attr.get('type')})")
                
        return data
    else:
        print(f"Ошибка {response.status_code}: {response.text}")
        return None

if __name__ == "__main__":
    client_id = os.environ.get("OZON_CLIENT_ID")
    api_key = os.environ.get("OZON_API_KEY")
    if not client_id or not api_key:
        raise SystemExit("Задайте OZON_CLIENT_ID и OZON_API_KEY в переменных окружения.")

    user_query = "книги" # запрос на поиск конкретного предмета
    rag_result = find_ozon_category(user_query)

    print(f"Запрос был: {user_query}. Система нашла подходящую категорию: {rag_result['category_name']}.")
    ans = input("Подходит ли данная категория под ваш товар? Y/N\n")
    if ans.lower() == "y":
        fetch_category_attributes(client_id, api_key, rag_result["description_category_id"], rag_result["type_id"])
    else:
        exit()
