import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List
from rag import get_chain


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


UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

chain = get_chain()


class DescriptionRequest(BaseModel):
    product_name: str
    key_features: List[str]


class DescriptionResponse(BaseModel):
    generated_text: str
    seo_keywords: List[str]


@app.post("/api/generate-description", response_model=DescriptionResponse)
async def generate_description(request: DescriptionRequest):
    """Генерация текста через ИИ"""

    question = f"Найди категорию для товара: {request.product_name}. Особенности: {', '.join(request.key_features)}"
    result = chain.invoke(question)
    generated_text = result["answer"]
    seo_keywords = [request.product_name.lower()] + [f.lower() for f in request.key_features]
    return DescriptionResponse(
        generated_text=generated_text,
        seo_keywords=seo_keywords
    )


@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """Загрузка фотографии от фронта"""
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Можно загружать только изображения")

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    image_url = f"/uploads/{file.filename}"
    return {"status": "success", "url": image_url, "filename": file.filename}