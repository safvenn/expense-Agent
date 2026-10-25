from fastapi.requests import Request


def load_agent(request:Request):
    return request.app.state.agent