"""
Shared configuration for Gemini Live API application.
"""
import os

# Vertex AI Configuration
GOOGLE_CLOUD_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "account-pocs")
GOOGLE_CLOUD_LOCATION = "us-central1"  # Gemini Live API requires us-central1
GOOGLE_APPLICATION_CREDENTIALS = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")

# Model Configuration - NEVER CHANGE THIS MODEL ID
MODEL_ID = "gemini-live-2.5-flash-native-audio"

# Audio Configuration
INPUT_SAMPLE_RATE = 16000  # 16kHz input from user microphone
OUTPUT_SAMPLE_RATE = 24000  # 24kHz output from model
AUDIO_CHANNELS = 1  # Mono
AUDIO_BIT_DEPTH = 16  # 16-bit PCM
AUDIO_ENCODING = "pcm"  # Raw PCM, little-endian

# VAD (Voice Activity Detection) Configuration
VAD_START_OF_SPEECH_SENSITIVITY = "START_SENSITIVITY_LOW"
VAD_END_OF_SPEECH_SENSITIVITY = "END_SENSITIVITY_HIGH"
VAD_PREFIX_PADDING_MS = 300
VAD_SILENCE_DURATION_MS = 800

# Timeout Configuration
USER_SILENCE_TIMEOUT_SECONDS = 5  # Default: warn after 5s of user silence
USER_SILENCE_TERMINATION_SECONDS = 2  # Terminate 2s after warning
MODEL_SILENCE_TIMEOUT_SECONDS = 10  # Warn if model silent for 10s

# WebSocket Configuration
WEBSOCKET_HOST = "0.0.0.0"
WEBSOCKET_PORT = 8000
CORS_ORIGINS = ["http://localhost:5173", "http://localhost:3000"]

# Response Configuration
RESPONSE_MODALITIES = ["AUDIO"]

# Voice Configuration
VOICE_NAME = "Kore"

# Dummy Function Configuration
DUMMY_FUNCTION_NAME = "run_task"
DUMMY_FUNCTION_DESCRIPTION = "Runs a simulated task for a pre-configured duration. The user will say 'start task <name>' to trigger this. Only the task name is needed — the duration is configured separately."
DEFAULT_TASK_DURATION_SECONDS = 10  # Default duration if not set by frontend

# Default System Instruction
DEFAULT_SYSTEM_INSTRUCTION = (
    "You are a helpful voice assistant. You can run tasks for the user. "
    "When the user asks you to run or start a task, call the run_task function with "
    "task_name set to the name they said and duration_seconds MUST be set to exactly {duration_seconds}. "
    "Never use any other duration value. Always use {duration_seconds} seconds."
)
