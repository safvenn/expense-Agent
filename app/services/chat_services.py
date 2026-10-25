
import datetime

from fastapi import Depends
from sqlmodel import Session

from app.dependencies.db import get_db
from app.dependencies.load_Agent import load_agent
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langgraph.types import Command

from app.models.messages_model import MessageModel
from app.reposetory.chat_repo import chat_repo


def chat_services(user_prompt:str,thread_id:str,agent,db):
    
    user_id = int(thread_id) if str(thread_id).isdigit() else None
    chat_repo(content={"content": user_prompt}, role="user", user_id=user_id, db=db)
    
    response = agent.invoke(
        {
            "messages": [
                HumanMessage(content=user_prompt)
            ]
        },
        config={"configurable": {"thread_id": thread_id, "user_id": user_id}}
    )


    if "__interrupt__" in response:
        data =response["__interrupt__"][-1].value
        action = data["action_requests"][0]
        review = data["review_configs"][0]
        
        chat_repo(content={"content": data}, role="tool", user_id=user_id, db=db)

        return {
            "id":response["__interrupt__"][-1].id,
            "name":action["name"],
            "args":action["args"],
            "description":action["description"],
            "allowed_decitions": review["allowed_decisions"]
        }
    
    content = response["messages"][-1].content if response.get("messages") else "No response from agent."
    chat_repo(content={"content": content}, role="assistant", user_id=user_id, db=db)
    return {
        "content": content
    }