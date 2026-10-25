from fastapi import APIRouter, Depends, HTTPException
from dotenv import load_dotenv
from sqlmodel import Session
from app.dependencies.auth import current_user
from app.dependencies.db import get_db
from app.dependencies.load_Agent import load_agent
from langchain_core.messages import (
    HumanMessage,
    AIMessage,
    SystemMessage,
    ToolMessage,
)

from app.models.messages_model import MessageModel

load_dotenv()

router = APIRouter(tags=["message"])



@router.get("/messages")
def get_message_history(limit: int = 10, offset: int = 0, agent=Depends(load_agent), user_id: int = Depends(current_user), db: Session = Depends(get_db)):
    """
    Retrieve the message history for the current user.
    """
    # Fetch messages from the database for the current user
    messages = db.query(MessageModel).filter(MessageModel.user_id == user_id).order_by(MessageModel.id.desc()).offset(offset).limit(limit).all()

    # Convert messages to a list of dictionaries for response
    message_history = [
        {
            "id": msg.id,
            "content": msg.content,
            "role": msg.role,
            "date": msg.date.isoformat(),
        }
        for msg in messages
    ]

    return {"messages": message_history}
    
