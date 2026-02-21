import { useState, useRef, useCallback, useEffect } from 'react';
import config from '../config.js';

export default function useWebSocket({
  onAudioOutput,
  onInputTranscript,
  onOutputTranscript,
  onTurnComplete,
  onInterrupted,
  onToolCall,
  onToolCallStatus,
  onToolResponse,
  onActivityStart,
  onActivityEnd,
  onError,
  onGoAway,
  onSetupComplete,
}) {
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected'
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);

  const connect = useCallback((systemInstruction, userSilenceTimeout, modelSilenceTimeout, taskDuration, simulateModelLatency, modelTimeoutEnabled) => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
      wsRef.current.close();
    }

    setConnectionStatus('connecting');
    const ws = new WebSocket(config.wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      reconnectAttemptRef.current = 0;

      // Send setup message
      ws.send(JSON.stringify({
        type: 'setup',
        system_instruction: systemInstruction,
        user_silence_timeout: userSilenceTimeout,
        model_silence_timeout: modelSilenceTimeout,
        task_duration: taskDuration,
        simulate_model_latency: simulateModelLatency,
        model_timeout_enabled: modelTimeoutEnabled,
      }));
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'setup_complete':
          onSetupComplete?.();
          break;
        case 'audio_output':
          onAudioOutput?.(msg.data);
          break;
        case 'input_transcript':
          onInputTranscript?.(msg.text);
          break;
        case 'output_transcript':
          onOutputTranscript?.(msg.text);
          break;
        case 'turn_complete':
          onTurnComplete?.();
          break;
        case 'interrupted':
          onInterrupted?.();
          break;
        case 'tool_call':
          onToolCall?.(msg);
          break;
        case 'tool_call_status':
          onToolCallStatus?.(msg);
          break;
        case 'tool_response':
          onToolResponse?.(msg);
          break;
        case 'activity_start':
          onActivityStart?.();
          break;
        case 'activity_end':
          onActivityEnd?.();
          break;
        case 'error':
          onError?.(msg.message || msg.error || 'Unknown error');
          break;
        case 'model_timeout':
          onGoAway?.(msg.message || 'Model response timeout — session terminated');
          break;
        case 'go_away':
          onGoAway?.(msg.time_left ? `Session ending in ${msg.time_left}` : (msg.message || 'Server requested disconnect'));
          break;
        default:
          break;
      }
    };

    ws.onclose = (event) => {
      setConnectionStatus('disconnected');
      wsRef.current = null;
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
    };

    return ws;
  }, [onAudioOutput, onInputTranscript, onOutputTranscript, onTurnComplete, onInterrupted, onToolCall, onToolCallStatus, onToolResponse, onActivityStart, onActivityEnd, onError, onGoAway, onSetupComplete]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
  }, []);

  const sendAudio = useCallback((base64Data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'audio',
        data: base64Data,
      }));
    }
  }, []);

  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    connectionStatus,
    connect,
    disconnect,
    sendAudio,
    sendMessage,
  };
}
