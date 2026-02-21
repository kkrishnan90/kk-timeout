import React, { useEffect, useRef } from 'react';

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function WaveformIndicator({ label }) {
  return (
    <div className="waveform-indicator">
      <div className="waveform-bars">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="waveform-bar"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
      <span className="waveform-label">{label}</span>
    </div>
  );
}

function InlineTimeoutChip({ active, label, detail }) {
  return (
    <span className={`inline-timeout-chip ${active ? 'active' : ''}`}>
      <span className={`chip-dot-inline ${active ? 'dot-green' : 'dot-dim'}`} />
      <span className="chip-label-inline">{label}</span>
      {detail && <span className="chip-detail-inline">{detail}</span>}
    </span>
  );
}

export default function CenterPanel({
  messages,
  userSpeaking,
  modelSpeaking,
  warningMessage,
  timeoutInfo,
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, userSpeaking, modelSpeaking]);

  // Determine which chip to show
  const renderTimeoutChip = () => {
    if (!timeoutInfo) return null;

    const { micTimeout, modelTimeout } = timeoutInfo;

    // Function running - special message
    if (micTimeout.reason === 'Function running' || modelTimeout.reason === 'Function running') {
      return (
        <div className="inline-chip-row">
          <InlineTimeoutChip active={false} label="All timeouts paused" detail="function running" />
        </div>
      );
    }

    return null;
  };

  // Chip for after user speaking indicator
  const renderMicChip = () => {
    if (!timeoutInfo) return null;
    const { micTimeout } = timeoutInfo;
    return (
      <div className="inline-chip-row">
        <InlineTimeoutChip
          active={micTimeout.active}
          label="Mic timeout"
          detail={micTimeout.active ? micTimeout.reason : micTimeout.reason}
        />
      </div>
    );
  };

  // Chip for after model speaking indicator
  const renderModelChip = () => {
    if (!timeoutInfo) return null;
    const { modelTimeout } = timeoutInfo;
    return (
      <div className="inline-chip-row">
        <InlineTimeoutChip
          active={modelTimeout.active}
          label="Model timeout"
          detail={modelTimeout.active ? modelTimeout.reason : modelTimeout.reason}
        />
      </div>
    );
  };

  // Idle chip (after last message, when neither speaking)
  const renderIdleChip = () => {
    if (!timeoutInfo) return null;

    const { micTimeout, modelTimeout } = timeoutInfo;

    // Function running
    if (micTimeout.reason === 'Function running' || modelTimeout.reason === 'Function running') {
      return (
        <div className="inline-chip-row center">
          <InlineTimeoutChip active={false} label="All timeouts paused" detail="function running" />
        </div>
      );
    }

    // Show whichever timeout is currently active, or the most relevant disabled one
    if (micTimeout.active) {
      return (
        <div className="inline-chip-row center">
          <InlineTimeoutChip active={true} label="Mic timeout" detail={micTimeout.reason} />
        </div>
      );
    }
    if (modelTimeout.active) {
      return (
        <div className="inline-chip-row center">
          <InlineTimeoutChip active={true} label="Model timeout" detail={modelTimeout.reason} />
        </div>
      );
    }

    // Both disabled - show model timeout reason (most informative)
    return (
      <div className="inline-chip-row center">
        <InlineTimeoutChip active={false} label="Model timeout" detail={modelTimeout.reason} />
      </div>
    );
  };

  const showIdleChip = timeoutInfo && !userSpeaking && !modelSpeaking;

  return (
    <div className="center-panel">
      <div className="center-header">
        <span className="center-title">Transcript</span>
        <span className="message-count">{messages.length} messages</span>
      </div>

      {/* Warning Banner */}
      {warningMessage && (
        <div className="warning-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>{warningMessage}</span>
        </div>
      )}

      <div className="messages-container" ref={scrollRef}>
        {messages.length === 0 && !userSpeaking && !modelSpeaking && (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p className="empty-text">Start a session to begin speaking</p>
            <p className="empty-subtext">Your conversation will appear here</p>
          </div>
        )}

        {messages.map((msg, index) => {
          if (msg.role === 'system') {
            return (
              <div key={index} className="message-system" style={{ animationDelay: `${Math.min(index * 0.05, 0.3)}s` }}>
                <span>{msg.text}</span>
              </div>
            );
          }

          const isUser = msg.role === 'user';
          return (
            <div
              key={index}
              className={`message-row ${isUser ? 'user' : 'model'}`}
              style={{ animationDelay: `${Math.min(index * 0.05, 0.3)}s` }}
            >
              <div className={`message-bubble ${isUser ? 'user-bubble' : 'model-bubble'}`}>
                <div className="message-text">{msg.text}</div>
                <div className="message-time">{formatTime(msg.timestamp)}</div>
              </div>
            </div>
          );
        })}

        {/* Live indicators with inline chips */}
        {userSpeaking && (
          <>
            <div className="message-row user">
              <div className="message-bubble user-bubble live-bubble">
                <WaveformIndicator label="Listening..." />
              </div>
            </div>
            {renderMicChip()}
          </>
        )}

        {modelSpeaking && (
          <>
            <div className="message-row model">
              <div className="message-bubble model-bubble live-bubble">
                <WaveformIndicator label="Speaking..." />
              </div>
            </div>
            {renderModelChip()}
          </>
        )}

        {/* Idle chip when neither speaking */}
        {showIdleChip && renderIdleChip()}
      </div>
    </div>
  );
}
