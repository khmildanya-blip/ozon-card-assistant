import json
import os
import tempfile
import uuid
from datetime import timedelta
from importlib.util import find_spec
from pathlib import Path
from typing import Any, List, Optional

import boto3
import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from category_search import search_categories

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    TokenResponse,
    UserLogin,
    UserRegister,
    create_access_token,
    get_current_user,
    get_db,
    get_password_hash,
    verify_password,
)
from database import Base, ProductDraft, User, engine

app = FastAPI(version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(CURRENT_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


class CategoryMatch(BaseModel):
    description_category_id: int = Field(gt=0)
    type_id: int = Field(gt=0)
    category_name: str


class CategoryRecognitionResponse(BaseModel):
    detected_keyword: Optional[str] = None
    category: Optional[CategoryMatch] = None
    category_error: Optional[str] = None
    candidates: List[CategoryMatch] = []


class ContentGenerationRequest(BaseModel):
    product_name: str
    key_features: List[str] = []
    description_category_id: Optional[int] = None
    type_id: Optional[int] = None


class ContentGenerationResponse(BaseModel):
    ozon_description: Optional[str] = None
    color: Optional[str] = None
    seo_keywords: List[str] = []
    raw_text: Optional[str] = None
    extracted_fields: Optional[dict] = None


class AttributeRequest(BaseModel):
    description_category_id: int
    type_id: int


class DraftCreateRequest(BaseModel):
    status: str = "draft"
    name: Optional[str] = None
    description: Optional[str] = None
    description_category_id: Optional[int] = None
    type_id: Optional[int] = None
    category_name: Optional[str] = None
    price: Optional[float] = None
    old_price: Optional[float] = None
    barcode: Optional[str] = None
    images: Optional[List[str]] = None
    picture_data: Optional[Any] = None
    card_data: Optional[Any] = None


class ValuesRequest(AttributeRequest):
    attribute_id: int
    last_value_id: int = 0
    limit: int = 100


class CategorySearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=200)
    limit: int = Field(default=20, ge=1, le=50)


@app.post("/api/auth/register")
async def register_user(user: UserRegister, db: Session = Depends(get_db)):
    """Регистрация нового пользователя"""
    existing_user = db.query(User).filter(User.username == user.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Имя пользователя уже занято")

    hashed_password = get_password_hash(user.password)
    new_user = User(username=user.username, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"message": "Пользователь зарегистрирован", "username": new_user.username}


@app.post("/api/auth/login", response_model=TokenResponse)
async def login_user(user: UserLogin, db: Session = Depends(get_db)):
    """Вход пользователя и получение JWT-токена"""
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверное имя пользователя или пароль")

    access_token = create_access_token(
        data={"sub": db_user.username},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": access_token, "token_type": "bearer"}


@app.post("/api/drafts")
def save_draft(
    draft: DraftCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Сохранение черновика, привязанного к пользователю"""
    draft_data = draft.model_dump()
    draft_data["user_id"] = current_user.id

    db_draft = ProductDraft(**draft_data)
    db.add(db_draft)
    db.commit()
    db.refresh(db_draft)
    return {"status": "success", "id": db_draft.id}


@app.get("/api/drafts")
def list_drafts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Список черновиков текущего пользователя"""
    drafts = (
        db.query(ProductDraft)
        .filter(ProductDraft.user_id == current_user.id)
        .order_by(ProductDraft.created_at.desc())
        .all()
    )
    return {"status": "success", "items": drafts}


async def _recognize_image(file: UploadFile) -> dict:
    """Проверка фото, вызов нейросети, возвращает dict результата."""
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Можно загружать только изображения")

    content = await file.read(10 * 1024 * 1024 + 1)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Максимальный размер фото — 10 МБ")

    suffix = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[file.content_type]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(content)
        temp_path = temp_file.name

    try:
        from recognizer import analyze_product
        return await run_in_threadpool(analyze_product, [temp_path])
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="Нейросеть не смогла определить товар. Попробуйте другое фото или найдите категорию по названию.",
        )
    except Exception as error:
        if getattr(error, "status_code", None) in (401, 403):
            raise HTTPException(
                status_code=502,
                detail="Yandex отклонил доступ. Проверьте YANDEX_API_KEY, YANDEX_FOLDER_ID и права сервисного аккаунта.",
            )
        if getattr(error, "status_code", None) == 404:
            raise HTTPException(
                status_code=502,
                detail="Модель распознавания Yandex не найдена. Проверьте YANDEX_MODEL в backend/.env.",
            )
        raise HTTPException(status_code=502, detail=f"Ошибка распознавания: {str(error)}")
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


@app.post("/api/recognize-category", response_model=CategoryRecognitionResponse)
async def recognize_category(file: UploadFile = File(...)):
    """Принимает фото, распознаёт товар и находит категорию Ozon через RAG"""
    from rag import find_ozon_category

    result_recognition = await _recognize_image(file)
    rag_keyword = result_recognition.get("rag_keyword")

    result = await run_in_threadpool(find_ozon_category, rag_keyword)

    if result.get("error"):
        return CategoryRecognitionResponse(
            detected_keyword=rag_keyword,
            category_error=result["error"],
            candidates=[],
        )

    return CategoryRecognitionResponse(
        detected_keyword=rag_keyword,
        category=CategoryMatch(**result),
        candidates=result.get("candidates", []),
    )


@app.post("/api/generate-content", response_model=ContentGenerationResponse)
async def generate_content(request: Request):
    """Генерирует описание, цвет и SEO-ключи.
    Принимает multipart/form-data с полями:
      - request: JSON-строка с product_name и key_features
      - file: опциональное фото товара
    """
    form = await request.form()

    raw_request = form.get("request")
    if not raw_request:
        raise HTTPException(
            status_code=422,
            detail='Поле request обязательно: {"product_name":"...","key_features":["..."]}',
        )

    try:
        req = ContentGenerationRequest(**json.loads(raw_request))
    except (json.JSONDecodeError, ValidationError):
        raise HTTPException(
            status_code=422,
            detail='request должен быть валидным JSON: {"product_name":"...","key_features":["..."]}',
        )

    # file может быть UploadFile или пустой строкой (Swagger шлёт '')
    file = form.get("file")
    has_file = file is not None and hasattr(file, "read")

    keywords = [req.product_name.lower()] + [f.lower() for f in req.key_features]
    description = None
    color = None
    raw_text = None
    extracted_fields = {}

    if has_file:
        result = await _recognize_image(file)
        description = result.get("ozon_description")
        color = result.get("color")
        raw_text = result.get("raw_text", "")

        if result.get("category") == "book":
            extracted_fields = {
                "title": result.get("title"),
                "author": result.get("author"),
                "publisher": result.get("publisher"),
                "year": result.get("year"),
                "isbn": result.get("isbn"),
                "pages_count": result.get("pages_count"),
                "cover_type": result.get("cover_type"),
                "color": result.get("color"),
            }
    else:
        description = (
            f"Описание для товара: {req.product_name}. "
            f"Особенности: {', '.join(req.key_features)}"
        )

    return ContentGenerationResponse(
        ozon_description=description,
        color=color,
        seo_keywords=keywords,
        raw_text=raw_text,
        extracted_fields=extracted_fields or None,
    )


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT_URL", "https://storage.yandexcloud.net"),
        aws_access_key_id=os.getenv("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("S3_SECRET_ACCESS_KEY"),
    )


@app.post("/api/upload-images")
async def upload_images(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
):
    """Загружает несколько фото в Yandex Object Storage, возвращает публичные URL"""
    bucket_name = os.getenv("S3_BUCKET_NAME")
    endpoint_url = os.getenv("S3_ENDPOINT_URL", "https://storage.yandexcloud.net").rstrip("/")
    if not bucket_name or not os.getenv("S3_ACCESS_KEY_ID") or not os.getenv("S3_SECRET_ACCESS_KEY"):
        raise HTTPException(status_code=503, detail="Не настроены ключи S3 в backend/.env")

    s3 = get_s3_client()
    uploaded_files = []

    for file in files:
        if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise HTTPException(
                status_code=400,
                detail=f"Файл {file.filename} не является допустимым изображением",
            )

        content = await file.read(10 * 1024 * 1024 + 1)
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"Файл {file.filename} превышает 10 МБ")

        ext = os.path.splitext(file.filename or "image.jpg")[1] or ".jpg"
        object_key = f"users/{current_user.id}/{uuid.uuid4().hex}{ext}"

        await run_in_threadpool(
            s3.put_object,
            Bucket=bucket_name,
            Key=object_key,
            Body=content,
            ContentType=file.content_type,
        )

        public_url = f"{endpoint_url}/{bucket_name}/{object_key}"
        uploaded_files.append({"filename": file.filename, "url": public_url})

    return {"status": "success", "files": uploaded_files}


async def ozon_request(method: str, payload: dict):
    headers = {
        "Client-Id": os.getenv("OZON_CLIENT_ID", ""),
        "Api-Key": os.getenv("OZON_API_KEY", ""),
    }
    if not all(headers.values()):
        raise HTTPException(503, "Задайте OZON_CLIENT_ID и OZON_API_KEY на backend")
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            response = await client.post(
                f"https://api-seller.ozon.ru/v1/description-category/{method}",
                headers=headers,
                json=payload,
            )
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, "Не удалось получить данные Ozon. Повторите запрос позже.")


@app.post("/api/get-category-attributes")
async def get_category_attributes(request: AttributeRequest):
    """Список полей и метаданных для выбранной категории из Ozon API"""
    data = await ozon_request("attribute", {**request.model_dump(), "language": "RU"})
    return {"status": "success", "attributes": data.get("result", [])}


@app.get("/api/categories")
async def categories():
    return await ozon_request("tree", {"language": "RU"})


@app.post("/api/attribute-values")
async def attribute_values(request: ValuesRequest):
    return await ozon_request(
        "attribute/values",
        {**request.model_dump(), "limit": min(max(request.limit, 1), 1000), "language": "RU"},
    )


@app.post("/api/search-categories")
async def category_search(request: CategorySearchRequest):
    query = request.query.strip()
    if len(query) < 2:
        raise HTTPException(422, "Введите хотя бы два символа для поиска категории.")
    return await run_in_threadpool(search_categories, query, request.limit)


@app.get("/api/health")
async def health():
    from rag import DB_DIR

    return {
        "status": "ok",
        "service": "ozon-card-assistant",
        "api_version": "0.2.0",
        "capabilities": [
            "recognize-category",
            "generate-content",
            "upload-images",
            "search-categories",
            "get-category-attributes",
        ],
        "configuration": {
            "recognition": bool(os.getenv("YANDEX_API_KEY") and os.getenv("YANDEX_FOLDER_ID")),
            "category_refinement": bool(os.getenv("VSEGPT_API_KEY")),
            "ozon": bool(os.getenv("OZON_CLIENT_ID") and os.getenv("OZON_API_KEY")),
            "object_storage": bool(
                os.getenv("S3_BUCKET_NAME")
                and os.getenv("S3_ACCESS_KEY_ID")
                and os.getenv("S3_SECRET_ACCESS_KEY")
            ),
        },
        "rag": {
            "dependencies_installed": all(
                find_spec(name) is not None
                for name in ("langchain_chroma", "langchain_huggingface", "sentence_transformers")
            ),
            "index_exists": (Path(DB_DIR) / "chroma.sqlite3").is_file(),
        },
    }
