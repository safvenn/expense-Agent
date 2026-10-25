from sqlmodel import Session

from app.schemas.expenses_schema import expense_schema
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import create_engine
from dotenv import load_dotenv
import os
load_dotenv()


db_url = os.environ["DATABASE_URL"]
engine = create_engine(db_url,echo=True,future=True)
SessionLocal = sessionmaker(
    bind=engine,
    class_=Session,
    expire_on_commit=False
)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        
Base = declarative_base()