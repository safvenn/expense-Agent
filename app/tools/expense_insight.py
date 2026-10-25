from sqlmodel import Session, func, select
from langchain.tools import tool
from langchain_core.runnables import RunnableConfig

from app.dependencies.db import engine
from app.models.expenses_model import ExpenseModel


@tool
def expense_insight(config: RunnableConfig = None):
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
        top_categories = (
            db.exec(
                select(ExpenseModel.category, func.count(ExpenseModel.category).label("count"))
                .where(ExpenseModel.user_id == user_id)
                .group_by(ExpenseModel.category)
                .order_by(func.count(ExpenseModel.category).desc())
                .limit(3)
            ).all()
        )
        least_expenses = db.exec(
            select(ExpenseModel)
            .where(ExpenseModel.user_id == user_id)
            .order_by(ExpenseModel.amount.asc())
            .limit(3)
        ).all()
        top_month_expenses = db.exec(
            select(ExpenseModel)
            .where(ExpenseModel.user_id == user_id)
            .order_by(ExpenseModel.amount.desc())
            .limit(3)
        ).all()
        
        previus_month_expense_diff = db.exec(select(func.sum(ExpenseModel.amount))).one()[0]
        
        diff = previus_month_expense_diff - sum(e.amount for e in expenses if e.amount is not None)
        if diff > 0:
            diff_message = f"Your expenses have decreased by {diff} compared to the previous month."
        else:
            diff_message = f"Your expenses have increased by {abs(diff)} compared to the previous month."
        
        

        average_amount = db.exec(
            select(func.avg(ExpenseModel.amount))
            .where(ExpenseModel.user_id == user_id)
        ).one()[0]
        sum_of_amounts = sum(e.amount for e in expenses if e.amount is not None)
        return f"Expenses Insight:  Total amount: {sum_of_amounts} | Average amount: {average_amount} | Top categories: {', '.join([f'{cat.category}: {cat.count}' for cat in top_categories])} | Least expenses: {', '.join([f'{e.title}: {e.amount}' for e in least_expenses])} | Top monthly expenses: {', '.join([f'{e.title}: {e.amount}' for e in top_month_expenses])} | Previous month difference: {diff_message}"
        return f"Expenses found: {serialized}"