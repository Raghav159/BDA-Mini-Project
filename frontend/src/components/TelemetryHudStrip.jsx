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

  // Top 10 cumulative sum & average
  const top10Cumulative = top10.reduce((s, i) => s + (i.total_units || 0), 0);
  const avgPerTopItem = top10.length > 0 ? Math.round(top10Cumulative / top10.length) : 0;

  // Top 10 current window velocity & delta vs previous window
  const top10CurrentWinUnits = top10.reduce((s, i) => s + (i.current_window_units || 0), 0);
  const top10PrevWinUnits = top10.reduce((s, i) => s + (i.previous_window_units || 0), 0);
  const delta = top10CurrentWinUnits - top10PrevWinUnits;
  const deltaPct = top10PrevWinUnits > 0 ? ((delta / top10PrevWinUnits) * 100).toFixed(1) : '0.0';

  // Total cluster-wide units in current window (across all SKUs)
  const totalClusterUnits = data?.total_window_units;

  // Catalog-wide top accelerator from momentum movers (ranking criteria: highest % delta)
  const topGainer =
    movers[0] ||
    [...top10].sort((a, b) => (b.momentum_pct || 0) - (a.momentum_pct || 0))[0];

  const totalWindows = data?.total_windows_processed ?? 0;

  return (
    <div className="telemetry-hud-strip">
      {/* Gauge 1: Top 10 Cumulative Sales Volume */}
      <div className="hud-metric-card">
        <div className="hud-card-header">
          <span className="hud-card-label">Top 10 Cumulative Sales</span>
          <Boxes size={15} className="text-cyan-400" />
        </div>
        <div className="hud-card-value mono">
          {top10Cumulative.toLocaleString()}
          <span className="hud-card-unit">units</span>
        </div>
        <div className="hud-card-sub">
          <span>Top 10 Aggregate</span>
          {top10.length > 0 && (
            <span className="hud-sub-badge">
              avg {avgPerTopItem.toLocaleString()} / item
            </span>
          )}
        </div>
      </div>

      {/* Gauge 2: Top 10 Window Velocity */}
      <div className="hud-metric-card">
        <div className="hud-card-header">
          <span className="hud-card-label">Top 10 Window Velocity</span>
          <Activity size={15} className="text-emerald-400" />
        </div>
        <div className="hud-card-value mono">
          {top10CurrentWinUnits.toLocaleString()}
          <span className="hud-card-unit">/ 60s window</span>
        </div>
        <div className="hud-card-sub">
          <span className={`hud-delta-pill ${delta >= 0 ? 'pill-up' : 'pill-down'}`}>
            {delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            <span>{delta >= 0 ? `+${delta}` : delta} ({deltaPct}%)</span>
          </span>
          {totalClusterUnits !== undefined && (
            <span className="mono text-muted text-xs">
              cluster total: {totalClusterUnits.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Gauge 3: #1 Momentum Accelerator (Catalog-Wide) */}
      <div className="hud-metric-card hud-card-highlight">
        <div className="hud-card-header">
          <span className="hud-card-label flex items-center gap-1">
            <Flame size={14} className="text-amber-400" />
            <span>#1 Momentum Accelerator</span>
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
                +{typeof topGainer.momentum_pct === 'number' ? topGainer.momentum_pct.toFixed(1) : '0.0'}% surge
              </span>
              <span className="mono text-xs text-muted">ID #{topGainer.product_id} · Catalog-wide</span>
            </div>
          </>
        ) : (
          <div className="hud-card-sub text-muted">Awaiting momentum shifts…</div>
        )}
      </div>

      {/* Gauge 4: Hadoop Reducer State */}
      <div className="hud-metric-card">
        <div className="hud-card-header">
          <span className="hud-card-label">Hadoop Batches Completed</span>
          <HardDrive size={15} className="text-purple-400" />
        </div>
        <div className="hud-card-value mono">
          {totalWindows}
          <span className="hud-card-unit">reduced</span>
        </div>
        <div className="hud-card-sub">
          <span className="hud-state-pill">Atomic JSON Synced</span>
          <span className="mono text-xs text-muted">/state/ranking_output</span>
        </div>
      </div>
    </div>
  );
}
