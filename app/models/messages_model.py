from sqlalchemy import Column, ForeignKey, Integer, String,Float,DateTime, JSON

from app.dependencies.db import Base


class MessageModel(Base):
    __tablename__ = "messages"
    id = Column(Integer,primary_key=True,nullable=False,autoincrement=True)
    content = Column(JSON,nullable=False)
    role = Column(String)
    date = Column(DateTime,nullable=False)
    user_id = Column(Integer,ForeignKey("users.id",ondelete='CASCADE'),nullable=False,index=True)
