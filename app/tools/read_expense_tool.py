from sqlmodel import Session, select
from langchain.tools import tool
from langchain_core.runnables import RunnableConfig

from app.dependencies.db import engine
from app.models.expenses_model import ExpenseModel


@tool
def fetch_expenses(limit: int = 10, offset: int = 0, config: RunnableConfig = None):
    '''Fetch recorded expenses with optional limit and offset range.'''
    configurable = config.get("configurable", {}) if config else {}
    user_id = configurable.get("user_id")
    if user_id is None and str(configurable.get("thread_id", "")).isdigit():
        user_id = int(configurable["thread_id"])
    if user_id is None:
        return "Error: User is not authenticated. Please log in to view expenses."

    with Session(engine) as db:
        expenses = db.exec(
            select(ExpenseModel)
            .where(ExpenseModel.user_id == user_id)
            .offset(offset)
            .limit(limit)
        ).all()

        if not expenses:
            return "No expenses found."

        serialized = [
            {
                "id": e.id,
                "title": e.title,
                "amount": e.amount,
                "category": e.category,
                "date": e.date.isoformat() if e.date else None,
            }
            for e in expenses
        ]
        return f"Expenses found: {serialized}"