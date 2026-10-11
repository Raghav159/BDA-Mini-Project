import React, { useState, useMemo } from 'react';
import {
  Trophy,
  Medal,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  X,
  Flame,
  Crown,
  Zap,
  Rocket,
  AlertTriangle,
  Unplug,
} from 'lucide-react';

const ROW_CLASS = { 1: 'row-gold', 2: 'row-silver', 3: 'row-bronze' };

function RankBadge({ rank }) {
  if (rank === 1) {
    return (
      <span className="rank-badge rank-badge-gold" title="Rank #1 Leader">
        <Trophy size={13} strokeWidth={2.4} />
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="rank-badge rank-badge-silver" title="Rank #2 Podium">
        <Medal size={13} strokeWidth={2.4} />
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="rank-badge rank-badge-bronze" title="Rank #3 Podium">
        <Medal size={13} strokeWidth={2.4} />
      </span>
    );
  }
  return <span className="rank-badge rank-badge-std">{rank}</span>;
}

function MomPill({ pct, direction }) {
  const dir = direction?.toLowerCase() || (pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral');
  const fmt = typeof pct === 'number' ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '0.0%';
  const cls = `mom-pill mom-pill-${dir}`;
  return (
    <span className={cls} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
      {dir === 'up' ? <TrendingUp size={11} /> : dir === 'down' ? <TrendingDown size={11} /> : <Minus size={11} />}
      <span className="mono">{fmt}</span>
    </span>
  );
}

export default function RankingTable({ items = [], isLoading, error, onSelectProductForBurst }) {
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState('all');
  const [sortField,  setSortField]  = useState('rank');
  const [sortDir,    setSortDir]    = useState('asc');
  const [expandedId, setExpandedId] = useState(null);

  const maxUnits = useMemo(() => Math.max(...items.map(i => i.total_units || 0), 1), [items]);

  const processed = useMemo(() => {
    let res = [...items];
    if (search.trim()) {
      const q = search.toLowerCase();
      res = res.filter(i => i.product_name?.toLowerCase().includes(q) || String(i.product_id).includes(q));
    }
    if (filter === 'surging') res = res.filter(i => (i.momentum_pct || 0) > 0);
    if (filter === 'cooling') res = res.filter(i => (i.momentum_pct || 0) < 0);
    if (filter === 'podium')  res = res.filter(i => i.rank <= 3);

    res.sort((a, b) => {
      const va = sortField === 'rank' ? (a.rank ?? 999) : sortField === 'units' ? (a.total_units ?? 0) : sortField === 'current' ? (a.current_window_units ?? 0) : (a.momentum_pct ?? 0);
      const vb = sortField === 'rank' ? (b.rank ?? 999) : sortField === 'units' ? (b.total_units ?? 0) : sortField === 'current' ? (b.current_window_units ?? 0) : (b.momentum_pct ?? 0);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return res;
  }, [items, search, filter, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'rank' ? 'asc' : 'desc'); }
  };

  const SortTh = ({ field, label, width }) => {
    const active = sortField === field;
    return (
      <th className="sortable" style={width ? { width } : {}} onClick={() => handleSort(field)}>
        <div className="th-inner">
          <span>{label}</span>
          <span className={`sort-arrow ${active ? 'active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {active ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={12} />}
          </span>
        </div>
      </th>
    );
  };

  if (isLoading) {
    return (
      <div className="panel">
        <div className="panel-hdr">
          <div className="panel-title-group">
            <div className="panel-icon-wrap panel-icon-wrap-blue">
              <Trophy size={16} />
            </div>
            <div>
              <div className="panel-heading">Leaderboard · Top 10 Products</div>
              <div className="panel-sub">Cumulative MapReduce output — all windows</div>
            </div>
          </div>
        </div>
        <div className="empty-state">
          <div className="spinner" />
          <div className="empty-title">Loading MapReduce state…</div>
          <div className="empty-sub">Fetching latest window rankings from the pipeline</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel">
        <div className="panel-hdr">
          <div className="panel-title-group">
            <div className="panel-icon-wrap panel-icon-wrap-blue">
              <AlertTriangle size={16} />
            </div>
            <div>
              <div className="panel-heading">Leaderboard · Top 10 Products</div>
            </div>
          </div>
        </div>
        <div className="empty-state">
          <span className="empty-icon">
            <Unplug size={32} />
          </span>
          <div className="empty-title" style={{ color: 'var(--status-down)' }}>Ranking State Unavailable</div>
          <div className="empty-sub">{error}</div>
          <div className="empty-hint">GET http://localhost:8000/api/rankings</div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      {/* Header */}
      <div className="panel-hdr">
        <div className="panel-title-group">
          <div className="panel-icon-wrap panel-icon-wrap-blue">
            <Trophy size={16} />
          </div>
          <div>
            <div className="panel-heading">Leaderboard · Top 10 Cumulative Sales</div>
            <div className="panel-sub">Hadoop MapReduce tumbling window aggregation · Intraday velocity delta</div>
          </div>
        </div>
        <div className="panel-badges">
          <span className="badge badge-live">Live</span>
          <span className="badge badge-mapreduce">MapReduce</span>
          <span className="badge badge-count">{processed.length} products</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="table-toolbar">
        <div className="search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search by name or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="filter-chips">
          {[
            { key: 'all',     label: 'All',     icon: null,         cls: '' },
            { key: 'surging', label: 'Surging', icon: Flame,        cls: 'chip-surge' },
            { key: 'cooling', label: 'Cooling', icon: TrendingDown, cls: 'chip-cool' },
            { key: 'podium',  label: 'Podium',  icon: Crown,        cls: 'chip-podium' },
          ].map(f => {
            const IconComponent = f.icon;
            return (
              <button
                key={f.key}
                className={`chip ${f.cls} ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                {IconComponent && <IconComponent size={12} />}
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="tbl-wrap">
        <table className="tbl">
          <colgroup>
            <col style={{ width: '56px' }} />
            <col />
            <col style={{ width: '150px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '76px' }} />
          </colgroup>
          <thead>
            <tr>
              <SortTh field="rank"     label="Rank" />
              <th>Product</th>
              <SortTh field="units"    label="Cumulative Units" />
              <SortTh field="current"  label="Window Velocity" />
              <SortTh field="momentum" label="Momentum" />
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {processed.length === 0 ? (
              <tr>
                <td colSpan="6">
                  <div className="empty-state">
                    <span className="empty-icon">
                      <Search size={32} />
                    </span>
                    <div className="empty-title">No products match</div>
                    <div className="empty-sub">Try changing the search or filter.</div>
                  </div>
                </td>
              </tr>
            ) : (
              processed.map(item => {
                const isExp    = expandedId === item.product_id;
                const sharePct = ((item.total_units / maxUnits) * 100).toFixed(0);
                const delta    = (item.current_window_units || 0) - (item.previous_window_units || 0);
                const rowCls   = ROW_CLASS[item.rank] || '';

                return (
                  <React.Fragment key={item.product_id ?? item.rank}>
                    <tr
                      className={`${rowCls} ${isExp ? 'expanded' : ''}`}
                      onClick={() => setExpandedId(isExp ? null : item.product_id)}
                    >
                      {/* Rank */}
                      <td className="td-rank">
                        <RankBadge rank={item.rank} />
                      </td>

                      {/* Product */}
                      <td className="td-product">
                        <div className="product-name" title={item.product_name}>
                          {item.product_name || `Product #${item.product_id}`}
                        </div>
                        <div className="product-sub">
                          <span className="product-id-tag">#{item.product_id}</span>
                          <span className="product-share-tag">{sharePct}% of leader</span>
                        </div>
                      </td>

                      {/* Cumulative units + bar */}
                      <td className="td-units">
                        <div className="units-number">{(item.total_units || 0).toLocaleString()}</div>
                        <div className="vol-bar-bg">
                          <div
                            className="vol-bar-fill"
                            style={{ width: `${Math.max(5, Math.min(100, sharePct))}%` }}
                          />
                        </div>
                      </td>

                      {/* Window velocity */}
                      <td className="td-velocity">
                        <div className="velocity-nums">
                          <span className="vel-curr">{item.current_window_units ?? 0}</span>
                          <span className="vel-sep">/</span>
                          <span className="vel-prev">{item.previous_window_units ?? 0}</span>
                        </div>
                        <div className={`vel-delta ${delta > 0 ? 'vel-delta-pos' : delta < 0 ? 'vel-delta-neg' : 'vel-delta-zero'}`}>
                          {delta > 0 ? `+${delta}` : delta}
                        </div>
                      </td>

                      {/* Momentum */}
                      <td className="td-momentum">
                        <MomPill pct={item.momentum_pct} direction={item.momentum_direction} />
                      </td>

                      {/* Action */}
                      <td className="td-action">
                        <button
                          className="burst-row-btn"
                          onClick={e => { e.stopPropagation(); onSelectProductForBurst?.(item.product_id); }}
                          title={`Inject burst for #${item.product_id}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                        >
                          <Zap size={11} />
                          <span>Burst</span>
                        </button>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExp && (
                      <tr className="tbl-expanded-row">
                        <td colSpan="6">
                          <div className="expanded-content">
                            <div>
                              <div className="exp-field-label">Product Name</div>
                              <div className="exp-field-val">{item.product_name}</div>
                            </div>
                            <div>
                              <div className="exp-field-label">Kafka SKU ID</div>
                              <div className="exp-field-val">#{item.product_id}</div>
                            </div>
                            <div>
                              <div className="exp-field-label">Current Window Run Rate</div>
                              <div className="exp-field-val">{item.current_window_units} units / 60s</div>
                            </div>
                            <div>
                              <div className="exp-field-label">Window-over-Window Shift</div>
                              <div className="exp-field-val">{delta >= 0 ? `+${delta}` : delta} units ({item.momentum_pct?.toFixed(1)}%)</div>
                            </div>
                            <div>
                              <div className="exp-field-label">Action</div>
                              <button
                                className="exp-inject-btn"
                                onClick={e => { e.stopPropagation(); onSelectProductForBurst?.(item.product_id); }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                              >
                                <Rocket size={13} />
                                <span>Inject Spike Traffic</span>
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
