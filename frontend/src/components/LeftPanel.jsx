import React from 'react';
import config from '../config.js';

export default function LeftPanel({
  connectionStatus,
  sessionActive,
  systemInstruction,
  setSystemInstruction,
  userSilenceTimeout,
  setUserSilenceTimeout,
  modelSilenceTimeout,
  setModelSilenceTimeout,
  taskDuration,
  setTaskDuration,
  onStartSession,
  onStopSession,
  isMuted,
  onToggleMute,
  modelSpeaking,
  turnComplete,
  interrupted,
  modelThinking,
  toolCallActive,
  simulateModelLatency,
  setSimulateModelLatency,
  modelTimeoutEnabled,
  setModelTimeoutEnabled,
}) {
  const statusColor = {
    connected: 'var(--accent-green)',
    connecting: 'var(--accent-yellow)',
    disconnected: 'var(--accent-red)',
  };

  const statusLabel = {
    connected: 'Connected',
    connecting: 'Connecting...',
    disconnected: 'Disconnected',
  };

  return (
    <div className="left-panel">
      {/* Logo / Title */}
      <div className="panel-logo">
        <div className="logo-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <div className="logo-text">
          <span className="logo-title">Gemini Live</span>
          <span className="logo-subtitle">Voice Assistant</span>
        </div>
      </div>

      {/* Connection Status */}
      <div className="connection-status">
        <span
          className="status-dot"
          style={{ background: statusColor[connectionStatus] }}
        />
        <span className="status-label">{statusLabel[connectionStatus]}</span>
      </div>

      <div className="panel-divider" />

      {/* System Instruction */}
      <div className="control-group">
        <label className="control-label">System Instructions</label>
        <textarea
          className="control-textarea"
          value={systemInstruction}
          onChange={(e) => setSystemInstruction(e.target.value)}
          disabled={sessionActive}
          rows={4}
          placeholder="Enter system instructions..."
        />
      </div>

      {/* Session Controls */}
      <div className="session-controls">
        {!sessionActive ? (
          <button className="btn btn-start" onClick={onStartSession}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
            Start Session
          </button>
        ) : (
          <div className="session-active-controls">
            <button className="btn btn-stop" onClick={onStopSession}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
              Stop
            </button>
            <button
              className={`btn btn-mute ${isMuted ? 'muted' : ''}`}
              onClick={onToggleMute}
            >
              {isMuted ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23"/>
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.48-.35 2.17"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              )}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        )}
      </div>

      <div className="panel-divider" />

      {/* Timeout Settings */}
      <div className="control-group">
        <label className="control-label">Client Mic Input Timeout</label>
        <div className="timeout-input-row">
          <input
            type="number"
            className="control-input"
            value={userSilenceTimeout}
            onChange={(e) => {
              const val = Math.max(1, parseInt(e.target.value) || 1);
              setUserSilenceTimeout(val);
              if (val >= modelSilenceTimeout) {
                setModelSilenceTimeout(val + 1);
              }
            }}
            disabled={sessionActive}
            min={1}
            max={60}
          />
          <span className="timeout-unit">seconds</span>
        </div>
        <p className="control-hint">No voice input after this duration triggers a warning, then session ends in {config.userSilenceTerminationSeconds}s</p>
      </div>

      <div className="control-group">
        <label className="control-label">Model Response Timeout</label>
        <div className="timeout-input-row">
          <input
            type="number"
            className="control-input"
            value={modelSilenceTimeout}
            onChange={(e) => {
              const val = Math.max(userSilenceTimeout + 1, parseInt(e.target.value) || (userSilenceTimeout + 1));
              setModelSilenceTimeout(val);
            }}
            disabled={sessionActive || !modelTimeoutEnabled}
            min={userSilenceTimeout + 1}
            max={120}
            style={!modelTimeoutEnabled ? { opacity: 0.35 } : {}}
          />
          <span className="timeout-unit" style={!modelTimeoutEnabled ? { opacity: 0.35 } : {}}>seconds</span>
          <label className="checkbox-label">
            <input
              type="checkbox"
              className="timeout-checkbox"
              checked={modelTimeoutEnabled}
              onChange={(e) => setModelTimeoutEnabled(e.target.checked)}
              disabled={sessionActive}
            />
            <span className="checkbox-text">Enable</span>
          </label>
        </div>
        <p className="control-hint">
          {modelTimeoutEnabled
            ? 'Must be higher than mic timeout. Paused while a function is running.'
            : 'Uncheck for free-flow conversation without model timeout'}
        </p>
      </div>

      <div className="control-group">
        <label className="control-label">Task Duration</label>
        <div className="timeout-input-row">
          <input
            type="number"
            className="control-input"
            value={taskDuration}
            onChange={(e) => setTaskDuration(Math.max(1, parseInt(e.target.value) || 1))}
            disabled={sessionActive}
            min={1}
            max={300}
          />
          <span className="timeout-unit">seconds</span>
        </div>
        <p className="control-hint">Duration for the simulated task function</p>
      </div>

      {/* Simulated Model Latency (pre-session only) */}
      <div className="control-group">
        <label className="control-label">Simulated Model Latency</label>
        <div className="timeout-input-row">
          <input
            type="number"
            className="control-input"
            value={simulateModelLatency}
            onChange={(e) => setSimulateModelLatency(Math.max(0, parseInt(e.target.value) || 0))}
            disabled={sessionActive}
            min={0}
            max={120}
          />
          <span className="timeout-unit">seconds</span>
        </div>
        <p className="control-hint">Adds artificial delay before model responds (for testing)</p>
      </div>

      <div className="panel-divider" />

      {/* Session Status Indicators */}
      <div className="status-indicators">
        <label className="control-label">Session Status</label>

        <div className={`indicator ${modelSpeaking ? 'active' : ''}`}>
          <span className={`indicator-dot ${modelSpeaking ? 'speaking' : ''}`} />
          <span>Model Speaking</span>
          {modelSpeaking && <span className="indicator-badge active-badge">Active</span>}
        </div>

        <div className={`indicator ${modelThinking ? 'active' : ''}`}>
          <span className={`indicator-dot ${modelThinking ? 'thinking' : ''}`} />
          <span>Model Thinking</span>
          {modelThinking && <span className="indicator-badge thinking-badge">...</span>}
        </div>

        <div className={`indicator ${turnComplete ? 'active' : ''}`}>
          <span className="indicator-dot" style={turnComplete ? { background: 'var(--accent-green)' } : {}} />
          <span>Turn Complete</span>
          {turnComplete && <span className="indicator-badge complete-badge">&#10003;</span>}
        </div>

        <div className={`indicator ${interrupted ? 'active' : ''}`}>
          <span className="indicator-dot" style={interrupted ? { background: 'var(--accent-yellow)' } : {}} />
          <span>Interrupted</span>
          {interrupted && <span className="indicator-badge interrupt-badge">!</span>}
        </div>

        {toolCallActive && (
          <div className="indicator active">
            <span className="indicator-dot" style={{ background: 'var(--accent-blue)' }} />
            <span>Function Running</span>
            <span className="indicator-badge fn-badge">
              <span className="spinner-tiny" /> Active
            </span>
          </div>
        )}
      </div>

      {/* Function hint */}
      <div className="fn-hint">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <div className="fn-hint-content">
          <span>{config.functionHint}</span>
          <div className="fn-examples">
            <span className="fn-examples-label">Examples:</span>
            {config.functionExamples.map((ex, i) => (
              <span key={i} className="fn-example-item">{ex}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
