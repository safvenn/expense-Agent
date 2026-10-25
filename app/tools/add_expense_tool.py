import time
from langchain.tools import tool
from app.dependencies.db import expenses

@tool
def add_expense(title: str, amount: float, category: str = "Other"):
    """Record a new expense.
    Args:
        title: Short title or name of the expense (e.g. Biriyani, Petrol).
        amount: Numerical amount spent (e.g. 230, 500).
        category: Category of the expense (Food, Transport, Shopping, Bills, Entertainment, Health, Education, Other).
    """
    item = {
        'id': int(time.time() * 1000) % 100000,
        'title': title,
        'ammount': amount,
        'category': category
    }
    expenses.append(item)
    return f"Added ₹{amount} for {title} under {category}."


