import React from 'react';
import {
  Server,
  Package,
  Zap,
  TrendingUp,
  TrendingDown,
  Flame,
  Play,
  Pause,
} from 'lucide-react';

export default function KpiStrip({
  data,
  countdown,
  pollInterval,
  isPaused,
  onTogglePause,
  onQuickSelectProduct,
  error,
}) {
  const top10  = data?.top_10          || [];
  const movers = data?.momentum_movers || [];

  const totalUnits    = top10.reduce((s, i) => s + (i.total_units          || 0), 0);
  const currWinUnits  = top10.reduce((s, i) => s + (i.current_window_units  || 0), 0);
  const prevWinUnits  = top10.reduce((s, i) => s + (i.previous_window_units || 0), 0);
  const delta         = currWinUnits - prevWinUnits;
  const deltaPct      = prevWinUnits > 0 ? ((delta / prevWinUnits) * 100).toFixed(1) : '0.0';

  const topGainer = movers[0] || [...top10].sort((a, b) => (b.momentum_pct || 0) - (a.momentum_pct || 0))[0];

  const totalWindows = data?.total_windows_processed ?? 0;
  const windowId     = data?.window_id ? data.window_id.replace('window_', '#') : 'N/A';
  const windowSize   = data?.window_size_seconds ? `${data.window_size_seconds}s` : '60s';

  let statusTone = 'online';
  let statusText = 'Cluster Synced';
  if (error) { statusTone = 'error'; statusText = 'Backend Offline'; }
  else if (!data || data.status === 'no_data') { statusTone = 'waiting'; statusText = 'Awaiting Data'; }

  // Radial progress ring
  const r    = 14;
  const circ = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, countdown / (isPaused ? 1 : pollInterval)));
  const offset = circ * (1 - ratio);

  return (
    <div className="kpi-strip">
      {/* Card 1: Pipeline Status */}
      <div className={`kpi-card kpi-card-status-${statusTone}`}>
        <div className="kpi-header">
          <span className="kpi-label">Pipeline Engine</span>
          <span className="kpi-icon">
            <Server size={18} />
          </span>
        </div>
        <div className="kpi-value">
          {totalWindows}<span className="kpi-value-unit">win</span>
        </div>
        <div className="kpi-meta">
          <div className="status-dot-wrap">
            <span className={`status-dot status-dot-${statusTone}`} />
            <span className={`status-text-${statusTone}`}>{statusText}</span>
          </div>
          <span className="kpi-badge kpi-badge-cyan">{windowId}</span>
          <span className="kpi-badge kpi-badge-cyan">{windowSize} cadence</span>
        </div>
      </div>

      {/* Card 2: Cumulative Volume */}
      <div className="kpi-card kpi-card-status-default">
        <div className="kpi-header">
          <span className="kpi-label">Cumulative Volume</span>
          <span className="kpi-icon">
            <Package size={18} />
          </span>
        </div>
        <div className="kpi-value">
          {totalUnits.toLocaleString()}
          <span className="kpi-value-unit">units</span>
        </div>
        <div className="kpi-meta">
          <span>Top 10 aggregate</span>
          {top10.length > 0 && (
            <span className="kpi-badge kpi-badge-cyan">
              avg {Math.round(totalUnits / top10.length).toLocaleString()} / item
            </span>
          )}
        </div>
      </div>

      {/* Card 3: Window Velocity */}
      <div className="kpi-card kpi-card-status-default">
        <div className="kpi-header">
          <span className="kpi-label">Window Velocity</span>
          <span className="kpi-icon">
            <Zap size={18} />
          </span>
        </div>
        <div className="kpi-value">
          {currWinUnits.toLocaleString()}
          <span className="kpi-value-unit">/ win</span>
        </div>
        <div className="kpi-meta">
          <span className={`kpi-badge ${delta >= 0 ? 'kpi-badge-up' : 'kpi-badge-down'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            {delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{Math.abs(delta)} ({deltaPct}%)</span>
          </span>
          <span>prev: {prevWinUnits.toLocaleString()}</span>
        </div>
      </div>

      {/* Card 4: #1 Velocity Rocket */}
      <div className="kpi-card kpi-card-gainer">
        <div className="kpi-header">
          <span className="kpi-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Flame size={16} />
            <span>#1 Velocity Rocket</span>
          </span>
          {topGainer && (
            <button
              className="boost-btn"
              onClick={() => onQuickSelectProduct?.(topGainer.product_id)}
              title="Load into Burst Simulator"
            >
              <Zap size={12} />
              <span>Boost</span>
            </button>
          )}
        </div>
        {topGainer ? (
          <>
            <div className="kpi-value gainer-name" title={topGainer.product_name}>
              {topGainer.product_name || `Product #${topGainer.product_id}`}
            </div>
            <div className="kpi-meta">
              <span className="surge-badge">
                +{typeof topGainer.momentum_pct === 'number' ? topGainer.momentum_pct.toFixed(0) : '0'}% surge
              </span>
              <span className="mono">ID #{topGainer.product_id}</span>
            </div>
          </>
        ) : (
          <div className="kpi-meta">No surges detected yet</div>
        )}
      </div>

      {/* Card 5: Auto-sync ring */}
      <div className="kpi-card kpi-card-status-default">
        <div className="kpi-header">
          <span className="kpi-label">Auto-Sync</span>
          <button
            className={`pause-btn ${isPaused ? 'paused' : ''}`}
            onClick={onTogglePause}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            {isPaused ? <><Play size={11} /> Resume</> : <><Pause size={11} /> Pause</>}
          </button>
        </div>
        <div className="kpi-sync-body">
          <svg className="radial-svg" viewBox="0 0 36 36" aria-hidden="true">
            <circle
              className="radial-bg"
              cx="18" cy="18" r={r}
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="3"
            />
            <circle
              className="radial-fg"
              cx="18" cy="18" r={r}
              fill="none"
              stroke="var(--brand-primary)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 1s linear' }}
            />
            <text x="18" y="21.5" textAnchor="middle" className="radial-center" style={{ fontSize: isPaused ? '7px' : '9px', fontWeight: 700 }}>
              {isPaused ? 'PAUSE' : `${countdown}s`}
            </text>
          </svg>
          <div className="sync-meta-text">
            <span className="sync-interval">Every {pollInterval}s</span>
            <span className="sync-status">{isPaused ? 'Polling paused' : 'Live polling'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
