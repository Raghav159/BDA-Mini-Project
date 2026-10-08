import React, { useState, useMemo } from 'react';

export default function RankingTable({ items = [], isLoading, error, onSelectProductForBurst }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'surging', 'cooling', 'podium'
  const [sortField, setSortField] = useState('rank'); // 'rank', 'units', 'current', 'momentum'
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'
  const [expandedId, setExpandedId] = useState(null);

  // Maximum total units among items for proportional bar calculation
  const maxTotalUnits = useMemo(() => {
    if (!items.length) return 1;
    return Math.max(...items.map((i) => i.total_units || 0), 1);
  }, [items]);

  // Filtered and sorted items
  const processedItems = useMemo(() => {
    let result = [...items];

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.product_name?.toLowerCase().includes(q) ||
          String(item.product_id).includes(q)
      );
    }

    // Category filter
    if (filterMode === 'surging') {
      result = result.filter((item) => (item.momentum_pct || 0) > 0);
    } else if (filterMode === 'cooling') {
      result = result.filter((item) => (item.momentum_pct || 0) < 0);
    } else if (filterMode === 'podium') {
      result = result.filter((item) => item.rank <= 3);
    }

    // Sorting
    result.sort((a, b) => {
      let valA, valB;
      if (sortField === 'rank') {
        valA = a.rank ?? 999;
        valB = b.rank ?? 999;
      } else if (sortField === 'units') {
        valA = a.total_units ?? 0;
        valB = b.total_units ?? 0;
      } else if (sortField === 'current') {
        valA = a.current_window_units ?? 0;
        valB = b.current_window_units ?? 0;
      } else if (sortField === 'momentum') {
        valA = a.momentum_pct ?? 0;
        valB = b.momentum_pct ?? 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [items, searchTerm, filterMode, sortField, sortDirection]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      // Sensible default directions
      setSortDirection(field === 'rank' ? 'asc' : 'desc');
    }
  };

  const getRankBadge = (rank) => {
    if (rank === 1) {
      return (
        <span className="rank-podium rank-gold" title="Rank #1 Leader">
          <span className="rank-crown">👑</span> 1
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="rank-podium rank-silver" title="Rank #2 Runner-up">
          <span className="rank-crown">🥈</span> 2
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="rank-podium rank-bronze" title="Rank #3 Podium">
          <span className="rank-crown">🥉</span> 3
        </span>
      );
    }
    return <span className="rank-badge rank-standard">{rank}</span>;
  };

  const renderMomentumPill = (pct, direction) => {
    const dir = direction?.toLowerCase() || (pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral');
    const isUp = dir === 'up';
    const isDown = dir === 'down';
    const arrow = isUp ? '▲' : isDown ? '▼' : '―';
    const formatted = typeof pct === 'number' ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '0.0%';

    return (
      <span className={`momentum-pill momentum-${dir}`}>
        <span className="momentum-arrow">{arrow}</span>
        <span className="mono">{formatted}</span>
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="dashboard-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span className="panel-icon">🏆</span>
            <h2>Top 10 Products by Total Sales</h2>
          </div>
        </div>
        <div className="empty-state-card">
          <div className="pulse-spinner"></div>
          <p className="empty-state-title">Loading MapReduce State...</p>
          <span className="empty-state-sub">Fetching latest verified window rankings</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span className="panel-icon">⚠️</span>
            <h2>Top 10 Products by Total Sales</h2>
          </div>
        </div>
        <div className="empty-state-card error-state">
          <span className="empty-icon">🔌</span>
          <p className="empty-state-title" style={{ color: 'var(--status-down)' }}>
            Ranking State Unavailable
          </p>
          <p className="empty-state-sub">{error}</p>
          <span className="empty-state-hint mono">Endpoint: http://localhost:8000/api/rankings</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-panel">
      {/* Panel Top Bar */}
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon">🏆</span>
          <div>
            <h2>Leaderboard: Top 10 Cumulative Sales</h2>
            <p className="panel-subtitle">
              Calculated across Hadoop MapReduce tumbling partitions with Intraday Velocity delta
            </p>
          </div>
        </div>
        <div className="panel-badge-group">
          <span className="counter-pill">{processedItems.length} Products</span>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="table-toolbar">
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Filter by product name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="clear-search-btn" onClick={() => setSearchTerm('')}>
              ✕
            </button>
          )}
        </div>

        <div className="filter-chips">
          <button
            className={`filter-chip ${filterMode === 'all' ? 'active' : ''}`}
            onClick={() => setFilterMode('all')}
          >
            All Products
          </button>
          <button
            className={`filter-chip ${filterMode === 'surging' ? 'active' : ''}`}
            onClick={() => setFilterMode('surging')}
          >
            🔥 Surging (▲)
          </button>
          <button
            className={`filter-chip ${filterMode === 'cooling' ? 'active' : ''}`}
            onClick={() => setFilterMode('cooling')}
          >
            ❄️ Cooling (▼)
          </button>
          <button
            className={`filter-chip ${filterMode === 'podium' ? 'active' : ''}`}
            onClick={() => setFilterMode('podium')}
          >
            👑 Podium Top 3
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="table-responsive-container">
        <table className="modern-table">
          <thead>
            <tr>
              <th className="th-sortable" onClick={() => handleSort('rank')}>
                <div className="th-content">
                  <span>Rank</span>
                  <span className="sort-indicator">{sortField === 'rank' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
                </div>
              </th>
              <th>Product Details</th>
              <th className="th-sortable" onClick={() => handleSort('units')}>
                <div className="th-content">
                  <span>Cumulative Units</span>
                  <span className="sort-indicator">{sortField === 'units' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
                </div>
              </th>
              <th className="th-sortable" onClick={() => handleSort('current')}>
                <div className="th-content">
                  <span>Window Velocity (Curr vs Prev)</span>
                  <span className="sort-indicator">{sortField === 'current' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
                </div>
              </th>
              <th className="th-sortable" onClick={() => handleSort('momentum')}>
                <div className="th-content">
                  <span>Intraday Momentum</span>
                  <span className="sort-indicator">{sortField === 'momentum' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
                </div>
              </th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {processedItems.length === 0 ? (
              <tr>
                <td colSpan="6" className="no-data-cell">
                  <div className="empty-sub-state">
                    <span>🔎 No products match the current filter or search criteria.</span>
                  </div>
                </td>
              </tr>
            ) : (
              processedItems.map((item) => {
                const isExpanded = expandedId === item.product_id;
                const volumeSharePct = ((item.total_units / maxTotalUnits) * 100).toFixed(0);
                const winDelta = (item.current_window_units || 0) - (item.previous_window_units || 0);

                return (
                  <React.Fragment key={item.product_id || item.rank}>
                    <tr
                      className={`table-row ${isExpanded ? 'row-expanded' : ''} ${item.rank <= 3 ? `podium-row podium-${item.rank}` : ''}`}
                      onClick={() => setExpandedId(isExpanded ? null : item.product_id)}
                    >
                      {/* Rank */}
                      <td className="td-rank">
                        {getRankBadge(item.rank)}
                      </td>

                      {/* Product Name & ID */}
                      <td className="td-product">
                        <div className="product-cell-wrap">
                          <span className="product-title">{item.product_name || `Product #${item.product_id}`}</span>
                          <div className="product-sub-row">
                            <span className="product-id-tag mono">ID: {item.product_id}</span>
                            <span className="share-tag">{volumeSharePct}% of leader</span>
                          </div>
                        </div>
                      </td>

                      {/* Total Units with proportional volume bar */}
                      <td className="td-units">
                        <div className="units-cell-wrap">
                          <span className="units-val mono">{item.total_units?.toLocaleString() ?? 0}</span>
                          <div className="volume-bar-bg" title={`${volumeSharePct}% volume proportion`}>
                            <div
                              className="volume-bar-fill"
                              style={{ width: `${Math.max(5, Math.min(100, volumeSharePct))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Window Velocity: Current vs Previous */}
                      <td className="td-window-velocity">
                        <div className="velocity-compare-wrap">
                          <div className="velocity-numbers mono">
                            <span className="curr-units">{item.current_window_units ?? 0}</span>
                            <span className="vs-divider">/</span>
                            <span className="prev-units">{item.previous_window_units ?? 0}</span>
                          </div>
                          <div className="mini-velocity-spark" title={`Delta: ${winDelta >= 0 ? '+' : ''}${winDelta} units`}>
                            <span className={`delta-tag ${winDelta > 0 ? 'delta-pos' : winDelta < 0 ? 'delta-neg' : 'delta-zero'}`}>
                              {winDelta > 0 ? `+${winDelta}` : winDelta}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Momentum % */}
                      <td className="td-momentum">
                        {renderMomentumPill(item.momentum_pct, item.momentum_direction)}
                      </td>

                      {/* Actions */}
                      <td className="td-actions" style={{ textAlign: 'right' }}>
                        <button
                          className="row-burst-trigger-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectProductForBurst) {
                              onSelectProductForBurst(item.product_id);
                            }
                          }}
                          title={`Target Product #${item.product_id} in Burst Trigger`}
                        >
                          ⚡ Burst
                        </button>
                      </td>
                    </tr>

                    {/* Expandable row detail */}
                    {isExpanded && (
                      <tr className="expanded-detail-row">
                        <td colSpan="6">
                          <div className="expanded-detail-box">
                            <div className="detail-col">
                              <span className="detail-label">Product Name</span>
                              <span className="detail-val">{item.product_name}</span>
                            </div>
                            <div className="detail-col">
                              <span className="detail-label">Kafka Product ID</span>
                              <span className="detail-val mono">#{item.product_id}</span>
                            </div>
                            <div className="detail-col">
                              <span className="detail-label">Current Window Run Rate</span>
                              <span className="detail-val mono">{item.current_window_units} units/60s</span>
                            </div>
                            <div className="detail-col">
                              <span className="detail-label">Window-over-Window Shift</span>
                              <span className="detail-val mono">
                                {winDelta >= 0 ? `+${winDelta}` : winDelta} units ({item.momentum_pct?.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="detail-col action-col">
                              <button
                                className="expanded-action-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onSelectProductForBurst) {
                                    onSelectProductForBurst(item.product_id);
                                  }
                                }}
                              >
                                🚀 Inject Spike Traffic for this Product
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
