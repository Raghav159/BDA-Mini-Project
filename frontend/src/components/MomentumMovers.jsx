import React from 'react';
import {
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
} from 'lucide-react';

const RANK_COLORS = [
  'mover-rank-1', 'mover-rank-2', 'mover-rank-3', 'mover-rank-n', 'mover-rank-n',
];

function MomentumBadge({ pct, direction }) {
  const dir = direction?.toLowerCase() || (pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral');
  const fmt = typeof pct === 'number' ? `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%` : '0%';
  return (
    <span className={`mom-pill mom-pill-${dir}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
      {dir === 'up' ? <TrendingUp size={11} /> : dir === 'down' ? <TrendingDown size={11} /> : <Minus size={11} />}
      <span className="mono">{fmt}</span>
    </span>
  );
}

export default function MomentumMovers({ movers = [], onSelectProductForBurst }) {
  const maxMom = Math.max(...movers.map(m => Math.abs(m.momentum_pct || 0)), 1);

  return (
    <div className="panel">
      <div className="panel-hdr">
        <div className="panel-title-group">
          <div className="panel-icon-wrap panel-icon-wrap-orange">
            <Flame size={16} />
          </div>
          <div>
            <div className="panel-heading">Top 5 Momentum Movers</div>
            <div className="panel-sub">Fastest intraday acceleration · Current window</div>
          </div>
        </div>
        <div className="panel-badges">
          <span className="badge badge-live">Live</span>
          <span className="badge badge-count">Intraday Δ</span>
        </div>
      </div>

      {movers.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <TrendingUp size={32} />
          </span>
          <div className="empty-title">No surges detected yet</div>
          <div className="empty-sub">
            Velocity shifts appear once tumbling windows record intraday spikes.
          </div>
        </div>
      ) : (
        <div className="movers-list">
          {movers.slice(0, 5).map((item, idx) => {
            const gaugePct = Math.min(100, Math.max(8, (Math.abs(item.momentum_pct || 0) / maxMom) * 100));
            const delta    = (item.current_window_units ?? 0) - (item.previous_window_units ?? 0);
            const rankCls  = RANK_COLORS[idx] || 'mover-rank-n';

            return (
              <div key={item.product_id ?? idx} className="mover-card" style={{ animationDelay: `${idx * 0.05}s` }}>
                {/* Top row: identity + momentum badge */}
                <div className="mover-top">
                  <div className="mover-identity">
                    <span className={`mover-rank ${rankCls}`}>#{idx + 1}</span>
                    <div className="mover-name-wrap">
                      <div className="mover-name" title={item.product_name}>
                        {item.product_name || `Product #${item.product_id}`}
                      </div>
                      <div className="mover-meta">
                        ID: {item.product_id} · {(item.total_units || 0).toLocaleString()} units total
                      </div>
                    </div>
                  </div>
                  <MomentumBadge pct={item.momentum_pct} direction={item.momentum_direction} />
                </div>

                {/* Stats strip */}
                <div className="mover-stats">
                  <div className="mover-stat">
                    <span className="mover-stat-lbl">Curr Win</span>
                    <span className="mover-stat-val">{item.current_window_units ?? 0}</span>
                  </div>
                  <span className="mover-stat-sep">→</span>
                  <div className="mover-stat">
                    <span className="mover-stat-lbl">Prev Win</span>
                    <span className="mover-stat-val">{item.previous_window_units ?? 0}</span>
                  </div>
                  <span className="mover-stat-sep">·</span>
                  <div className="mover-stat">
                    <span className="mover-stat-lbl">Jump</span>
                    <span className={`mover-stat-val ${delta >= 0 ? 'mover-delta-pos' : 'mover-delta-neg'}`}>
                      {delta >= 0 ? `+${delta}` : delta}
                    </span>
                  </div>

                  <button
                    className="mover-boost-btn"
                    onClick={() => onSelectProductForBurst?.(item.product_id)}
                    title={`Inject burst for ${item.product_name}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Zap size={11} />
                    <span>Boost</span>
                  </button>
                </div>

                {/* Heat gauge */}
                <div className="heat-bar-bg">
                  <div className="heat-bar-fill" style={{ width: `${gaugePct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
