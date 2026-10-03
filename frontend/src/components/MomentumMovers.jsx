import React from 'react';

export default function MomentumMovers({ movers = [] }) {
  const renderMomentumBadge = (momentumPct, direction) => {
    const dir = direction?.toLowerCase() || (momentumPct > 0 ? 'up' : momentumPct < 0 ? 'down' : 'neutral');
    let arrow = '―';
    if (dir === 'up') arrow = '▲';
    if (dir === 'down') arrow = '▼';

    const formattedPct = typeof momentumPct === 'number'
      ? `${momentumPct > 0 ? '+' : ''}${momentumPct.toFixed(1)}%`
      : '0.0%';

    return (
      <span className={`momentum-pill ${dir}`}>
        <span>{arrow}</span>
        <span>{formattedPct}</span>
      </span>
    );
  };

  return (
    <div className="dashboard-card">
      <div className="card-title-bar">
        <h2>🔥 Top 5 Momentum Movers</h2>
        <span className="pipeline-badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          Intraday Velocity
        </span>
      </div>

      {!movers || movers.length === 0 ? (
        <div className="state-box" style={{ padding: '24px 12px' }}>
          <span style={{ fontSize: '1.2rem' }}>📈</span>
          <p style={{ fontSize: '0.85rem' }}>No momentum surge detected in current window.</p>
        </div>
      ) : (
        <div className="movers-list">
          {movers.slice(0, 5).map((item, index) => (
            <div key={item.product_id || index} className="mover-card">
              <div className="mover-details">
                <span className="mover-name">{item.product_name || `Product #${item.product_id}`}</span>
                <span className="mover-units mono">
                  ID: {item.product_id} • {item.current_window_units ?? 0} curr / {item.previous_window_units ?? 0} prev ({item.total_units ?? 0} total)
                </span>
              </div>
              <div>
                {renderMomentumBadge(item.momentum_pct, item.momentum_direction)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
