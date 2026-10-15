import requests
import json
from pathlib import Path

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

client_id = '5584268'
api_key = '2a6a4be6-9a67-4a53-a555-656346e16be6'

category_to_check = 17028715
type_to_check = 96250

fetch_category_attributes(client_id, api_key, category_to_check, type_to_check)