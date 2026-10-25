import datetime

from app.models.messages_model import MessageModel


def chat_repo(content: dict, role: str, user_id: int, db):


    user_message = MessageModel(
        content=content,
        date=datetime.datetime.now(),
        role=role,
        user_id=user_id
    )

    db.add(user_message)
    db.commit()
    db.refresh(user_message)

