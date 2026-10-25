from datetime import datetime, timedelta, timezone
from fastapi import Depends,HTTPException
from jose import jwt,JWTError
from fastapi.security import OAuth2,OAuth2PasswordBearer,oauth2
from dotenv import load_dotenv
import os
load_dotenv()
oauth_schema = OAuth2PasswordBearer(tokenUrl="/login")


SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
EXPIRE_TIME = 5
EXPIRE_TIME_DAYS = 5

def create_token(data:dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=EXPIRE_TIME)
    to_encode.update({'exp':expire})
    token = jwt.encode(to_encode,SECRET_KEY,algorithm=ALGORITHM)
    return token

def current_user(token: str = Depends(oauth_schema)):
    try:
        payload =jwt.decode(token,SECRET_KEY,algorithms=[ALGORITHM])
        user_id:int = payload.get("sub")
        if user_id is None:
            raise HTTPException(detail="Invalid user token",status_code=401)
        return int(user_id)
    except JWTError as e:
        raise HTTPException(detail=f"Invalid token: {e}",status_code=401) from e
    
    
    
def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=EXPIRE_TIME_DAYS)
    to_encode.update({'exp': expire})
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return token


def verify_refresh(token: str ):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: int = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token: missing user")
        
        new_token = create_token({"sub":str(username)})

        return new_token


    except JWTError as e:
        raise HTTPException(status_code=401, detail="Invalid credentials or expired token")
    except Exception as e:
        raise HTTPException(status_code=401, detail="Token validation failed")
