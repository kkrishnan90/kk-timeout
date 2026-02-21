import React from 'react';

function StatusBadge({ status }) {
  const styles = {
    pending: { bg: 'var(--accent-yellow-dim)', color: 'var(--accent-yellow)', label: 'Pending' },
    running: { bg: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', label: 'Running' },
    completed: { bg: 'var(--accent-green-dim)', color: 'var(--accent-green)', label: 'Completed' },
    failed: { bg: 'var(--accent-red-dim)', color: 'var(--accent-red)', label: 'Failed' },
  };

  const s = styles[status] || styles.pending;

  return (
    <span className="tool-status-badge" style={{ background: s.bg, color: s.color }}>
      {status === 'running' && <span className="spinner-tiny" />}
      {s.label}
    </span>
  );
}

function ProgressBar({ progress }) {
  return (
    <div className="tool-progress-bar">
      <div
        className="tool-progress-fill"
        style={{ width: `${Math.min(100, Math.max(0, progress || 0))}%` }}
      />
    </div>
  );
}

export default function RightPanel({ toolCalls }) {
  return (
    <div className="right-panel">
      <div className="panel-header">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg>
        <span className="panel-title">Function Calls</span>
        {toolCalls.length > 0 && (
          <span className="tool-count">{toolCalls.length}</span>
        )}
      </div>

      <div className="tool-calls-list">
        {toolCalls.length === 0 && (
          <div className="empty-state-sm">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
            <p>No function calls yet</p>
          </div>
        )}

        {toolCalls.map((tc, index) => (
          <div
            key={tc.id || index}
            className={`tool-call-card ${tc.status}`}
            style={{ animationDelay: `${index * 0.08}s` }}
          >
            <div className="tool-call-header">
              <span className="tool-fn-name">{tc.name || 'unknown'}</span>
              <StatusBadge status={tc.status} />
            </div>

            {tc.args && (
              <div className="tool-call-args">
                <span className="args-label">Arguments</span>
                <pre className="args-json">{formatArgs(tc.args)}</pre>
              </div>
            )}

            {tc.status === 'running' && (
              <ProgressBar progress={tc.progress} />
            )}

            {tc.response && (
              <div className="tool-call-response">
                <span className="response-label">Response</span>
                <pre className="response-json">{formatArgs(tc.response)}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatArgs(args) {
  if (typeof args === 'string') {
    try {
      return JSON.stringify(JSON.parse(args), null, 2);
    } catch {
      return args;
    }
  }
  return JSON.stringify(args, null, 2);
}
