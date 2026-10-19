import os
import tempfile
import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
from rag import find_ozon_category
from recognizer import analyze_product


load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

app = FastAPI(
    version="0.1.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(CURRENT_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


class DescriptionRequest(BaseModel):
    product_name: str
    key_features: List[str]


class DescriptionResponse(BaseModel):
    generated_text: str
    seo_keywords: List[str]
    description_category_id: Optional[int] = None
    type_id: Optional[int] = None
    category_name: Optional[str] = None
    error: Optional[str] = None


class RecognitionResponse(BaseModel):
    rag_keyword: str
    ozon_description: str


class AttributeRequest(BaseModel):
    description_category_id: int
    type_id: int


@app.post("/api/generate-description", response_model=DescriptionResponse)
async def generate_description(request: DescriptionRequest):
    """Генерация текста через ИИ и поиск категории"""

    question = f"Найди категорию для товара: {request.product_name}. Особенности: {', '.join(request.key_features)}"
    result = find_ozon_category(question)
    seo_keywords = [request.product_name.lower()] + [f.lower() for f in request.key_features]
    
    if "error" in result:
        return DescriptionResponse(
            generated_text="Не удалось определить категорию.",
            seo_keywords=seo_keywords,
            error=result["error"]
        )
    
    return DescriptionResponse(
        generated_text=f"Товар: {request.product_name}. Категория: {result.get('category_name')}",
        seo_keywords=seo_keywords,
        description_category_id=result.get("description_category_id"),
        type_id=result.get("type_id"),
        category_name=result.get("category_name")
    )


@app.post("/api/get-category-attributes")
async def get_category_attributes(request: AttributeRequest):
    """Получение обязательных полей для выбранной категории напрямую из Ozon API"""
    url = "https://api-seller.ozon.ru/v1/description-category/attribute"
    
    headers = {
        "Client-Id": os.getenv("OZON_CLIENT_ID", ""),
        "Api-Key": os.getenv("OZON_API_KEY", ""),
        "Content-Type": "application/json"
    }
    
    payload = {
        "description_category_id": request.description_category_id,
        "type_id": request.type_id,
        "language": "RU"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload)
        
        if response.status_code == 200:
            data = response.json()
            attributes = data.get("result", [])
            required_attrs = [
                {
                    "name": attr.get("name"),
                    "id": attr.get("id"),
                    "type": attr.get("type"),
                    "is_required": attr.get("is_required")
                }
                for attr in attributes if attr.get("is_required")
            ]
            
            return {"status": "success", "attributes": required_attrs}
        else:
            raise HTTPException(
                status_code=response.status_code, 
                detail=f"Ошибка Ozon API: {response.text}"
            )


@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """Загрузка фотографии"""
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Можно загружать только изображения")

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    image_url = f"/uploads/{file.filename}"
    return {"status": "success", "url": image_url, "filename": file.filename}


@app.post("/api/recognize-image", response_model=RecognitionResponse)
async def recognize_image(file: UploadFile = File(...)):
    """Распознавание изображения с помощью нейросети"""
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Можно загружать только изображения")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as temp_file:
        content = await file.read()
        temp_file.write(content)
        temp_path = temp_file.name
    
    try:
        result = analyze_product(temp_path)
        return RecognitionResponse(
            rag_keyword=result["rag_keyword"],
            ozon_description=result["ozon_description"]
        )
    except ValueError as e:
        raise HTTPException(status_code=500, detail=f"Некорректный формат: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при обработке изображения: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
