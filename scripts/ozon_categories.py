import requests
import json
from pathlib import Path

def fetch_ozon_category_tree(client_id, api_key):
    url = "https://api-seller.ozon.ru/v1/description-category/tree"
    
    # Ключи теперь берутся из аргументов функции, а не захардкожены
    headers = {
        "Client-Id": '5584268',
        "Api-Key": '2a6a4be6-9a67-4a53-a555-656346e16be6',
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

# Раскомментированный вызов функции с передачей твоих ключей (не забудь заменить API-ключ на новый!)
fetch_ozon_category_tree('5584268', '2a6a4be6-9a67-4a53-a555-656346e16be6')