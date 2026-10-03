import React from 'react';

export default function RankingTable({ items = [], isLoading, error }) {
  if (isLoading) {
    return (
      <div className="dashboard-card">
        <div className="card-title-bar">
          <h2>🏆 Top 10 Products by Total Sales</h2>
        </div>
        <div className="state-box">
          <div className="spinner"></div>
          <p>Fetching real-time rankings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-card">
        <div className="card-title-bar">
          <h2>🏆 Top 10 Products by Total Sales</h2>
        </div>
        <div className="state-box">
          <span className="state-icon">⚠️</span>
          <p style={{ color: 'var(--status-down)' }}>Failed to load rankings: {error}</p>
          <span style={{ fontSize: '0.8rem' }}>Check backend API status at http://localhost:8000/api/rankings</span>
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="dashboard-card">
        <div className="card-title-bar">
          <h2>🏆 Top 10 Products by Total Sales</h2>
        </div>
        <div className="state-box">
          <span className="state-icon">⏳</span>
          <p>No ranking data available yet.</p>
          <span style={{ fontSize: '0.8rem' }}>MapReduce pipeline outputs will appear here after the first window processing.</span>
        </div>
      </div>
    );
  }

  const getRankClass = (rank) => {
    if (rank === 1) return 'rank-1';
    if (rank === 2) return 'rank-2';
    if (rank === 3) return 'rank-3';
    return 'rank-other';
  };

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
        <h2>🏆 Top 10 Products by Total Sales</h2>
        <span className="pipeline-badge">{items.length} Products</span>
      </div>

      <div className="table-responsive">
        <table className="ranking-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Product</th>
              <th>Total Units</th>
              <th>Current Window</th>
              <th>Previous Window</th>
              <th>Momentum</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.product_id || item.rank}>
                <td>
                  <span className={`rank-badge ${getRankClass(item.rank)}`}>
                    {item.rank}
                  </span>
                </td>
                <td>
                  <div className="product-info">
                    <span className="product-name">{item.product_name || `Product #${item.product_id}`}</span>
                    <span className="product-meta mono">ID: {item.product_id}</span>
                  </div>
                </td>
                <td className="mono" style={{ fontWeight: 600 }}>
                  {item.total_units?.toLocaleString() ?? 0}
                </td>
                <td className="mono">
                  {item.current_window_units?.toLocaleString() ?? 0}
                </td>
                <td className="mono" style={{ color: 'var(--text-muted)' }}>
                  {item.previous_window_units?.toLocaleString() ?? 0}
                </td>
                <td>
                  {renderMomentumBadge(item.momentum_pct, item.momentum_direction)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
