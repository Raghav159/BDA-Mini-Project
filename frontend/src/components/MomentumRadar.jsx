import React from 'react';
import {
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Radio,
  Gauge,
  Sparkles,
} from 'lucide-react';

export default function MomentumRadar({ movers = [], onSelectProductForBurst }) {
  const maxMom = Math.max(
    ...movers.map((m) => Math.abs(m.momentum_pct || 0)),
    1
  );

  return (
    <section className="momentum-radar-card">
      <div className="radar-card-header">
        <div className="radar-title-box">
          <div className="icon-pulse-box">
            <Gauge size={16} className="text-orange-400" />
          </div>
          <div>
            <h3 className="radar-title">Intraday Momentum Radar</h3>
            <span className="radar-subtitle">Top 5 accelerating SKUs in current window</span>
          </div>
        </div>
        <div className="radar-live-chip">
          <Radio size={11} className="nav-live-icon" />
          <span>ACCELERATION Δ</span>
        </div>
      </div>

      {movers.length === 0 ? (
        <div className="radar-empty-state">
          <Sparkles size={28} className="text-slate-400 animate-pulse" />
          <div className="empty-heading">Scanning Stream For Velocity Spikes</div>
          <div className="empty-desc">
            Momentum surges trigger once tumbling windows detect sudden purchasing shifts.
          </div>
        </div>
      ) : (
        <div className="movers-stream">
          {movers.slice(0, 5).map((item, idx) => {
            const gaugePct = Math.min(
              100,
              Math.max(10, (Math.abs(item.momentum_pct || 0) / maxMom) * 100)
            );
            const delta = (item.current_window_units ?? 0) - (item.previous_window_units ?? 0);
            const momPct = typeof item.momentum_pct === 'number' ? item.momentum_pct : 0;

            return (
              <div key={item.product_id ?? idx} className="mover-stream-row">
                {/* Left: Position Rank & Name */}
                <div className="mover-head-group">
                  <span className={`mover-rank-badge rank-pos-${idx + 1}`}>#{idx + 1}</span>
                  <div className="mover-titles">
                    <div className="mover-title-text" title={item.product_name}>
                      {item.product_name || `Product #${item.product_id}`}
                    </div>
                    <div className="mover-sku-row">
                      <span className="mono">ID #{item.product_id}</span>
                      <span className="meta-dot">•</span>
                      <span>{(item.total_units || 0).toLocaleString()} units total</span>
                    </div>
                  </div>
                </div>

                {/* Right: Momentum Rate & Boost Trigger */}
                <div className="mover-rate-group">
                  <div className="mover-run-delta">
                    <span className="mono font-semibold">{item.current_window_units ?? 0}</span>
                    <span className="delta-sub text-xs">
                      {delta >= 0 ? `(+${delta})` : `(${delta})`}
                    </span>
                  </div>

                  <span className={`mover-pct-tag ${momPct > 0 ? 'tag-up' : momPct < 0 ? 'tag-down' : 'tag-neutral'}`}>
                    {momPct > 0 ? <TrendingUp size={11} /> : momPct < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                    <span className="mono">{momPct > 0 ? `+${momPct.toFixed(0)}%` : `${momPct.toFixed(0)}%`}</span>
                  </span>

                  <button
                    className="mover-mini-boost"
                    onClick={() => onSelectProductForBurst?.(item.product_id)}
                    title={`Trigger spike for ${item.product_name}`}
                  >
                    <Zap size={11} />
                  </button>
                </div>

                {/* Bottom: Surge Intensity Heat Meter */}
                <div className="mover-heat-track">
                  <div
                    className="mover-heat-fill"
                    style={{ width: `${gaugePct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
