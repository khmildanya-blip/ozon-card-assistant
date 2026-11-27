import os
from sqlalchemy import (
    BigInteger,
    Column,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    TIMESTAMP,
    create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func

DATABASE_URL = os.getenv("DATABASE_URL") or "sqlite:///./ozon_cards.db"
engine_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())


class ProductDraft(Base):
    __tablename__ = "product_drafts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True)
    status = Column(String(32), default="draft")
    name = Column(String(500), nullable=True)

    description_category_id = Column(BigInteger, nullable=True)
    type_id = Column(BigInteger, nullable=True)
    category_name = Column(String(500), nullable=True)

    picture_data = Column(JSON, nullable=True)

    card_data = Column(JSON, nullable=True)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
