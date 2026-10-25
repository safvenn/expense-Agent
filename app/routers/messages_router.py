

@router.post("/messages")
def chat(thread_id: str = "default"):
    config = {"configurable": {"thread_id": thread_id}}

# Get conversation state
    state = agent.get_state(config)

# Extract all messages
    messages = state.values["messages"]

    for msg in messages:
        msg.pretty_print()
