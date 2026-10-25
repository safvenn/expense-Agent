
from fastapi import Depends

from app.dependencies.load_Agent import load_agent
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langgraph.types import Command


def chat_services(user_prompt:str,thread_id:str,agent):

    
    response = agent.invoke(
        {
            "messages": [
                HumanMessage(content=user_prompt)
            ]
        },
        config={"configurable": {"thread_id": thread_id}}
    )
    if "__interrupt__" in response:
        data =response["__interrupt__"][-1].value
        action = data["action_requests"][0]
        review = data["review_configs"][0]
    
        return {
            "id":response["__interrupt__"][-1].id,
            "name":action["name"],
            "args":action["args"],
            "description":action["description"],
            "allowed_decitions": review["allowed_decisions"]
        }
    
    return {"content":response["messages"][-1].content}