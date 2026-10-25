from app.dependencies.db import expenses
from langchain.tools import tool


@tool
def fetch_expenses(start: int = 0, stop: int = 50):
    '''Fetch recorded expenses with optional start and stop range.'''
    return expenses[start:stop]

    