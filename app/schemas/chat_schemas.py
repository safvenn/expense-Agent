from pydantic import BaseModel
from app.schemas.expenses_schema import expense_schema

class ApprovalRequest(BaseModel):
    thread_id: str = "default"
    interrupt_id: str | None = None
    approve: bool = True
    message: str | None = None
    

class Toll_Request(BaseModel):
 intterupt_id :str = ''
 Tool_name:str
 args:expense_schema
 description:str
 allowed_decisions:list