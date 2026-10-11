import React from 'react';
import {
  Boxes,
  Activity,
  Flame,
  Zap,
  HardDrive,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

export default function TelemetryHudStrip({ data, onQuickSelectProduct }) {
  const top10 = data?.top_10 || [];
  const movers = data?.momentum_movers || [];

  const totalUnits = top10.reduce((s, i) => s + (i.total_units || 0), 0);
  const currWinUnits = top10.reduce((s, i) => s + (i.current_window_units || 0), 0);
  const prevWinUnits = top10.reduce((s, i) => s + (i.previous_window_units || 0), 0);
  const delta = currWinUnits - prevWinUnits;
  const deltaPct = prevWinUnits > 0 ? ((delta / prevWinUnits) * 100).toFixed(1) : '0.0';

  const topGainer =
    movers[0] ||
    [...top10].sort((a, b) => (b.momentum_pct || 0) - (a.momentum_pct || 0))[0];

  const totalWindows = data?.total_windows_processed ?? 0;

  return (
    <div className="telemetry-hud-strip">
      {/* Gauge 1: Cumulative Units */}
      <div className="hud-metric-card">
        <div className="hud-card-header">
          <span className="hud-card-label">Cumulative Volume</span>
          <Boxes size={15} className="text-cyan-400" />
        </div>
        <div className="hud-card-value mono">
          {totalUnits.toLocaleString()}
          <span className="hud-card-unit">units</span>
        </div>
        <div className="hud-card-sub">
          <span>Top 10 Aggregate</span>
          {top10.length > 0 && (
            <span className="hud-sub-badge">
              avg {Math.round(totalUnits / top10.length).toLocaleString()} / item
            </span>
          )}
        </div>
      </div>

      {/* Gauge 2: Window Velocity Run */}
      <div className="hud-metric-card">
        <div className="hud-card-header">
          <span className="hud-card-label">Window Run Rate</span>
          <Activity size={15} className="text-emerald-400" />
        </div>
        <div className="hud-card-value mono">
          {currWinUnits.toLocaleString()}
          <span className="hud-card-unit">/ 60s win</span>
        </div>
        <div className="hud-card-sub">
          <span className={`hud-delta-pill ${delta >= 0 ? 'pill-up' : 'pill-down'}`}>
            {delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            <span>{Math.abs(delta)} ({deltaPct}%)</span>
          </span>
          <span className="mono text-muted text-xs">prev: {prevWinUnits}</span>
        </div>
      </div>

      {/* Gauge 3: #1 Velocity Rocket */}
      <div className="hud-metric-card hud-card-highlight">
        <div className="hud-card-header">
          <span className="hud-card-label flex items-center gap-1">
            <Flame size={14} className="text-amber-400" />
            <span>Top Surge Rocket</span>
          </span>
          {topGainer && (
            <button
              className="hud-quick-boost"
              onClick={() => onQuickSelectProduct?.(topGainer.product_id)}
              title="Load into Overdrive Simulator"
            >
              <Zap size={11} />
              <span>Boost</span>
            </button>
          )}
        </div>
        {topGainer ? (
          <>
            <div className="hud-card-value hud-name-truncate" title={topGainer.product_name}>
              {topGainer.product_name || `Product #${topGainer.product_id}`}
            </div>
            <div className="hud-card-sub">
              <span className="hud-surge-tag">
                +{typeof topGainer.momentum_pct === 'number' ? topGainer.momentum_pct.toFixed(0) : '0'}% surge
              </span>
              <span className="mono text-xs text-muted">ID #{topGainer.product_id}</span>
            </div>
          </>
        ) : (
          <div className="hud-card-sub text-muted">Awaiting momentum shifts…</div>
        )}
      </div>

      {/* Gauge 4: Hadoop Aggregator State */}
      <div className="hud-metric-card">
        <div className="hud-card-header">
          <span className="hud-card-label">Hadoop Reducer State</span>
          <HardDrive size={15} className="text-purple-400" />
        </div>
        <div className="hud-card-value mono">
          {totalWindows}
          <span className="hud-card-unit">completed</span>
        </div>
        <div className="hud-card-sub">
          <span className="hud-state-pill">Atomic JSON Synced</span>
          <span className="mono text-xs text-muted">/state/ranking_output</span>
        </div>
      </div>
    </div>
  );
}
