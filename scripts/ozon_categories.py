import os
import requests
import json
from pathlib import Path

def fetch_ozon_category_tree(client_id, api_key):
    url = "https://api-seller.ozon.ru/v1/description-category/tree"
    
    headers = {
        "Client-Id": client_id,
        "Api-Key": api_key,
        "Content-Type": "application/json"
    }
    
    payload = {
        "language": "RU"
    }
    
    print("Отправляем запрос к Ozon API...")
    response = requests.post(url, headers=headers, json=payload)
    
    if response.status_code == 200:
        data = response.json()
        
        # Сохраняем результат в файл для дальнейшей работы
        with open(Path(__file__).resolve().parents[1] / "data" / "ozon_categories.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        print("Дерево категорий успешно сохранено в ozon_categories.json")
        return data
    else:
        print(f"Ошибка {response.status_code}: {response.text}")
        return None

if __name__ == "__main__":
    client_id = os.environ.get("OZON_CLIENT_ID")
    api_key = os.environ.get("OZON_API_KEY")
    if not client_id or not api_key:
        raise SystemExit("Задайте OZON_CLIENT_ID и OZON_API_KEY в переменных окружения.")
    fetch_ozon_category_tree(client_id, api_key)
