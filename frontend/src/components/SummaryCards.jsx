import React from 'react';

export default function SummaryCards({
  data,
  countdown,
  pollInterval,
  isPaused,
  onTogglePause,
  onQuickSelectProduct,
  error,
}) {
  const top10 = data?.top_10 || [];
  const movers = data?.momentum_movers || [];
  
  // Aggregate Top 10 metrics
  const totalTop10Units = top10.reduce((acc, item) => acc + (item.total_units || 0), 0);
  const currentWindowUnits = top10.reduce((acc, item) => acc + (item.current_window_units || 0), 0);
  const previousWindowUnits = top10.reduce((acc, item) => acc + (item.previous_window_units || 0), 0);
  
  const windowDelta = currentWindowUnits - previousWindowUnits;
  const windowDeltaPct = previousWindowUnits > 0
    ? ((windowDelta / previousWindowUnits) * 100).toFixed(1)
    : '0.0';

  // Find top velocity gainer (from movers or top10)
  const topGainer = movers[0] || [...top10].sort((a, b) => (b.momentum_pct || 0) - (a.momentum_pct || 0))[0];

  const totalWindows = data?.total_windows_processed ?? 0;
  const windowId = data?.window_id ? data.window_id.replace('window_', '') : 'N/A';
  const windowSize = data?.window_size_seconds ? `${data.window_size_seconds}s` : '60s';

  // Determine system status
  let statusTone = 'online';
  let statusText = 'Cluster Synced';
  if (error) {
    statusTone = 'error';
    statusText = 'Backend Offline';
  } else if (!data || data.status === 'no_data') {
    statusTone = 'waiting';
    statusText = 'Awaiting Window 01';
  }

  // Circular progress calculation
  const totalDuration = isPaused ? 1 : (pollInterval || 5);
  const progressRatio = Math.max(0, Math.min(1, countdown / totalDuration));
  const strokeDashoffset = 100 - (progressRatio * 100);

  return (
    <div className="summary-strip">
      {/* Card 1: Pipeline Connection & Health */}
      <div className={`stat-card card-glow-${statusTone}`}>
        <div className="stat-card-header">
          <span className="stat-card-label">Pipeline Engine</span>
          <span className={`status-pill pill-${statusTone}`}>
            <span className="pulsing-radar" />
            {statusText}
          </span>
        </div>
        <div className="stat-card-body">
          <div className="stat-card-main-val mono">
            {totalWindows} <span className="val-unit">windows</span>
          </div>
          <div className="stat-card-meta">
            <span className="mono-sub">ID: {windowId}</span>
            <span className="badge-sub">Cadence: {windowSize}</span>
          </div>
        </div>
      </div>

      {/* Card 2: Top 10 Total Volume */}
      <div className="stat-card">
        <div className="stat-card-header">
          <span className="stat-card-label">Cumulative Volume (Top 10)</span>
          <span className="stat-icon-badge">📦</span>
        </div>
        <div className="stat-card-body">
          <div className="stat-card-main-val mono">
            {totalTop10Units.toLocaleString()} <span className="val-unit">units</span>
          </div>
          <div className="stat-card-meta">
            <span>Avg: {top10.length > 0 ? Math.round(totalTop10Units / top10.length).toLocaleString() : 0}/item</span>
            <span className="trend-label">Cumulative Run</span>
          </div>
        </div>
      </div>

      {/* Card 3: Intraday Window Run-Rate */}
      <div className="stat-card">
        <div className="stat-card-header">
          <span className="stat-card-label">Window Velocity (Top 10)</span>
          <span className="stat-icon-badge">⚡</span>
        </div>
        <div className="stat-card-body">
          <div className="stat-card-main-val mono">
            {currentWindowUnits.toLocaleString()} <span className="val-unit">units/win</span>
          </div>
          <div className="stat-card-meta">
            <span className={`trend-tag ${windowDelta >= 0 ? 'pos' : 'neg'}`}>
              {windowDelta >= 0 ? '▲ +' : '▼ '}{windowDelta} ({windowDeltaPct}%)
            </span>
            <span className="mono-sub">prev: {previousWindowUnits}</span>
          </div>
        </div>
      </div>

      {/* Card 4: Top Momentum Rocket */}
      <div className="stat-card highlight-gainer">
        <div className="stat-card-header">
          <span className="stat-card-label">🔥 #1 Velocity Rocket</span>
          {topGainer && (
            <button
              className="quick-boost-pill"
              onClick={() => onQuickSelectProduct && onQuickSelectProduct(topGainer.product_id)}
              title="Click to load into Burst Simulator"
            >
              +Boost
            </button>
          )}
        </div>
        <div className="stat-card-body">
          {topGainer ? (
            <>
              <div className="stat-card-main-val gainer-name" title={topGainer.product_name}>
                {topGainer.product_name}
              </div>
              <div className="stat-card-meta">
                <span className="momentum-surge-badge mono">
                  +{typeof topGainer.momentum_pct === 'number' ? topGainer.momentum_pct.toFixed(0) : '0'}% surge
                </span>
                <span className="mono-sub">ID: #{topGainer.product_id}</span>
              </div>
            </>
          ) : (
            <div className="stat-card-meta">No surges recorded yet</div>
          )}
        </div>
      </div>

      {/* Card 5: Real-Time Sync Ring */}
      <div className="stat-card sync-card">
        <div className="stat-card-header">
          <span className="stat-card-label">Auto-Sync Cadence</span>
          <button
            className={`pause-toggle-btn ${isPaused ? 'paused' : 'playing'}`}
            onClick={onTogglePause}
            title={isPaused ? 'Resume live polling' : 'Pause live polling'}
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>
        <div className="stat-card-body sync-ring-body">
          <div className="radial-countdown-wrap">
            <svg className="radial-svg" viewBox="0 0 36 36">
              <path
                className="radial-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="radial-progress"
                strokeDasharray="100, 100"
                strokeDashoffset={strokeDashoffset}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="countdown-number mono">{isPaused ? '⏸' : `${countdown}s`}</span>
          </div>
          <div className="sync-meta">
            <span className="sync-interval-label">Every {pollInterval}s</span>
            <span className="sync-status-indicator">{isPaused ? 'Polling Paused' : 'Live Polling'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
