
import datetime
import tempfile
import os
from fastapi import Depends, File, HTTPException, UploadFile
from sqlmodel import Session

from app.dependencies.db import get_db
from app.dependencies.load_Agent import load_agent
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langgraph.types import Command

from app.models.messages_model import MessageModel
from app.reposetory.chat_repo import chat_repo

import speech_recognition as sr
from pydub import AudioSegment

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
    
    
    
recognizer = sr.Recognizer()


def spech_to_text_service(audio: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp:
        temp_file_path = temp.name
        
    try: 
         sound = AudioSegment.from_file(audio.file)
         sound.export(temp_file_path, format="wav")
       
         with sr.AudioFile(temp_file_path) as source:
            audio_data = recognizer.record(source)
         text = recognizer.recognize_google(audio_data)
         
         return text
    except sr.UnknownValueError:
        raise HTTPException(status_code=400, detail="Could not understand the audio.")
    except sr.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Could not request results from Google Speech Recognition service; {e}")
    
    finally:
        
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        
        
        
    