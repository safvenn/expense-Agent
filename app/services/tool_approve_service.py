from langgraph.types import Command
from app.reposetory.chat_repo import chat_repo


def handle_interrupt(agent, user_id, request, db=None):

    config = {
        "configurable": {"thread_id": str(user_id), "user_id": user_id},
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
            if db is not None:
                chat_repo(content={'content': msg.content}, role="assistant", user_id=user_id, db=db)
            return {"content": msg.content}
    if db is not None:
        chat_repo(content={'content': "Action processed."}, role="assistant", user_id=user_id, db=db)
    return {"content": "Action processed."}
