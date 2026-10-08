import React from 'react';

export default function MomentumMovers({ movers = [], onSelectProductForBurst }) {
  const renderMomentumBadge = (momentumPct, direction) => {
    const dir = direction?.toLowerCase() || (momentumPct > 0 ? 'up' : momentumPct < 0 ? 'down' : 'neutral');
    let arrow = '―';
    if (dir === 'up') arrow = '▲';
    if (dir === 'down') arrow = '▼';

    const formattedPct = typeof momentumPct === 'number'
      ? `${momentumPct > 0 ? '+' : ''}${momentumPct.toFixed(0)}%`
      : '0%';

    return (
      <span className={`mover-velocity-pill mover-${dir}`}>
        <span className="arrow">{arrow}</span>
        <span className="mono">{formattedPct}</span>
      </span>
    );
  };

  // Find max momentum for normalization
  const maxMomentum = Math.max(
    ...movers.map((m) => Math.abs(m.momentum_pct || 0)),
    100
  );

  return (
    <div className="dashboard-panel movers-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon flame-icon">🔥</span>
          <div>
            <h3>Top 5 Momentum Movers</h3>
            <p className="panel-subtitle">Fastest Intraday Acceleration in Current Window</p>
          </div>
        </div>
        <span className="pipeline-micro-badge">Intraday Delta</span>
      </div>

      {!movers || movers.length === 0 ? (
        <div className="empty-state-card mini-empty">
          <span className="empty-icon">📈</span>
          <p className="empty-state-title">No Intraday Surges Detected</p>
          <span className="empty-state-sub">Velocity shifts will appear once tumbling windows record spikes.</span>
        </div>
      ) : (
        <div className="movers-stack">
          {movers.slice(0, 5).map((item, index) => {
            const gaugePct = Math.min(100, Math.max(10, ((item.momentum_pct || 0) / maxMomentum) * 100));
            const delta = (item.current_window_units ?? 0) - (item.previous_window_units ?? 0);

            return (
              <div key={item.product_id || index} className="mover-card-pro">
                <div className="mover-top-row">
                  <div className="mover-identity">
                    <span className="mover-rank-badge">#{index + 1}</span>
                    <div className="mover-name-wrap">
                      <span className="mover-title" title={item.product_name}>
                        {item.product_name || `Product #${item.product_id}`}
                      </span>
                      <span className="mover-meta mono">
                        ID: {item.product_id} • Total: {item.total_units?.toLocaleString() ?? 0} units
                      </span>
                    </div>
                  </div>
                  <div className="mover-badge-action">
                    {renderMomentumBadge(item.momentum_pct, item.momentum_direction)}
                  </div>
                </div>

                {/* Velocity shift indicator */}
                <div className="mover-metrics-strip">
                  <div className="mover-stat-bit">
                    <span className="bit-label">Current Win</span>
                    <span className="bit-val mono">{item.current_window_units ?? 0}</span>
                  </div>
                  <div className="mover-stat-divider">➔</div>
                  <div className="mover-stat-bit">
                    <span className="bit-label">Prev Win</span>
                    <span className="bit-val mono">{item.previous_window_units ?? 0}</span>
                  </div>
                  <div className="mover-stat-bit bit-delta">
                    <span className="bit-label">Window Jump</span>
                    <span className="bit-val mono delta-up">
                      +{delta} units
                    </span>
                  </div>
                  <button
                    className="mover-quick-inject-btn"
                    onClick={() => onSelectProductForBurst && onSelectProductForBurst(item.product_id)}
                    title={`Inject burst signal for ${item.product_name}`}
                  >
                    ⚡ Boost
                  </button>
                </div>

                {/* Heat surge gauge bar */}
                <div className="surge-gauge-bg">
                  <div
                    className="surge-gauge-fill"
                    style={{ width: `${gaugePct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
