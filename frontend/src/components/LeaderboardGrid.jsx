import React, { useState, useMemo } from 'react';
import {
  Search,
  X,
  Filter,
  Flame,
  TrendingDown,
  Trophy,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Zap,
  Rocket,
  Unplug,
  TrendingUp,
  Minus,
  Radio,
} from 'lucide-react';

export default function LeaderboardGrid({
  items = [],
  isLoading,
  error,
  isBuffering = false,
  onSelectProductForBurst,
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortField, setSortField] = useState('rank');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedId, setExpandedId] = useState(null);

  const maxUnits = useMemo(
    () => Math.max(...items.map((i) => i.total_units || 0), 1),
    [items]
  );

  const processed = useMemo(() => {
    let res = [...items];
    if (search.trim()) {
      const q = search.toLowerCase();
      res = res.filter(
        (i) =>
          i.product_name?.toLowerCase().includes(q) ||
          String(i.product_id).includes(q)
      );
    }
    if (filter === 'surging') res = res.filter((i) => (i.momentum_pct || 0) > 0);
    if (filter === 'cooling') res = res.filter((i) => (i.momentum_pct || 0) < 0);
    if (filter === 'podium') res = res.filter((i) => i.rank <= 3);

    res.sort((a, b) => {
      const va =
        sortField === 'rank'
          ? (a.rank ?? 999)
          : sortField === 'units'
          ? (a.total_units ?? 0)
          : sortField === 'current'
          ? (a.current_window_units ?? 0)
          : (a.momentum_pct ?? 0);
      const vb =
        sortField === 'rank'
          ? (b.rank ?? 999)
          : sortField === 'units'
          ? (b.total_units ?? 0)
          : sortField === 'current'
          ? (b.current_window_units ?? 0)
          : (b.momentum_pct ?? 0);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return res;
  }, [items, search, filter, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir(field === 'rank' ? 'asc' : 'desc');
    }
  };

  const SortHeader = ({ field, label, width }) => {
    const active = sortField === field;
    return (
      <th
        className={`grid-th ${active ? 'th-active' : ''}`}
        style={width ? { width } : {}}
        onClick={() => handleSort(field)}
      >
        <div className="th-flex">
          <span>{label}</span>
          <span className="th-sort-icon">
            {active ? (
              sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />
            ) : (
              <ChevronsUpDown size={13} />
            )}
          </span>
        </div>
      </th>
    );
  };

  if (isLoading) {
    return (
      <div className="telemetry-panel">
        <div className="telemetry-loading-state">
          <div className="cyber-spinner" />
          <div className="loading-title">Loading MapReduce State…</div>
          <div className="loading-sub">Fetching latest window rankings from Hadoop cluster</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="telemetry-panel">
        <div className="telemetry-error-state">
          <Unplug size={36} className="text-rose-400" />
          <div className="error-title">Leaderboard Offline</div>
          <div className="error-sub">{error}</div>
          <div className="error-hint">Backend not reachable at http://localhost:8000/api/rankings</div>
        </div>
      </div>
    );
  }

  return (
    <div className="telemetry-panel">
      {/* Panel Header */}
      <div className="panel-title-strip">
        <div className="panel-title-text-group">
          <h3 className="panel-box-title">Leaderboard · Top 10 Cumulative Sales</h3>
          <span className="panel-box-sub">Hadoop MapReduce tumbling window aggregation · Intraday velocity delta</span>
        </div>
        <span className="tag-mono tag-cyan">{processed.length} products</span>
      </div>

      {/* Search & Filter Header Bar */}
      <div className="grid-toolbar">
        <div className="search-pill">
          <Search size={14} className="search-pill-icon" />
          <input
            type="text"
            className="search-pill-input"
            placeholder="Search products by SKU or title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-pill-clear" onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>

        <div className="filter-group">
          {[
            { key: 'all', label: 'All Items', icon: Filter },
            { key: 'surging', label: 'Surging', icon: Flame },
            { key: 'cooling', label: 'Cooling', icon: TrendingDown },
            { key: 'podium', label: 'Podium', icon: Trophy },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                className={`filter-btn ${filter === f.key ? 'filter-active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                <Icon size={12} />
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* High-Density Stream Table */}
      <div className="grid-table-container">
        <table className="grid-table">
          <thead>
            <tr>
              <SortHeader field="rank" label="Rank" width="70px" />
              <th className="grid-th">Product SKU &amp; Title</th>
              <SortHeader field="units" label="Cumulative Units" width="160px" />
              <SortHeader field="current" label="60s Velocity" width="140px" />
              <SortHeader field="momentum" label="Momentum Δ%" width="130px" />
              <th className="grid-th text-right" style={{ width: '90px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {processed.length === 0 ? (
              <tr>
                <td colSpan="6">
                  <div className="table-empty-box">
                    {isBuffering ? (
                      <>
                        <Radio size={28} className="text-amber-400 nav-live-icon" />
                        <div className="empty-title text-amber-400">Buffering Window #1 Transactions</div>
                        <div className="empty-sub">
                          Events are streaming from Kafka into HDFS. The first 60s tumbling window MapReduce aggregation will populate automatically once the window closes.
                        </div>
                      </>
                    ) : (
                      <>
                        <Search size={28} className="text-slate-400" />
                        <div className="empty-title">No matching products in current window</div>
                        <div className="empty-sub">Try broadening your search query or reset filters</div>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              processed.map((item) => {
                const isExpanded = expandedId === item.product_id;
                const volumePct = Math.round(((item.total_units || 0) / maxUnits) * 100);
                const delta = (item.current_window_units || 0) - (item.previous_window_units || 0);
                const momPct = typeof item.momentum_pct === 'number' ? item.momentum_pct : 0;

                return (
                  <React.Fragment key={item.product_id ?? item.rank}>
                    <tr
                      className={`grid-row ${isExpanded ? 'row-expanded' : ''}`}
                      onClick={() => setExpandedId(isExpanded ? null : item.product_id)}
                    >
                      {/* Rank Badge */}
                      <td className="grid-td td-rank">
                        <span className={`rank-chip rank-chip-${item.rank <= 3 ? item.rank : 'std'}`}>
                          #{item.rank}
                        </span>
                      </td>

                      {/* Product Name */}
                      <td className="grid-td td-product">
                        <div className="product-title" title={item.product_name}>
                          {item.product_name || `Product #${item.product_id}`}
                        </div>
                        <div className="product-meta-sub">
                          <span className="mono">ID: {item.product_id}</span>
                          <span className="meta-dot">•</span>
                          <span>{volumePct}% of leader</span>
                        </div>
                      </td>

                      {/* Volume Bar & Units */}
                      <td className="grid-td td-volume">
                        <div className="volume-val-row">
                          <span className="volume-number mono">{(item.total_units || 0).toLocaleString()}</span>
                          <span className="volume-unit">units</span>
                        </div>
                        <div className="stream-bar-bg">
                          <div
                            className="stream-bar-fill"
                            style={{ width: `${Math.max(6, Math.min(100, volumePct))}%` }}
                          />
                        </div>
                      </td>

                      {/* Window Velocity */}
                      <td className="grid-td td-velocity">
                        <div className="velocity-run-row mono">
                          <span className="curr-run">{item.current_window_units ?? 0}</span>
                          <span className="vel-divider">/</span>
                          <span className="prev-run">{item.previous_window_units ?? 0}</span>
                        </div>
                        <div className={`velocity-diff ${delta >= 0 ? 'diff-up' : 'diff-down'}`}>
                          {delta >= 0 ? `+${delta}` : delta} shift
                        </div>
                      </td>

                      {/* Momentum Pill */}
                      <td className="grid-td td-momentum">
                        <span className={`grid-mom-pill ${momPct > 0 ? 'mom-up' : momPct < 0 ? 'mom-down' : 'mom-neutral'}`}>
                          {momPct > 0 ? <TrendingUp size={11} /> : momPct < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                          <span className="mono">{momPct > 0 ? `+${momPct.toFixed(1)}%` : `${momPct.toFixed(1)}%`}</span>
                        </span>
                      </td>

                      {/* Action */}
                      <td className="grid-td td-action text-right">
                        <button
                          className="grid-spike-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectProductForBurst?.(item.product_id);
                          }}
                          title={`Deploy burst traffic on #${item.product_id}`}
                        >
                          <Zap size={11} />
                          <span>Spike</span>
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Inspector Row */}
                    {isExpanded && (
                      <tr className="grid-details-row">
                        <td colSpan="6">
                          <div className="details-card-inner">
                            <div className="details-grid">
                              <div className="detail-item">
                                <span className="detail-label">Full SKU Name</span>
                                <span className="detail-value">{item.product_name}</span>
                              </div>
                              <div className="detail-item">
                                <span className="detail-label">Cluster Kafka ID</span>
                                <span className="detail-value mono">#{item.product_id}</span>
                              </div>
                              <div className="detail-item">
                                <span className="detail-label">Current Tumbling Run Rate</span>
                                <span className="detail-value mono">{item.current_window_units} units / 60s</span>
                              </div>
                              <div className="detail-item">
                                <span className="detail-label">Velocity Acceleration</span>
                                <span className="detail-value mono">
                                  {delta >= 0 ? `+${delta}` : delta} units ({momPct.toFixed(1)}% mom)
                                </span>
                              </div>
                            </div>
                            <div className="details-action-bar">
                              <button
                                className="details-trigger-burst"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectProductForBurst?.(item.product_id);
                                }}
                              >
                                <Rocket size={13} />
                                <span>Load into Kafka Overdrive Simulator</span>
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
