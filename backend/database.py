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

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://root:password@localhost:3306/ozon_cards",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class ProductDraft(Base):
    __tablename__ = "product_drafts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True)
    status = Column(String(32), default="draft")

    description_category_id = Column(BigInteger, nullable=True)
    type_id = Column(BigInteger, nullable=True)
    category_name = Column(String(500), nullable=True)

    offer_id = Column(String(255), nullable=True)
    name = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    barcode = Column(String(100), nullable=True)

    price = Column(Numeric(10, 2), nullable=True)
    old_price = Column(Numeric(10, 2), nullable=True)
    vat = Column(String(10), default="0")
    currency_code = Column(String(10), default="RUB")

    weight = Column(Integer, nullable=True)
    weight_unit = Column(String(10), default="g")
    depth = Column(Integer, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    dimension_unit = Column(String(10), default="mm")

    primary_image = Column(String(1000), nullable=True)
    images = Column(JSON, nullable=True)
    attributes = Column(JSON, nullable=True)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())