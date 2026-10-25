import time
from datetime import datetime
from langchain.tools import tool
from sqlmodel import Session
from app.dependencies.db import engine
from app.models.expenses_model import ExpenseModel
from langchain_core.runnables import RunnableConfig
from sqlmodel import Session, select

@tool
def delete_expense(expense_id: int, title: str, amount: float, category: str, config: RunnableConfig = None):
    """Delete an existing expense.
    Args:
        expense_id: The ID of the expense to delete.
        title: The title of the expense to delete.
        amount: The amount of the expense to delete.
        category: The category of the expense to delete.
    """
    with Session(engine) as db:
        expense = db.exec(
            select(ExpenseModel).where(
                ExpenseModel.id == expense_id,
                ExpenseModel.title == title,
                ExpenseModel.amount == amount,
                ExpenseModel.category == category,
                ExpenseModel.user_id == config.get("configurable", {}).get("user_id")
            )).first()
        if expense and expense.user_id == config.get("configurable", {}).get("user_id"):
            db.delete(expense)
            db.commit()
            return f"Expense deleted successfully."
        else:
            return "Expense not found or not owned by the user."
    
    