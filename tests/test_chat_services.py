import inspect
from unittest.mock import MagicMock, patch

from app.routers.chat_routers import chat, microphone


def test_chat_endpoint_is_sync_for_threadpool_execution():
    """
    FastAPI executes synchronous `def` endpoints in a threadpool worker thread
    via anyio.to_thread.run_sync, whereas `async def` endpoints run on the main
    event loop thread.

    LangGraph's AsyncPostgresSaver strictly forbids synchronous calls (such as
    agent.invoke inside chat_services) from the main asyncio event loop thread,
    raising asyncio.InvalidStateError: Synchronous calls to AsyncPostgresSaver
    are only allowed from a different thread.

    Therefore, the chat endpoint must NOT be a coroutine function (it must be
    defined with `def`, not `async def`).
    """
    assert not inspect.iscoroutinefunction(chat), (
        "chat endpoint in app/routers/chat_routers.py is defined as `async def`, "
        "which causes LangGraph AsyncPostgresSaver to raise InvalidStateError (HTTP 500) "
        "when called from the main thread. It must be defined as synchronous `def`."
    )

def test_microphone_endpoint_is_sync_for_threadpool_execution():
    """
    The microphone endpoint must also be synchronous `def` so that:
    1. Blocking audio conversion and speech recognition do not freeze the main asyncio loop.
    2. Synchronous chat_services and agent.invoke execute in a worker thread without
       triggering AsyncPostgresSaver InvalidStateError.
    """
    assert not inspect.iscoroutinefunction(microphone), (
        "microphone endpoint must be synchronous `def` to avoid blocking the event loop "
        "and to avoid AsyncPostgresSaver thread conflicts."
    )

def test_chat_endpoint_delegates_to_chat_services():
    mock_db = object()
    mock_agent = object()
    with patch("app.routers.chat_routers.chat_services", return_value={"content": "OK"}) as mock_cs:
        res = chat(prompt="Spent 250 on lunch", db=mock_db, agent=mock_agent, user_id=42)
        assert res == {"content": "OK"}
        mock_cs.assert_called_once_with(
            user_prompt="Spent 250 on lunch", thread_id="42", agent=mock_agent, db=mock_db
        )

def test_chat_endpoint_handles_empty_prompt():
    mock_db = object()
    mock_agent = object()
    with patch("app.routers.chat_routers.chat_services", return_value={"content": "OK"}) as mock_cs:
        res = chat(prompt=None, db=mock_db, agent=mock_agent, user_id=1)
        assert res == {"content": "OK"}
        mock_cs.assert_called_once_with(
            user_prompt="", thread_id="1", agent=mock_agent, db=mock_db
        )

def test_microphone_endpoint_delegates_to_chat_services():
    mock_audio = MagicMock()
    mock_db = object()
    mock_agent = object()
    with patch("app.routers.chat_routers.spech_to_text_service", return_value="Biriyani 250") as mock_stt, \
         patch("app.routers.chat_routers.chat_services", return_value={"content": "Added ₹250 for Biriyani"}) as mock_cs:
        res = microphone(audio=mock_audio, db=mock_db, agent=mock_agent, user_id=5)
        assert res == {"content": "Added ₹250 for Biriyani"}
        mock_stt.assert_called_once_with(mock_audio)
        mock_cs.assert_called_once_with(
            user_prompt="Biriyani 250", thread_id="5", agent=mock_agent, db=mock_db
        )
