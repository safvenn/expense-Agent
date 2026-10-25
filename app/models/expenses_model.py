from sqlalchemy import Column, ForeignKey, Integer, String,Float,DateTime

from app.dependencies.db import Base


class ExpenseModel(Base):
    __tablename__ = "expenses"
    id = Column(Integer,primary_key=True,nullable=False)
    title = Column(String)
    amount = Column(Float)
    category = Column(String)
    date = Column(DateTime,nullable=False)
    user_id = Column(Integer,ForeignKey("users.id",ondelete='CASCADE'),nullable=False,index=True)
