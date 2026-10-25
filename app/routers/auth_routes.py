

from tokenize import generate_tokens

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.dependencies.auth import verify_refresh
from app.dependencies.db import get_db
from app.models.users_model import UsersModel
from app.schemas.Signup_schemas import LoginSchema, SignupSchema
from app.dependencies.security import password_hasher

from app.dependencies.auth import create_token, current_user, create_refresh_token


router = APIRouter(tags=["Authentication"])


@router.post("/refresh",status_code=200)
def refresh(token:str):

    new_token = verify_refresh(token)

    return {
            "access_token": new_token,
            "token_type": "Bearer"
        }




@router.post("/signup")
def signup(request:Request,signup_data: SignupSchema,db: Session = Depends(get_db)):
    user = db.query(UsersModel).filter(UsersModel.email == signup_data.email).first()
    if user:

        raise HTTPException(status_code=400, detail="User already exists")
    
    data = UsersModel(
        
        email=signup_data.email,
        username=signup_data.username,
        password=password_hasher.hash(signup_data.password))

    db.add(data)
    db.commit()
    db.refresh(data)
    return {"message": "User created successfully"}




@router.post("/login")
def login_json(login_data: LoginSchema, db: Session = Depends(get_db)):
    """JSON login endpoint for web and mobile frontends."""
    user = db.query(UsersModel).filter(UsersModel.email == login_data.email).first()
    if not user or not password_hasher.verify(login_data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    access_token = create_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {"username": user.username, "email": user.email},
        "message": "Login successful"
    }
