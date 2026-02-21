import React, { useState, useCallback, useRef, useEffect } from 'react';
import config from './config.js';
import useWebSocket from './hooks/useWebSocket.js';
import useAudioCapture from './hooks/useAudioCapture.js';
import useAudioPlayback from './hooks/useAudioPlayback.js';
import LeftPanel from './components/LeftPanel.jsx';
import CenterPanel from './components/CenterPanel.jsx';
import RightPanel from './components/RightPanel.jsx';
import './App.css';

export default function App() {
  // Session state
  const [sessionActive, setSessionActive] = useState(false);
  const [systemInstruction, setSystemInstruction] = useState(config.defaultSystemInstruction);
  const [userSilenceTimeout, setUserSilenceTimeout] = useState(config.userSilenceTimeoutSeconds);
  const [modelSilenceTimeout, setModelSilenceTimeout] = useState(config.modelSilenceTimeoutSeconds);
  const [taskDuration, setTaskDuration] = useState(config.defaultTaskDurationSeconds);
  const [simulateModelLatency, setSimulateModelLatency] = useState(config.defaultSimulateModelLatency);
  const [modelTimeoutEnabled, setModelTimeoutEnabled] = useState(true);

  // Messages & tool calls
  const [messages, setMessages] = useState([]);
  const [toolCalls, setToolCalls] = useState([]);

  // Indicators
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [modelSpeaking, setModelSpeaking] = useState(false);
  const [turnComplete, setTurnComplete] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [modelThinking, setModelThinking] = useState(false);
  const [warningMessage, setWarningMessage] = useState(null);
  const [awaitingModelResponse, setAwaitingModelResponse] = useState(false);

  // Refs for timeout management
  const userSilenceTimerRef = useRef(null);
  const userSilenceTermTimerRef = useRef(null);
  const modelSilenceTimerRef = useRef(null);
  const sessionActiveRef = useRef(false);
  const userSpeakingRef = useRef(false);
  const toolCallActiveRef = useRef(false);
  const userSilenceTimeoutRef = useRef(config.userSilenceTimeoutSeconds);
  const modelSilenceTimeoutRef = useRef(config.modelSilenceTimeoutSeconds);
  const isMutedRef = useRef(false);
  const modelSpeakingRef = useRef(false);
  const modelTimeoutEnabledRef = useRef(true);
  const endSessionRef = useRef(null);

  // Track current partial model transcript
  const currentModelMsgRef = useRef(null);

  // Keep refs in sync
  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  useEffect(() => {
    userSilenceTimeoutRef.current = userSilenceTimeout;
  }, [userSilenceTimeout]);

  useEffect(() => {
    modelSilenceTimeoutRef.current = modelSilenceTimeout;
  }, [modelSilenceTimeout]);

  useEffect(() => {
    modelTimeoutEnabledRef.current = modelTimeoutEnabled;
  }, [modelTimeoutEnabled]);

  // --- Helper functions ---
  const addSystemMessage = useCallback((text) => {
    setMessages((prev) => [...prev, { role: 'system', text, timestamp: new Date() }]);
  }, []);

  const clearAllTimers = useCallback(() => {
    if (userSilenceTimerRef.current) {
      clearTimeout(userSilenceTimerRef.current);
      userSilenceTimerRef.current = null;
    }
    if (userSilenceTermTimerRef.current) {
      clearTimeout(userSilenceTermTimerRef.current);
      userSilenceTermTimerRef.current = null;
    }
    if (modelSilenceTimerRef.current) {
      clearTimeout(modelSilenceTimerRef.current);
      modelSilenceTimerRef.current = null;
    }
    setWarningMessage(null);
  }, []);

  // --- User Silence Timeout ---
  const startUserSilenceTimer = useCallback(() => {
    if (userSilenceTimerRef.current) clearTimeout(userSilenceTimerRef.current);
    if (userSilenceTermTimerRef.current) clearTimeout(userSilenceTermTimerRef.current);
    setWarningMessage(null);

    if (!sessionActiveRef.current || isMutedRef.current) return;

    userSilenceTimerRef.current = setTimeout(() => {
      if (!sessionActiveRef.current || isMutedRef.current) return;
      // Don't trigger if model is responding or a function is running
      if (modelSpeakingRef.current || toolCallActiveRef.current) {
        return;
      }
      setWarningMessage(`No voice input detected. Session will end in ${config.userSilenceTerminationSeconds} seconds...`);

      userSilenceTermTimerRef.current = setTimeout(() => {
        if (!sessionActiveRef.current) return;
        // Re-check before terminating
        if (modelSpeakingRef.current || toolCallActiveRef.current) {
          return;
        }
        addSystemMessage('Session ended due to user silence.');
        endSessionRef.current?.();
      }, config.userSilenceTerminationSeconds * 1000);
    }, userSilenceTimeoutRef.current * 1000);
  }, [addSystemMessage]);

  const resetUserSilenceTimer = useCallback(() => {
    setWarningMessage(null);
    if (userSilenceTermTimerRef.current) {
      clearTimeout(userSilenceTermTimerRef.current);
      userSilenceTermTimerRef.current = null;
    }
    startUserSilenceTimer();
  }, [startUserSilenceTimer]);

  // --- Model Silence Timeout ---
  const startModelSilenceTimer = useCallback(() => {
    if (modelSilenceTimerRef.current) clearTimeout(modelSilenceTimerRef.current);

    if (!sessionActiveRef.current) return;
    // Skip if model timeout is disabled by user
    if (!modelTimeoutEnabledRef.current) return;

    modelSilenceTimerRef.current = setTimeout(() => {
      if (!sessionActiveRef.current) return;
      // Check if a tool call is active
      if (toolCallActiveRef.current) {
        // Don't terminate, just show message
        setWarningMessage('Function is running — all timeouts are paused until completion');
        return;
      }
      addSystemMessage('Session ended: Model not responding and no functions running.');
      endSessionRef.current?.();
    }, modelSilenceTimeoutRef.current * 1000);
  }, [addSystemMessage]);

  const resetModelSilenceTimer = useCallback(() => {
    if (modelSilenceTimerRef.current) {
      clearTimeout(modelSilenceTimerRef.current);
      modelSilenceTimerRef.current = null;
    }
  }, []);

  // --- Audio Playback ---
  const { isPlaying, queueAudio, stopPlayback, cleanup: cleanupPlayback } = useAudioPlayback();

  // --- WebSocket Callbacks ---
  const handleSetupComplete = useCallback(() => {
    addSystemMessage('Session started. You can begin speaking.');
    startUserSilenceTimer();
  }, [addSystemMessage, startUserSilenceTimer]);

  const handleAudioOutput = useCallback((data) => {
    queueAudio(data);
    setModelSpeaking(true);
    modelSpeakingRef.current = true;
    setModelThinking(false);
    resetModelSilenceTimer();
  }, [queueAudio, resetModelSilenceTimer]);

  const handleInputTranscript = useCallback((text) => {
    setMessages((prev) => [...prev, { role: 'user', text, timestamp: new Date() }]);
    setUserSpeaking(false);
    userSpeakingRef.current = false;
    setAwaitingModelResponse(true);
    // User finished speaking — pause user silence timer, start model silence timer
    if (userSilenceTimerRef.current) clearTimeout(userSilenceTimerRef.current);
    if (userSilenceTermTimerRef.current) clearTimeout(userSilenceTermTimerRef.current);
    setWarningMessage(null);
    startModelSilenceTimer();
  }, [startModelSilenceTimer]);

  const handleOutputTranscript = useCallback((text) => {
    setModelThinking(false);
    resetModelSilenceTimer();
    setMessages((prev) => {
      // Update the last model message if it exists
      const last = prev[prev.length - 1];
      if (last && last.role === 'model' && last._partial) {
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, text: last.text + text };
        return updated;
      }
      return [...prev, { role: 'model', text, timestamp: new Date(), _partial: true }];
    });
  }, [resetModelSilenceTimer]);

  const handleTurnComplete = useCallback(() => {
    setTurnComplete(true);
    setModelSpeaking(false);
    modelSpeakingRef.current = false;
    setModelThinking(false);
    setInterrupted(false);
    setAwaitingModelResponse(false);
    resetModelSilenceTimer();
    // Finalize partial model messages
    setMessages((prev) => prev.map((m) => (m._partial ? { ...m, _partial: false } : m)));
    // Restart user silence timer after model done
    startUserSilenceTimer();
  }, [resetModelSilenceTimer, startUserSilenceTimer]);

  const handleInterrupted = useCallback(() => {
    setInterrupted(true);
    setModelSpeaking(false);
    modelSpeakingRef.current = false;
    setModelThinking(false);
    setAwaitingModelResponse(false);
    stopPlayback();
    resetModelSilenceTimer();
    // Finalize partial model messages
    setMessages((prev) => prev.map((m) => (m._partial ? { ...m, _partial: false } : m)));
  }, [stopPlayback, resetModelSilenceTimer]);

  const handleToolCall = useCallback((msg) => {
    toolCallActiveRef.current = true;
    setToolCalls((prev) => [
      ...prev,
      {
        id: msg.id || msg.call_id || `tc-${Date.now()}`,
        name: msg.name || msg.function_name,
        args: msg.args || msg.arguments,
        status: 'pending',
        progress: 0,
        response: null,
      },
    ]);
    resetModelSilenceTimer();
  }, [resetModelSilenceTimer]);

  const handleToolCallStatus = useCallback((msg) => {
    setToolCalls((prev) =>
      prev.map((tc) => {
        if (tc.id === (msg.id || msg.call_id)) {
          return {
            ...tc,
            status: msg.status || 'running',
            progress: msg.progress != null ? msg.progress : tc.progress,
          };
        }
        return tc;
      })
    );
  }, []);

  const handleToolResponse = useCallback((msg) => {
    const callId = msg.id || msg.call_id;
    setToolCalls((prev) => {
      const updated = prev.map((tc) => {
        if (tc.id === callId) {
          return { ...tc, status: 'completed', progress: 100, response: msg.response || msg.result };
        }
        return tc;
      });
      // Check if any tool calls still running
      const anyRunning = updated.some((tc) => tc.status === 'running' || tc.status === 'pending');
      toolCallActiveRef.current = anyRunning;
      if (!anyRunning) {
        setWarningMessage(null);
      }
      return updated;
    });
  }, []);

  const handleActivityStart = useCallback(() => {
    setModelThinking(true);
    resetModelSilenceTimer();
  }, [resetModelSilenceTimer]);

  const handleActivityEnd = useCallback(() => {
    setModelThinking(false);
  }, []);

  const handleError = useCallback((message) => {
    addSystemMessage(`Error: ${message}`);
  }, [addSystemMessage]);

  const handleGoAway = useCallback((message) => {
    addSystemMessage(`Server: ${message}`);
    endSessionRef.current?.();
  }, [addSystemMessage]);

  // --- WebSocket Hook ---
  const { connectionStatus, connect, disconnect, sendAudio, sendMessage } = useWebSocket({
    onSetupComplete: handleSetupComplete,
    onAudioOutput: handleAudioOutput,
    onInputTranscript: handleInputTranscript,
    onOutputTranscript: handleOutputTranscript,
    onTurnComplete: handleTurnComplete,
    onInterrupted: handleInterrupted,
    onToolCall: handleToolCall,
    onToolCallStatus: handleToolCallStatus,
    onToolResponse: handleToolResponse,
    onActivityStart: handleActivityStart,
    onActivityEnd: handleActivityEnd,
    onError: handleError,
    onGoAway: handleGoAway,
  });

  // --- Audio Capture ---
  const handleAudioChunk = useCallback((base64Data) => {
    sendAudio(base64Data);
  }, [sendAudio]);

  const handleSpeechActivity = useCallback((active) => {
    if (active) {
      setUserSpeaking(true);
      userSpeakingRef.current = true;
      setTurnComplete(false);
      setInterrupted(false);
      resetUserSilenceTimer();
    } else {
      setUserSpeaking(false);
      userSpeakingRef.current = false;
    }
  }, [resetUserSilenceTimer]);

  const { isCapturing, isMuted, start: startCapture, stop: stopCapture, toggleMute } = useAudioCapture({
    onAudioChunk: handleAudioChunk,
    onSpeechActivity: handleSpeechActivity,
  });

  // Keep muted ref in sync
  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted && sessionActive) {
      // When muted, clear user silence timer
      if (userSilenceTimerRef.current) clearTimeout(userSilenceTimerRef.current);
      if (userSilenceTermTimerRef.current) clearTimeout(userSilenceTermTimerRef.current);
      setWarningMessage(null);
    } else if (!isMuted && sessionActive) {
      // When unmuted, restart user silence timer
      startUserSilenceTimer();
    }
  }, [isMuted, sessionActive, startUserSilenceTimer]);

  // --- Compute timeoutInfo ---
  const effectiveModelSpeaking = modelSpeaking || isPlaying;
  const toolCallActive = toolCallActiveRef.current;

  let micTimeout, modelTimeoutInfo;

  if (!sessionActive) {
    micTimeout = { active: false, reason: 'Session not active' };
    modelTimeoutInfo = { active: false, reason: 'Session not active' };
  } else if (toolCallActive) {
    micTimeout = { active: false, reason: 'Function running' };
    modelTimeoutInfo = { active: false, reason: 'Function running' };
  } else {
    // Mic timeout
    if (isMuted) {
      micTimeout = { active: false, reason: 'Mic muted' };
    } else if (effectiveModelSpeaking || awaitingModelResponse) {
      micTimeout = { active: false, reason: "Model's turn to respond" };
    } else {
      micTimeout = { active: true, reason: `active (${userSilenceTimeout}s)` };
    }

    // Model timeout
    if (!modelTimeoutEnabled) {
      modelTimeoutInfo = { active: false, reason: 'Disabled by user' };
    } else if (effectiveModelSpeaking) {
      modelTimeoutInfo = { active: false, reason: 'Model responding' };
    } else if (awaitingModelResponse) {
      modelTimeoutInfo = { active: true, reason: `active (${modelSilenceTimeout}s)` };
    } else {
      modelTimeoutInfo = { active: false, reason: "User's turn" };
    }
  }

  const timeoutInfo = { micTimeout, modelTimeout: modelTimeoutInfo };

  // --- Session Management ---
  const startSession = useCallback(async () => {
    try {
      // Ensure model timeout > user timeout
      const effectiveModelTimeout = Math.max(modelSilenceTimeout, userSilenceTimeout + 1);
      if (effectiveModelTimeout !== modelSilenceTimeout) {
        setModelSilenceTimeout(effectiveModelTimeout);
      }

      setMessages([]);
      setToolCalls([]);
      setWarningMessage(null);
      setModelSpeaking(false);
      setModelThinking(false);
      setTurnComplete(false);
      setInterrupted(false);
      setUserSpeaking(false);
      setAwaitingModelResponse(false);
      toolCallActiveRef.current = false;

      await startCapture();
      connect(systemInstruction, userSilenceTimeout, effectiveModelTimeout, taskDuration, simulateModelLatency, modelTimeoutEnabled);
      setSessionActive(true);
      sessionActiveRef.current = true;
    } catch (err) {
      addSystemMessage(`Failed to start session: ${err.message}`);
    }
  }, [startCapture, connect, systemInstruction, userSilenceTimeout, modelSilenceTimeout, taskDuration, simulateModelLatency, modelTimeoutEnabled, addSystemMessage]);

  const endSession = useCallback(() => {
    clearAllTimers();
    stopCapture();
    stopPlayback();
    disconnect();
    setSessionActive(false);
    sessionActiveRef.current = false;
    setModelSpeaking(false);
    modelSpeakingRef.current = false;
    setModelThinking(false);
    setUserSpeaking(false);
    setAwaitingModelResponse(false);
    toolCallActiveRef.current = false;
  }, [clearAllTimers, stopCapture, stopPlayback, disconnect]);

  // Keep endSession ref in sync so timer callbacks always get the latest version
  useEffect(() => {
    endSessionRef.current = endSession;
  }, [endSession]);

  const handleStopSession = useCallback(() => {
    addSystemMessage('Session ended by user.');
    endSession();
  }, [addSystemMessage, endSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
      cleanupPlayback();
    };
  }, [clearAllTimers, cleanupPlayback]);

  return (
    <div className="app-layout">
      <LeftPanel
        connectionStatus={connectionStatus}
        sessionActive={sessionActive}
        systemInstruction={systemInstruction}
        setSystemInstruction={setSystemInstruction}
        userSilenceTimeout={userSilenceTimeout}
        setUserSilenceTimeout={setUserSilenceTimeout}
        modelSilenceTimeout={modelSilenceTimeout}
        setModelSilenceTimeout={setModelSilenceTimeout}
        taskDuration={taskDuration}
        setTaskDuration={setTaskDuration}
        onStartSession={startSession}
        onStopSession={handleStopSession}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        modelSpeaking={effectiveModelSpeaking}
        turnComplete={turnComplete}
        interrupted={interrupted}
        modelThinking={modelThinking}
        toolCallActive={toolCallActive}
        simulateModelLatency={simulateModelLatency}
        setSimulateModelLatency={setSimulateModelLatency}
        modelTimeoutEnabled={modelTimeoutEnabled}
        setModelTimeoutEnabled={setModelTimeoutEnabled}
      />
      <CenterPanel
        messages={messages}
        userSpeaking={userSpeaking && !isMuted}
        modelSpeaking={effectiveModelSpeaking}
        warningMessage={warningMessage}
        timeoutInfo={timeoutInfo}
      />
      <RightPanel toolCalls={toolCalls} />
    </div>
  );
}
