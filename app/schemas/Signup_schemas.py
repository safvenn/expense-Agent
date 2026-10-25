from pydantic import BaseModel
from pydantic.networks import EmailStr

class SignupSchema(BaseModel):
    email: EmailStr
    username: str
    password: str

class LoginSchema(BaseModel):
    email: EmailStr
    password: str