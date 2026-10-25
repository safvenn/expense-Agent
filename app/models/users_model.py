from sqlalchemy import Column, Integer, String,Float

from app.dependencies.db import Base



class UsersModel(Base):
    __tablename__ ="users"
    id = Column(Integer,primary_key=True,nullable=False)
    username = Column(String)
    password = Column(String)
    email = Column(String)