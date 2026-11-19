# from groq import Groq
# import sounddevice as sd
# import queue
# import numpy as np
# import threading
# import io
# import os
# import wave
# from dotenv import load_dotenv

# load_dotenv()
# api_key = os.getenv("GROQ_API_KEY")
# if not api_key:
#   raise RuntimeError("GROQ_API_KEY is not set. Add it to the environment or a .env file.")

# client = Groq(api_key=api_key)

# # with open("/content/Record (online-voice-recorder.com).mp3", "rb") as audio:
# #     transcription = client.audio.transcriptions.create(
# #         file=audio,
# #         model="whisper-large-v3",
# #         language="en"
# #     )

# # print(transcription.text)




# samplerate = 16000
# block_duration = 0.5
# chunk_duration  = 2
# frame_per_block = int(samplerate*block_duration)
# frame_per_chunk = int(samplerate*chunk_duration)


# audio_queue = queue.Queue()
# audio_buffer = []

# def audio_callback(indata,frames,time,status):
#   if status:
#     print(status)
#   audio_queue.put(indata.copy())
# def recorder():
#   with sd.InputStream(samplerate=samplerate,channels=1,callback=audio_callback,blocksize=frame_per_block):
#     print("Litsening........press Ctrl+C to stop.")
#     while True:
#       sd.sleep(100)

# def transcriber():
#   while True:
#     block = audio_queue.get()
#     audio_buffer.append(block)

#     total_frames = sum(len(b) for b in audio_buffer)
#     if total_frames >= frame_per_chunk:
#       audio_data = np.concatenate(audio_buffer)[:frame_per_chunk]
#       audio_buffer.clear()
#       audio_data = audio_data.flatten()
#       pcm_data = np.clip(audio_data, -1.0, 1.0)
#       pcm_data = (pcm_data * 32767).astype(np.int16)

#       wav_buffer = io.BytesIO()
#       with wave.open(wav_buffer, "wb") as wav_file:
#         wav_file.setnchannels(1)
#         wav_file.setsampwidth(2)
#         wav_file.setframerate(samplerate)
#         wav_file.writeframes(pcm_data.tobytes())

#       transcription = client.audio.transcriptions.create(
#         file=("audio.wav", wav_buffer.getvalue(), "audio/wav"),
#         model="whisper-large-v3",
#         language="en",
#       )
#       if transcription.text.strip():
#         print(transcription.text.strip())

# threading.Thread(target=recorder, daemon=True).start()
# transcriber()



import speech_recognition as sr

recognizer = sr.Recognizer()

with sr.Microphone() as source:
    print("speak....")
    
    recognizer.adjust_for_ambient_noise(source)
    audio = recognizer.listen(source)
    
    try:
        text = recognizer.recognize_google(audio)
        print("You said: " + text)
    except sr.UnknownValueError:
        print("Sorry, I could not understand the audio.")
    except sr.RequestError as e:
        print("Could not request results from Google Speech Recognition service; {0}".format(e))