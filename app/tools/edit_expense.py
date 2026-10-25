import time
from datetime import datetime
from langchain.tools import tool
from sqlmodel import Session
from app.dependencies.db import engine
from app.models.expenses_model import ExpenseModel
from langchain_core.runnables import RunnableConfig
from sqlmodel import Session, select

@tool
def edit_expense(expense_id: int, title: str, amount: float, category: str,date: datetime, config: RunnableConfig = None):
    """Edit an existing expense.
    Args:
        expense_id: The ID of the expense to edit.
        title: The new title of the expense.
        amount: The new amount of the expense.
        category: The new category of the expense.
        date: The date of the expense.
    """
    with Session(engine) as db:
        expense = db.exec(
            select(ExpenseModel).where(
                ExpenseModel.id == expense_id,
                ExpenseModel.user_id == config.get("configurable", {}).get("user_id")
            )).first()
        if expense and expense.user_id == config.get("configurable", {}).get("user_id"):
            expense.title = title
            expense.amount = amount
            expense.category = category
            expense.date = date
            db.commit()
            return f"Expense edited successfully."
        else:
            return "Expense not found or not owned by the user."