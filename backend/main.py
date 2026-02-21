"""
FastAPI WebSocket backend for Gemini Live API.
Bridges a React frontend to Google's Gemini Live streaming API via WebSocket.
"""

import asyncio
import base64
import json
import logging
import traceback

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types

from config import (
    GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION,
    MODEL_ID,
    INPUT_SAMPLE_RATE,
    OUTPUT_SAMPLE_RATE,
    RESPONSE_MODALITIES,
    VOICE_NAME,
    VAD_START_OF_SPEECH_SENSITIVITY,
    VAD_END_OF_SPEECH_SENSITIVITY,
    VAD_PREFIX_PADDING_MS,
    VAD_SILENCE_DURATION_MS,
    DUMMY_FUNCTION_NAME,
    DUMMY_FUNCTION_DESCRIPTION,
    DEFAULT_SYSTEM_INSTRUCTION,
    DEFAULT_TASK_DURATION_SECONDS,
    WEBSOCKET_HOST,
    WEBSOCKET_PORT,
    CORS_ORIGINS,
    USER_SILENCE_TIMEOUT_SECONDS,
    USER_SILENCE_TERMINATION_SECONDS,
    MODEL_SILENCE_TIMEOUT_SECONDS,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Gemini Live API Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Vertex AI client
client = genai.Client(
    vertexai=True,
    project=GOOGLE_CLOUD_PROJECT,
    location=GOOGLE_CLOUD_LOCATION,
)


def build_live_config(system_instruction: str) -> types.LiveConnectConfig:
    """Build the LiveConnectConfig for a Gemini session."""
    start_sensitivity = getattr(
        types.StartSensitivity, VAD_START_OF_SPEECH_SENSITIVITY
    )
    end_sensitivity = getattr(
        types.EndSensitivity, VAD_END_OF_SPEECH_SENSITIVITY
    )

    return types.LiveConnectConfig(
        response_modalities=RESPONSE_MODALITIES,
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=VOICE_NAME
                )
            )
        ),
        realtime_input_config=types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(
                disabled=False,
                start_of_speech_sensitivity=start_sensitivity,
                end_of_speech_sensitivity=end_sensitivity,
                prefix_padding_ms=VAD_PREFIX_PADDING_MS,
                silence_duration_ms=VAD_SILENCE_DURATION_MS,
            )
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        system_instruction=system_instruction,
        tools=[
            {
                "function_declarations": [
                    {
                        "name": DUMMY_FUNCTION_NAME,
                        "description": DUMMY_FUNCTION_DESCRIPTION,
                        "parameters": {
                            "type": "OBJECT",
                            "properties": {
                                "task_name": {
                                    "type": "STRING",
                                    "description": "Name of the task to run",
                                },
                                "duration_seconds": {
                                    "type": "INTEGER",
                                    "description": "Duration in seconds. This value is pre-configured by the user — always use the value specified in the system instructions.",
                                },
                            },
                            "required": ["task_name", "duration_seconds"],
                        },
                    }
                ]
            }
        ],
    )


async def send_json(ws: WebSocket, message: dict):
    """Send a JSON message to the frontend WebSocket, ignoring errors on closed sockets."""
    try:
        await ws.send_json(message)
    except Exception:
        pass


async def handle_tool_call(
    ws: WebSocket,
    session,
    tool_call,
    cancelled_tool_ids: set,
    default_duration: int = DEFAULT_TASK_DURATION_SECONDS,
):
    """Handle a tool_call from Gemini by simulating the task and sending progress updates."""
    for fc in tool_call.function_calls:
        task_name = fc.args.get("task_name", "unknown")
        # Always use the UI-configured duration, ignore any model-provided value
        duration_seconds = default_duration
        tool_id = fc.id

        logger.info(
            "Tool call: %s(task_name=%s, duration=%ds) id=%s",
            fc.name,
            task_name,
            duration_seconds,
            tool_id,
        )

        # Notify frontend of tool call
        await send_json(ws, {
            "type": "tool_call",
            "id": tool_id,
            "name": fc.name,
            "args": {"task_name": task_name, "duration_seconds": duration_seconds},
        })

        # Simulate running the task with progress updates
        steps = max(duration_seconds, 1)
        sleep_per_step = duration_seconds / steps

        for i in range(steps):
            if tool_id in cancelled_tool_ids:
                logger.info("Tool call %s cancelled during execution", tool_id)
                return
            await asyncio.sleep(sleep_per_step)
            progress = int(((i + 1) / steps) * 100)
            await send_json(ws, {
                "type": "tool_call_status",
                "id": tool_id,
                "name": fc.name,
                "status": "running",
                "progress": progress,
            })

        if tool_id in cancelled_tool_ids:
            logger.info("Tool call %s cancelled after execution", tool_id)
            return

        result = {"result": f"Task '{task_name}' completed successfully after {duration_seconds} seconds."}

        # Notify frontend of completion
        await send_json(ws, {
            "type": "tool_response",
            "id": tool_id,
            "name": fc.name,
            "response": result,
            "status": "completed",
        })

        # Send tool response back to Gemini
        await session.send_tool_response(
            function_responses=[
                types.FunctionResponse(
                    id=tool_id,
                    name=fc.name,
                    response=result,
                )
            ]
        )
        logger.info("Tool response sent for %s", tool_id)


async def receive_from_client(
    ws: WebSocket,
    session,
    stop_event: asyncio.Event,
    activity_event: asyncio.Event,
):
    """Read messages from the frontend WebSocket and forward audio to Gemini."""
    try:
        while not stop_event.is_set():
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=0.5)
            except asyncio.TimeoutError:
                continue

            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "audio":
                audio_b64 = msg.get("data", "")
                audio_bytes = base64.b64decode(audio_b64)
                activity_event.set()
                await session.send_realtime_input(
                    audio=types.Blob(
                        data=audio_bytes,
                        mime_type=f"audio/pcm;rate={INPUT_SAMPLE_RATE}",
                    )
                )
            elif msg_type == "stop":
                logger.info("Client requested stop")
                stop_event.set()
                break

    except WebSocketDisconnect:
        logger.info("Client WebSocket disconnected")
        stop_event.set()
    except Exception as e:
        logger.error("Error in receive_from_client: %s", e)
        stop_event.set()


async def receive_from_gemini(
    ws: WebSocket,
    session,
    stop_event: asyncio.Event,
    cancelled_tool_ids: set,
    model_activity_event: asyncio.Event,
    task_duration: int = DEFAULT_TASK_DURATION_SECONDS,
    simulate_model_latency: int = 0,
):
    """Read responses from Gemini and forward to the frontend WebSocket."""
    tool_tasks: list[asyncio.Task] = []
    # Latency simulation: delay ALL model output (audio + transcript) until
    # the latency period has elapsed after the model starts responding.
    # The flag resets after each turn_complete so every new turn gets delayed.
    pending_latency = simulate_model_latency > 0  # True = next model turn should be delayed
    latency_sleeping = False
    # Buffer to hold responses during latency sleep
    buffered_responses: list[dict] = []
    try:
        async for response in session.receive():
            if stop_event.is_set():
                break

            # Handle server_content (audio, transcripts, turn events)
            sc = response.server_content
            if sc is not None:
                # Input transcription (user speech) — always forward immediately
                if sc.input_transcription is not None and sc.input_transcription.text:
                    await send_json(ws, {
                        "type": "input_transcript",
                        "text": sc.input_transcription.text,
                    })

                # Audio from model turn — apply latency delay
                if sc.model_turn is not None:
                    for part in sc.model_turn.parts:
                        if part.inline_data is not None:
                            # Apply latency delay on first model audio of this turn
                            if pending_latency and not latency_sleeping:
                                latency_sleeping = True
                                logger.info(
                                    "Simulating model latency: holding all model output for %ds",
                                    simulate_model_latency,
                                )
                                await asyncio.sleep(simulate_model_latency)
                                pending_latency = False
                                latency_sleeping = False
                                if stop_event.is_set():
                                    break
                                # Flush any buffered responses
                                for buf_msg in buffered_responses:
                                    await send_json(ws, buf_msg)
                                buffered_responses.clear()

                            model_activity_event.set()
                            audio_b64 = base64.b64encode(
                                part.inline_data.data
                            ).decode("utf-8")
                            await send_json(ws, {
                                "type": "audio_output",
                                "data": audio_b64,
                            })

                # Output transcription (model speech) — buffer during latency
                if sc.output_transcription is not None and sc.output_transcription.text:
                    msg = {"type": "output_transcript", "text": sc.output_transcription.text}
                    if latency_sleeping:
                        buffered_responses.append(msg)
                    else:
                        await send_json(ws, msg)

                # Turn complete — reset latency flag for next turn
                if sc.turn_complete:
                    await send_json(ws, {"type": "turn_complete"})
                    if simulate_model_latency > 0:
                        pending_latency = True

                # Interrupted
                if sc.interrupted:
                    await send_json(ws, {"type": "interrupted"})
                    if simulate_model_latency > 0:
                        pending_latency = True

            # Handle tool calls
            if response.tool_call is not None:
                task = asyncio.create_task(
                    handle_tool_call(
                        ws, session, response.tool_call, cancelled_tool_ids,
                        default_duration=task_duration,
                    )
                )
                tool_tasks.append(task)

            # Handle tool call cancellation
            if response.tool_call_cancellation is not None:
                for cid in response.tool_call_cancellation.ids:
                    logger.info("Tool call cancelled by Gemini: %s", cid)
                    cancelled_tool_ids.add(cid)

    except Exception as e:
        if not stop_event.is_set():
            logger.error("Error in receive_from_gemini: %s\n%s", e, traceback.format_exc())
            await send_json(ws, {"type": "error", "message": str(e)})
    finally:
        stop_event.set()
        # Wait for any running tool tasks to finish
        for t in tool_tasks:
            t.cancel()
        if tool_tasks:
            await asyncio.gather(*tool_tasks, return_exceptions=True)


async def user_silence_monitor(
    ws: WebSocket,
    session,
    stop_event: asyncio.Event,
    activity_event: asyncio.Event,
    user_silence_timeout: int,
):
    """Monitor for user silence and send a go_away warning, then terminate."""
    termination_seconds = USER_SILENCE_TERMINATION_SECONDS
    while not stop_event.is_set():
        activity_event.clear()
        try:
            await asyncio.wait_for(
                _wait_for_event_or_stop(activity_event, stop_event),
                timeout=user_silence_timeout,
            )
        except asyncio.TimeoutError:
            if stop_event.is_set():
                break
            # User has been silent for user_silence_timeout seconds
            logger.info("User silence detected (%ds), sending go_away", user_silence_timeout)
            await send_json(ws, {
                "type": "go_away",
                "time_left": f"{termination_seconds}s",
            })
            # Give the model a nudge so it says goodbye
            try:
                await session.send_realtime_input(
                    audio=types.Blob(
                        data=b"\x00\x00" * INPUT_SAMPLE_RATE,  # 1 second of silence
                        mime_type=f"audio/pcm;rate={INPUT_SAMPLE_RATE}",
                    )
                )
            except Exception:
                pass

            # Wait for activity or termination
            activity_event.clear()
            try:
                await asyncio.wait_for(
                    _wait_for_event_or_stop(activity_event, stop_event),
                    timeout=termination_seconds,
                )
            except asyncio.TimeoutError:
                if not stop_event.is_set():
                    logger.info("User silence termination after go_away warning")
                    await send_json(ws, {
                        "type": "go_away",
                        "time_left": "0s",
                    })
                    stop_event.set()
                    break


async def model_silence_monitor(
    ws: WebSocket,
    stop_event: asyncio.Event,
    model_activity_event: asyncio.Event,
    model_silence_timeout: int,
):
    """Monitor for model silence and terminate if no response within timeout."""
    while not stop_event.is_set():
        model_activity_event.clear()
        try:
            await asyncio.wait_for(
                _wait_for_event_or_stop(model_activity_event, stop_event),
                timeout=model_silence_timeout,
            )
        except asyncio.TimeoutError:
            if stop_event.is_set():
                break
            logger.warning("Model silence timeout (%ds) — terminating session", model_silence_timeout)
            await send_json(ws, {
                "type": "model_timeout",
                "message": f"Model did not respond within {model_silence_timeout}s",
            })
            stop_event.set()
            break


async def _wait_for_event_or_stop(event: asyncio.Event, stop_event: asyncio.Event):
    """Wait until either event is set or stop_event is set."""
    while not event.is_set() and not stop_event.is_set():
        await asyncio.sleep(0.1)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """Main WebSocket endpoint that bridges the frontend to Gemini Live API."""
    await ws.accept()
    logger.info("WebSocket client connected")

    stop_event = asyncio.Event()
    activity_event = asyncio.Event()
    model_activity_event = asyncio.Event()
    cancelled_tool_ids: set = set()

    try:
        # Wait for setup message
        setup_raw = await asyncio.wait_for(ws.receive_text(), timeout=30)
        setup_msg = json.loads(setup_raw)

        if setup_msg.get("type") != "setup":
            await send_json(ws, {"type": "error", "message": "Expected setup message"})
            await ws.close()
            return

        task_duration = setup_msg.get(
            "task_duration", DEFAULT_TASK_DURATION_SECONDS
        )
        system_instruction = setup_msg.get("system_instruction", DEFAULT_SYSTEM_INSTRUCTION)
        # Inject the task duration into the system instruction
        system_instruction = system_instruction.format(duration_seconds=task_duration)
        user_silence_timeout = setup_msg.get(
            "user_silence_timeout", USER_SILENCE_TIMEOUT_SECONDS
        )
        model_silence_timeout = setup_msg.get(
            "model_silence_timeout", MODEL_SILENCE_TIMEOUT_SECONDS
        )
        simulate_model_latency = int(setup_msg.get("simulate_model_latency", 0))
        model_timeout_enabled = bool(setup_msg.get("model_timeout_enabled", True))

        logger.info(
            "Setup: task_duration=%ds, user_silence_timeout=%ds, model_silence_timeout=%ds, "
            "simulate_model_latency=%ds, model_timeout_enabled=%s",
            task_duration,
            user_silence_timeout,
            model_silence_timeout,
            simulate_model_latency,
            model_timeout_enabled,
        )

        # Build config and connect to Gemini
        config = build_live_config(system_instruction)

        async with client.aio.live.connect(
            model=MODEL_ID, config=config
        ) as session:
            logger.info("Connected to Gemini Live API")
            await send_json(ws, {"type": "setup_complete"})

            # Run concurrent tasks
            tasks = [
                asyncio.create_task(
                    receive_from_client(ws, session, stop_event, activity_event),
                    name="receive_from_client",
                ),
                asyncio.create_task(
                    receive_from_gemini(
                        ws, session, stop_event, cancelled_tool_ids,
                        model_activity_event, task_duration=task_duration,
                        simulate_model_latency=simulate_model_latency,
                    ),
                    name="receive_from_gemini",
                ),
                asyncio.create_task(
                    user_silence_monitor(
                        ws, session, stop_event, activity_event, user_silence_timeout
                    ),
                    name="user_silence_monitor",
                ),
            ]
            if model_timeout_enabled:
                tasks.append(
                    asyncio.create_task(
                        model_silence_monitor(
                            ws, stop_event, model_activity_event, model_silence_timeout
                        ),
                        name="model_silence_monitor",
                    )
                )

            # Wait for any task to finish (usually means stop_event was set)
            done, pending = await asyncio.wait(
                tasks, return_when=asyncio.FIRST_COMPLETED
            )

            # Cancel remaining tasks
            stop_event.set()
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)

            # Check for exceptions in completed tasks
            for task in done:
                if task.exception():
                    logger.error(
                        "Task %s raised: %s", task.get_name(), task.exception()
                    )

    except asyncio.TimeoutError:
        logger.error("Timeout waiting for setup message")
        await send_json(ws, {"type": "error", "message": "Setup timeout"})
    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error("WebSocket error: %s\n%s", e, traceback.format_exc())
        await send_json(ws, {"type": "error", "message": str(e)})
    finally:
        stop_event.set()
        logger.info("WebSocket session ended")
        try:
            await ws.close()
        except Exception:
            pass


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=WEBSOCKET_HOST, port=WEBSOCKET_PORT)
