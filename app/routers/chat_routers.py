from fastapi import APIRouter, Depends
from pydantic import BaseModel
from langgraph.types import Command
from dotenv import load_dotenv
from app.dependencies.load_Agent import load_agent
from app.services.chat_services import chat_services
from app.schemas.chat_schemas import ApprovalRequest,Toll_Request
load_dotenv()

router = APIRouter(tags=["chat Bot"])




@router.post("/chat")
def chat(prompt: str | None = None, thread_id: str = "default", agent = Depends(load_agent)):
    user_prompt = prompt or ""
    return chat_services(user_prompt=user_prompt, thread_id=thread_id, agent=agent)


@router.post("/approve")
def inttrupt_approve(request: ApprovalRequest, agent = Depends(load_agent)):
    config = {
        "configurable": {"thread_id": request.thread_id}
    }
     
    decision = (
        {"type": "approve"} if request.approve
        else {
            "type": "reject",
            "message": request.message or "User denied this action. Do not retry."
        }
    )
    
    # Check how many decisions are expected for batched interrupts
    state = agent.get_state(config)
    num_decisions = 1
    if hasattr(state, "tasks") and state.tasks:
        for task in state.tasks:
            for interrupt_item in getattr(task, "interrupts", []):
                val = getattr(interrupt_item, "value", None)
                if isinstance(val, dict) and "action_requests" in val:
                    num_decisions = max(num_decisions, len(val["action_requests"]))
    
    response = agent.invoke(
        Command(
            resume={
                "decisions": [decision] * num_decisions
            }
        ),
        
        config=config
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
        
    
    for msg in reversed(response.get("messages", [])):
        if getattr(msg, "content", None):
            return {"content": msg.content}
    return{"content": "Action processed."}


    

