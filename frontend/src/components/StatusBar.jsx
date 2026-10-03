import React from 'react';

export default function StatusBar({ data, countdown, isPolling, error }) {
  const lastUpdated = data?.last_updated
    ? new Date(data.last_updated).toLocaleTimeString()
    : 'N/A';

  const windowId = data?.window_id || 'N/A';
  const windowSize = data?.window_size_seconds ? `${data.window_size_seconds}s` : '60s';
  const totalWindows = data?.total_windows_processed ?? '0';

  let statusClass = 'live';
  let statusText = 'Connected';

  if (error) {
    statusClass = 'error';
    statusText = 'Disconnected';
  } else if (!data || data.status === 'no_data') {
    statusClass = 'warning';
    statusText = 'Waiting for Pipeline';
  }

  return (
    <div className="dashboard-card" style={{ padding: '16px 24px' }}>
      <div className="status-grid">
        <div className="status-item">
          <span className="status-label">System Status</span>
          <div className="status-indicator">
            <span className={`dot ${statusClass}`} />
            <span>{statusText}</span>
          </div>
        </div>

        <div className="status-item">
          <span className="status-label">Last Updated</span>
          <span className="status-value mono">{lastUpdated}</span>
        </div>

        <div className="status-item">
          <span className="status-label">Current Window ID</span>
          <span className="status-value mono" style={{ fontSize: '0.95rem' }}>{windowId}</span>
        </div>

        <div className="status-item">
          <span className="status-label">Window Size / Processed</span>
          <span className="status-value mono">{windowSize} / {totalWindows} windows</span>
        </div>

        <div className="status-item">
          <span className="status-label">Next Refresh</span>
          <span className="status-value mono" style={{ color: 'var(--accent-blue)' }}>
            {isPolling ? `${countdown}s` : 'Paused'}
          </span>
        </div>
      </div>
    </div>
  );
}
