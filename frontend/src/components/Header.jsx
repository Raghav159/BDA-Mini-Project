import React, { useMemo } from 'react';
import {
  Zap,
  Workflow,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  RefreshCw,
} from 'lucide-react';

/**
 * Live data ticker items for the marquee strip.
 * If real data exists, show product names + units; else show system stats.
 */
function buildTickerItems(top10, movers) {
  const items = [];
  if (top10?.length) {
    top10.slice(0, 5).forEach(p => {
      const pct = typeof p.momentum_pct === 'number' ? p.momentum_pct : 0;
      items.push({
        name: p.product_name || `Product #${p.product_id}`,
        val:  (p.total_units || 0).toLocaleString(),
        unit: 'units',
        pct,
        dir:  pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral',
      });
    });
  }
  if (movers?.length) {
    movers.slice(0, 3).forEach(m => {
      const pct = typeof m.momentum_pct === 'number' ? m.momentum_pct : 0;
      items.push({
        name: m.product_name || `Product #${m.product_id}`,
        val:  `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`,
        unit: 'surge',
        pct,
        dir:  pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral',
      });
    });
  }
  if (!items.length) {
    return [
      { name: 'KAFKA',     val: 'streaming', unit: 'live',    dir: 'neutral' },
      { name: 'HADOOP',    val: 'MapReduce', unit: 'active',  dir: 'neutral' },
      { name: 'FastAPI',   val: ':8000',     unit: 'serving', dir: 'neutral' },
      { name: 'HDFS',      val: '/bda/input',unit: 'windows', dir: 'neutral' },
    ];
  }
  return items;
}

export default function Header({
  theme, onToggleTheme,
  onRefresh, isRefreshing,
  pollInterval, onIntervalChange,
  isAudioEnabled, onToggleAudio,
  onOpenArchitecture,
  top10 = [], movers = [],
}) {
  const tickerItems = useMemo(() => buildTickerItems(top10, movers), [top10, movers]);
  // Duplicate for seamless loop
  const allItems = [...tickerItems, ...tickerItems];

  return (
    <header className="engine-header">
      {/* Brand */}
      <div className="header-brand">
        <div className="brand-logo">
          <Zap size={20} className="brand-logo-icon" fill="currentColor" strokeWidth={2.2} />
        </div>
        <div className="brand-info">
          <div className="brand-name">VELOCITY ENGINE</div>
          <div className="brand-tagline">Instacart Intraday Sales Ranking · MapReduce Pipeline</div>
        </div>
      </div>

      {/* Live Ticker */}
      <div className="header-ticker">
        <div className="ticker-track">
          {allItems.map((item, i) => (
            <span key={i} className="ticker-item">
              <span className="ticker-name">{item.name}</span>
              <span className={`ticker-val ${item.dir === 'up' ? 'ticker-up' : item.dir === 'down' ? 'ticker-down' : ''}`}>
                {item.val}
              </span>
              <span className="ticker-sep">|</span>
            </span>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="header-controls">
        {/* Architecture */}
        <button
          className="hdr-btn hdr-btn-arch"
          onClick={onOpenArchitecture}
          title="View Big Data Pipeline Architecture"
        >
          <Workflow size={15} />
          <span className="btn-label">Architecture</span>
        </button>

        {/* Poll rate */}
        <div className="poll-selector">
          <span className="poll-label">Poll</span>
          <select
            className="poll-select"
            value={pollInterval}
            onChange={e => onIntervalChange(Number(e.target.value))}
            title="Set auto-refresh interval"
          >
            <option value={2}>2s</option>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
            <option value={30}>30s</option>
          </select>
        </div>

        {/* Audio */}
        <button
          className={`hdr-btn hdr-btn-audio ${isAudioEnabled ? 'audio-on' : ''}`}
          onClick={onToggleAudio}
          title={isAudioEnabled ? 'Sound ON (click to mute)' : 'Sound muted (click to enable)'}
          aria-label="Toggle audio alerts"
        >
          {isAudioEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>

        {/* Theme toggle */}
        <button
          className="hdr-btn hdr-btn-theme"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label="Toggle dark/light theme"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Sync */}
        <button
          className={`hdr-btn hdr-btn-sync ${isRefreshing ? 'is-syncing' : ''}`}
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Manually sync ranking data"
        >
          <RefreshCw size={14} className={isRefreshing ? 'spin-icon' : ''} />
          <span className="btn-label">{isRefreshing ? 'Syncing…' : 'Sync'}</span>
        </button>
      </div>
    </header>
  );
}
