from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, UploadFile
from sqlmodel import Session

from app.dependencies.auth import current_user
from app.dependencies.db import get_db
from app.dependencies.load_Agent import load_agent
from app.schemas.chat_schemas import ApprovalRequest
from app.services.chat_services import chat_services, spech_to_text_service
from app.services.tool_approve_service import handle_interrupt

load_dotenv()

router = APIRouter(tags=["chat Bot"])


@router.post("/chat")
def chat(
    prompt: str | None = None,
    db: Session = Depends(get_db),
    agent=Depends(load_agent),
    user_id: int = Depends(current_user),
):
    user_prompt = prompt or ""
    return chat_services(
        user_prompt=user_prompt, thread_id=str(user_id), agent=agent, db=db
    )


@router.post("/microphone")
def microphone(
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    agent=Depends(load_agent),
    user_id: int = Depends(current_user),
):
    user_prompt = spech_to_text_service(audio)
    return chat_services(
        user_prompt=user_prompt, thread_id=str(user_id), agent=agent, db=db
    )


@router.post("/approve")
def interrupt_approve(
    request: ApprovalRequest,
    agent=Depends(load_agent),
    user_id: int = Depends(current_user),
    db: Session = Depends(get_db),
):
    return handle_interrupt(agent=agent, user_id=user_id, request=request, db=db)
