import React from 'react';
import {
  Trophy,
  Medal,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Flame,
  Award,
} from 'lucide-react';

export default function PodiumShowcase({ topItems = [], onSelectForBurst }) {
  if (!topItems || topItems.length === 0) {
    return null;
  }

  const p1 = topItems[0];
  const p2 = topItems[1];
  const p3 = topItems[2];

  const maxUnits = Math.max(...topItems.map((i) => i.total_units || 0), 1);

  const renderCard = (item, rank, medalType) => {
    if (!item) return null;
    const delta = (item.current_window_units || 0) - (item.previous_window_units || 0);
    const momPct = typeof item.momentum_pct === 'number' ? item.momentum_pct : 0;
    const volumePct = Math.round(((item.total_units || 0) / maxUnits) * 100);

    return (
      <div className={`podium-card podium-${medalType}`}>
        <div className="podium-card-glow" />

        {/* Card Header: Rank Crest & Status */}
        <div className="podium-top">
          <div className="podium-crest">
            {rank === 1 ? (
              <Trophy size={18} className="crest-icon text-amber-400" />
            ) : rank === 2 ? (
              <Medal size={18} className="crest-icon text-slate-300" />
            ) : (
              <Award size={18} className="crest-icon text-amber-600" />
            )}
            <span className="crest-rank-num">#{rank}</span>
          </div>

          <div className="podium-badges">
            <span className={`podium-mom-pill ${momPct > 0 ? 'mom-up' : momPct < 0 ? 'mom-down' : 'mom-neutral'}`}>
              {momPct > 0 ? <TrendingUp size={12} /> : momPct < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
              <span>{momPct > 0 ? `+${momPct.toFixed(0)}%` : `${momPct.toFixed(0)}%`}</span>
            </span>
          </div>
        </div>

        {/* Product Identity */}
        <div className="podium-body">
          <h3 className="podium-product-name" title={item.product_name}>
            {item.product_name || `Product #${item.product_id}`}
          </h3>
          <div className="podium-sku-tag">
            <span>SKU ID:</span> <span className="mono">#{item.product_id}</span>
          </div>
        </div>

        {/* Volume & Velocity Stats */}
        <div className="podium-metrics">
          <div className="metric-box">
            <span className="metric-title">Cumulative</span>
            <div className="metric-val mono">{(item.total_units || 0).toLocaleString()}</div>
            <span className="metric-unit">units total</span>
          </div>

          <div className="metric-separator" />

          <div className="metric-box">
            <span className="metric-title">Window Run</span>
            <div className="metric-val mono">{item.current_window_units ?? 0}</div>
            <span className={`metric-delta ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {delta >= 0 ? `+${delta}` : delta} vs prev
            </span>
          </div>
        </div>

        {/* Energy Share Bar */}
        <div className="podium-energy-bar">
          <div className="energy-bar-track">
            <div
              className="energy-bar-fill"
              style={{ width: `${Math.max(10, Math.min(100, volumePct))}%` }}
            />
          </div>
          <div className="energy-bar-label">
            <span>{item.rank === 1 ? 'Volume Benchmark' : 'Share vs #1 Leader'}</span>
            <span className="mono">{volumePct}%</span>
          </div>
        </div>

        {/* Quick Spike Action */}
        <button
          className="podium-boost-action"
          onClick={() => onSelectForBurst?.(item.product_id)}
          title={`Inject traffic spike for ${item.product_name}`}
        >
          <Zap size={13} />
          <span>Deploy Overdrive Spike</span>
        </button>
      </div>
    );
  };

  return (
    <section className="podium-showcase-section">
      <div className="section-title-strip">
        <div className="strip-left">
          <Flame size={16} className="text-amber-400" />
          <h2 className="strip-heading">Top 3 Leaderboard Champions</h2>
          <span className="strip-sub">Real-time MapReduce sales leaders across all tumbling windows</span>
        </div>
      </div>

      <div className="podium-grid">
        {/* Arrange: #2 Silver on Left, #1 Gold in Center (Elevated), #3 Bronze on Right */}
        {p2 && renderCard(p2, 2, 'silver')}
        {p1 && renderCard(p1, 1, 'gold')}
        {p3 && renderCard(p3, 3, 'bronze')}
      </div>
    </section>
  );
}
