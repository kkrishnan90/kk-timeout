/**
 * Shared configuration for Gemini Live API frontend application.
 */

const config = {
  // WebSocket Configuration
  wsUrl: "ws://localhost:8000/ws",

  // Audio Configuration
  inputSampleRate: 16000,   // 16kHz input to model
  outputSampleRate: 24000,  // 24kHz output from model
  audioChannels: 1,         // Mono
  audioBitDepth: 16,        // 16-bit PCM

  // Timeout Configuration (defaults, user can change on UI)
  userSilenceTimeoutSeconds: 5,     // Warn after 5s of user silence
  userSilenceTerminationSeconds: 2, // Terminate 2s after warning
  modelSilenceTimeoutSeconds: 10,   // Warn if model silent for 10s

  // Task Duration Configuration (user can change on UI)
  defaultTaskDurationSeconds: 10,   // Default duration for run_task function

  // Default System Instruction
  defaultSystemInstruction:
    "You are a helpful voice assistant. You can run tasks for the user. " +
    "When the user asks you to run or start a task, call the run_task function with " +
    "task_name set to the name they said and duration_seconds MUST be set to exactly {duration_seconds}. " +
    "Never use any other duration value. Always use {duration_seconds} seconds.",

  // Function invocation hint for UI
  functionHint:
    'Say "start task [name]" to trigger a function call. Duration is set via the Task Duration input above.',

  // Example phrases to trigger the function
  functionExamples: [
    '"Start task deploy"',
    '"Start task backup"',
    '"Run task data cleanup"',
    '"Start task health check"',
  ],

  // Simulate model latency default (seconds, 0 = no simulation)
  defaultSimulateModelLatency: 0,

  // Audio buffer configuration
  audioBufferSize: 4096,
  playbackBufferDuration: 0.1, // 100ms buffer for smooth playback
};

export default config;
