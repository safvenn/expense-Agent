from pydantic import BaseModel, Field
from typing import Optional


class expense_schema(BaseModel):
    id: Optional[int] = Field(default=None, description="unique id of the expense (auto-generated if omitted)")
    title: str = Field(description="title of the expense")
    ammount: float = Field(description="expense amount")
    category: str = Field(description="category of the expense [food, transport, shopping, bills, entertainment, health, education, other]")

