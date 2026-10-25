import os
from pathlib import Path

from fastapi import Depends, FastAPI,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import create_engine
from sqlmodel import SQLModel, Session,select
from app.dependencies.auth import current_user
from app.dependencies.db import Base, get_db
from app.models.expenses_model import ExpenseModel
from app.models.users_model import UsersModel
from app.routers.messages_router import router as messages_router
from app.routers.chat_routers import router as chat_router

from contextlib import asynccontextmanager

from app.dependencies.lifespan import lifespan

from app.routers.auth_routes import router as auth_router
from dotenv import load_dotenv

load_dotenv()


# Base.metadata.create_all(bind=engine)


app = FastAPI(title="Gen AI Assistant API", lifespan=lifespan)
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontent"


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get('/')
def get_frontend():
    index_path = FRONTEND_DIR / "index.html"
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "index.html not found"}



@app.get("/Health")
def health():
    return{
        "Msg":"running"
    }

@app.get('/style.css')
def get_style():
    return FileResponse(FRONTEND_DIR / "styles.css", media_type="text/css")


@app.get('/app.js')
def get_js():
    return FileResponse(FRONTEND_DIR / "app.js", media_type="text/javascript")


@app.get('/response.js')
def get_response_js():
    return FileResponse(FRONTEND_DIR / "response.js", media_type="text/javascript")


@app.get('/expenses.html')
def get_expenses_page():
    return FileResponse(FRONTEND_DIR / "expenses.html")




app.include_router(chat_router)
app.include_router(auth_router)
app.include_router(messages_router)

@app.get("/expenses")
def expenses_get(db:Session=Depends(get_db),user_id:int = Depends(current_user)):
  try:
    expense = db.exec(select(ExpenseModel).where(ExpenseModel.user_id == user_id)).all()
  except:
    raise HTTPException(detail="No expense",status_code=404)
  return expense
