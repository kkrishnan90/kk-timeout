# Gemini Live API Voice Assistant

A real-time voice assistant powered by Google's Gemini Live API (`gemini-live-2.5-flash-native-audio`) on Vertex AI. Features configurable timeout management, function calling, and a three-panel dark-themed UI.

## Architecture

```
Browser (React Vite)  <-- WebSocket -->  FastAPI Backend  <-- google-genai SDK -->  Gemini Live API (Vertex AI)
      16kHz PCM mic ---->                                                              (us-central1)
      24kHz PCM playback <----                                                         model: gemini-live-2.5-flash-native-audio
```

- **Frontend**: React Vite app capturing 16kHz 16-bit PCM mono audio, encoding to base64, sending over WebSocket. Receives 24kHz PCM audio from the model, decodes and plays back using Web Audio API with buffer queue scheduling.
- **Backend**: FastAPI server that bridges the frontend WebSocket to the Gemini Live API via the `google-genai` Python SDK. Handles session lifecycle, audio forwarding, tool call execution, and timeout monitoring.

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- Google Cloud project with Vertex AI API enabled
- Application Default Credentials (ADC) configured

### Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

The backend starts on `http://localhost:8000`.

**Environment variables** (set in your shell profile or `.env`):

| Variable | Description | Default |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | `account-pocs` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account key JSON | (none) |

The location is hardcoded to `us-central1` as required by the Gemini Live API.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend starts on `http://localhost:5173`.

## UI Layout

The app has three panels:

| Panel | Purpose |
|---|---|
| **Left** | Session controls, system instructions, timeout settings, status indicators, function invocation hints |
| **Center** | Chat-style transcript with user (right-aligned) and model (left-aligned) bubbles, live speaking indicators, inline timeout status chips |
| **Right** | Function call cards showing name, arguments, progress bar, status badge, and response |

## Configuration (Pre-Session)

All settings are configured in the left panel **before** starting a session. They are locked during an active session.

| Setting | Default | Description |
|---|---|---|
| System Instructions | Pre-filled | Instructions sent to the model. Includes function invocation guidance. |
| Client Mic Input Timeout | 5 seconds | How long the user can be silent before a warning is shown. After the warning, the session terminates in 2 more seconds. |
| Model Response Timeout | 10 seconds | How long to wait for the model to respond after the user speaks. Must be higher than mic timeout. Can be disabled via checkbox. |
| Enable (checkbox) | Checked | When unchecked, the model response timeout is completely disabled for free-flow conversation. |
| Task Duration | 10 seconds | Duration the simulated `run_task` function runs for. The backend enforces this value regardless of what the model sends. |
| Simulated Model Latency | 0 seconds | Adds an artificial delay before the backend forwards model responses. Used to test the model response timeout. |

## Audio

| Direction | Sample Rate | Format | Encoding |
|---|---|---|---|
| User to Model | 16,000 Hz | 16-bit PCM | Little-endian, mono |
| Model to User | 24,000 Hz | 16-bit PCM | Little-endian, mono |

Audio capture uses `AudioContext` with `ScriptProcessorNode`. Playback uses a buffer queue with `AudioBufferSourceNode` scheduling for seamless output.

## Voice Activity Detection (VAD)

Native server-side VAD is configured on the Gemini Live API session:

| Parameter | Value | Description |
|---|---|---|
| `start_of_speech_sensitivity` | `LOW` | Less sensitive to speech onset — reduces false triggers |
| `end_of_speech_sensitivity` | `HIGH` | More sensitive to speech end — detects pauses quickly |
| `prefix_padding_ms` | `300` | 300ms of audio buffered before detected speech start |
| `silence_duration_ms` | `800` | 800ms of silence before speech is considered ended |

## Function Calling

A dummy `run_task` function is registered with the model. The user triggers it by voice.

**How to invoke**: Say "start task deploy" or "run task backup". The model calls `run_task(task_name="deploy", duration_seconds=N)`.

The backend **always uses the Task Duration value from the UI**, ignoring whatever `duration_seconds` the model provides. Progress updates are sent at 1-second intervals.

Example phrases are shown in the left panel.

## Timeout System

There are two independent timeouts that manage session lifecycle. They follow a turn-based activation model.

### How Turns Are Detected

| Event | Source | What it means |
|---|---|---|
| `input_transcript` | Backend receives `input_transcription` from Gemini | User finished speaking. It is now the **model's turn**. |
| `audio_output` | Backend forwards `model_turn` audio from Gemini | Model is actively responding. |
| `output_transcript` | Backend forwards `output_transcription` from Gemini | Model speech transcribed. |
| `turn_complete` | Backend forwards `turn_complete` from Gemini | Model finished its turn. It is now the **user's turn**. |
| `interrupted` | Backend forwards `interrupted` from Gemini | User interrupted the model mid-speech (barge-in). |
| Speech activity detected | Frontend `useAudioCapture` hook detects mic amplitude above threshold | User is currently speaking (local detection, not a server event). |

### Timeout 1: Client Mic Input Timeout

**Purpose**: Ends the session if the user is silent for too long.

**When it starts**: After `turn_complete` (model finishes speaking, user's turn begins). Also starts at session setup and when the user unmutes.

**When it fires**: After `userSilenceTimeout` seconds (default 5s) of no voice activity detected from the microphone.

**What happens when it fires**:
1. A warning banner appears: "No voice input detected. Session will end in 2 seconds..."
2. After 2 more seconds (`userSilenceTerminationSeconds`), if still no voice activity, the session terminates: WebSocket closes, audio buffers clear, mic stops.

**When it resets**: Whenever speech activity is detected from the microphone (amplitude exceeds threshold).

**When it is cleared/paused**:
- When user finishes speaking (`input_transcript` received) — it is now the model's turn
- When mic is muted
- When a function is running

**Guard checks before firing**: At the moment the timer fires, it re-checks `modelSpeakingRef` and `toolCallActiveRef`. If the model started responding or a function started running since the timer was set, the timer silently skips without terminating.

### Timeout 2: Model Response Timeout

**Purpose**: Ends the session if the model does not respond within the configured time.

**When it starts**: After `input_transcript` (user finishes speaking, model's turn begins).

**When it fires**: After `modelSilenceTimeout` seconds (default 10s) with no `audio_output` or `output_transcript` received from the model.

**What happens when it fires**:
- **Frontend**: Adds system message "Session ended: Model not responding and no functions running." and calls `endSession()` (closes WebSocket, clears audio buffers, stops mic).
- **Backend**: The `model_silence_monitor` (if enabled) sends a `model_timeout` message and sets `stop_event` to terminate the server-side session.

**When it resets/clears**: When `audio_output`, `output_transcript`, or `activity_start` is received (model started responding). Also clears on `turn_complete`.

**When it is disabled**:
- When the "Enable" checkbox is unchecked (pre-session setting). The backend skips creating the `model_silence_monitor` task entirely.
- During function execution (`toolCallActiveRef` is true) — the timer callback shows a warning instead of terminating.

**Constraint**: Model response timeout must always be greater than client mic input timeout. The UI enforces this: changing the mic timeout auto-bumps the model timeout if needed. At session start, an additional guard ensures `modelSilenceTimeout >= userSilenceTimeout + 1`.

### Timeout State Matrix

The table below shows what happens to each timeout in every possible session state.

| Session State | Mic Timeout | Model Response Timeout | Reason |
|---|---|---|---|
| **Session not active** | Inactive | Inactive | No session running |
| **User's turn** (after `turn_complete`, user hasn't spoken yet) | **ACTIVE** | Inactive | Waiting for user to speak. If user is silent for N seconds, session terminates. |
| **User speaking** (speech activity detected) | Timer resets on each activity | Inactive | User is actively providing input. Timer keeps resetting. |
| **Model's turn** (after `input_transcript`, before model responds) | Inactive | **ACTIVE** | User finished speaking. Waiting for model to respond within N seconds. |
| **Model speaking** (receiving `audio_output`) | Inactive | Inactive (cleared) | Model is actively responding. Both timeouts paused. |
| **Model turn complete** (`turn_complete` received) | **ACTIVE** (restarts) | Inactive (cleared) | Model finished. Back to user's turn. Mic timeout begins again. |
| **User interrupted model** (`interrupted` received) | Timer state unchanged | Inactive (cleared) | Model stopped. Timeout state depends on whether user continues speaking. |
| **Function running** (`tool_call` active) | Inactive | Inactive | Both timeouts paused. Even if the timer callback fires, it checks `toolCallActiveRef` and skips. |
| **Function complete, model responds with `turn_complete`** | **ACTIVE** (restarts) | Inactive | Back to user's turn after function result delivered. |
| **Mic muted** | Inactive (cleared) | Depends on turn | Mic timeout pauses while muted. Restarts when unmuted. Model timeout unaffected. |
| **Model timeout disabled** (checkbox unchecked) | Normal behavior | Inactive always | `startModelSilenceTimer()` returns immediately. Backend does not create `model_silence_monitor`. |

### Turn Flow Diagram

```
Session Start
     |
     v
[User's Turn] -- mic timeout ACTIVE, model timeout INACTIVE
     |
     | (user speaks, speech activity detected)
     | mic timeout keeps resetting
     |
     | (user stops speaking, input_transcript received)
     v
[Model's Turn] -- mic timeout INACTIVE (cleared), model timeout ACTIVE
     |
     |--- (model responds with audio_output) --> model timeout cleared
     |    model continues sending audio...
     |
     |--- (turn_complete) --> back to [User's Turn]
     |                        mic timeout ACTIVE again
     |
     |--- (model calls function) --> [Function Running]
     |    both timeouts INACTIVE
     |    function executes with progress updates
     |    function completes, result sent to model
     |    model responds, sends turn_complete
     |    --> back to [User's Turn]
     |
     |--- (model timeout fires, no response) --> SESSION TERMINATED
     |
     |--- (user interrupts, interrupted received) --> model timeout cleared
          model stops, depends on user action
```

### Simulated Model Latency (Testing)

The "Simulated Model Latency" setting (pre-session, default 0) adds an artificial delay in the backend before forwarding model responses. This is used to test the model response timeout.

**How it works**:
1. `pending_latency` flag is set to `true` at session start
2. When the first `model_turn` audio chunk arrives, the backend sleeps for the configured latency duration
3. During the sleep, all model output (audio and transcripts) is buffered
4. After the sleep, buffered responses are flushed and forwarded normally
5. On `turn_complete` or `interrupted`, `pending_latency` resets to `true` so the next model turn is also delayed

**Testing the model timeout**: Set simulated latency to 15 seconds and model response timeout to 10 seconds. After speaking, the model's response is held for 15 seconds by the backend. The 10-second model timeout fires first, terminating the session before the delayed response arrives.

## WebSocket Protocol

### Frontend to Backend

| Message | Fields | Description |
|---|---|---|
| `setup` | `system_instruction`, `user_silence_timeout`, `model_silence_timeout`, `task_duration`, `simulate_model_latency`, `model_timeout_enabled` | Sent once after WebSocket connects. Configures the Gemini session. |
| `audio` | `data` (base64) | 16kHz PCM audio chunk from the microphone. |
| `stop` | (none) | Client requests session termination. |

### Backend to Frontend

| Message | Fields | Description |
|---|---|---|
| `setup_complete` | (none) | Gemini session is ready. |
| `audio_output` | `data` (base64) | 24kHz PCM audio chunk from the model. |
| `input_transcript` | `text` | Transcription of user speech. |
| `output_transcript` | `text` | Transcription of model speech. |
| `turn_complete` | (none) | Model finished its response turn. |
| `interrupted` | (none) | User interrupted the model. |
| `tool_call` | `id`, `name`, `args` | Model initiated a function call. |
| `tool_call_status` | `id`, `name`, `status`, `progress` | Function execution progress update. |
| `tool_response` | `id`, `name`, `response`, `status` | Function execution completed. |
| `go_away` | `time_left` | User silence warning with remaining time. |
| `model_timeout` | `message` | Model response timeout fired. Backend terminates the session. |
| `error` | `message` | Error message. |

## Project Structure

```
lk-timeout/
  backend/
    config.py           # All backend configuration constants
    main.py             # FastAPI WebSocket server
    requirements.txt    # Python dependencies
  frontend/
    src/
      config.js         # Frontend configuration
      App.jsx           # Main app: state, timeout logic, session management
      App.css            # Dark theme styles
      index.css         # CSS variables, fonts, animations
      main.jsx          # React entry point
      components/
        LeftPanel.jsx   # Controls, settings, status indicators
        CenterPanel.jsx # Transcript display, inline timeout chips
        RightPanel.jsx  # Function call cards
      hooks/
        useWebSocket.js     # WebSocket connection and message routing
        useAudioCapture.js  # 16kHz mic capture, PCM encoding, speech detection
        useAudioPlayback.js # 24kHz buffered audio playback
    index.html
    package.json
    vite.config.js
```
