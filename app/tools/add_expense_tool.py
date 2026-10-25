import time
from datetime import datetime
from langchain.tools import tool
from langchain_core.runnables import RunnableConfig
from sqlmodel import Session
from app.dependencies.db import engine
from app.models.expenses_model import ExpenseModel


@tool
def add_expense(title: str, amount: float, category: str = "Other", config: RunnableConfig = None):
    """Record a new expense.
    Args:
        title: Short title or name of the expense (e.g. Biriyani, Petrol).
        amount: Numerical amount spent (e.g. 230, 500).
        category: Category of the expense (Food, Transport, Shopping, Bills, Entertainment, Health, Education, Other).
    """
    configurable = config.get("configurable", {}) if config else {}
    user_id = configurable.get("user_id")
    if user_id is None and str(configurable.get("thread_id", "")).isdigit():
        user_id = int(configurable["thread_id"])
    if user_id is None:
        return "Error: User is not authenticated. Please log in to add expenses."

    with Session(engine) as db:
        item = ExpenseModel(
            id=int(time.time() * 1000) % 100000,
            user_id=user_id,
            title=title,
            amount=amount,
            category=category,
            date=datetime.now()
        )
        db.add(item)
        db.commit()
        return f"Added ₹{amount} for {title} under {category}."


