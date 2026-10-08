import React from 'react';

export default function Header({
  onRefresh,
  isRefreshing,
  pollInterval,
  onIntervalChange,
  isAudioEnabled,
  onToggleAudio,
  onOpenArchitecture,
}) {
  return (
    <header className="dashboard-navbar">
      <div className="brand-group">
        <div className="brand-icon-wrap">
          <div className="brand-icon-glow"></div>
          <span className="brand-icon">⚡</span>
        </div>
        <div className="brand-text">
          <div className="brand-title-row">
            <h1>VELOCITY MATRIX</h1>
            <span className="version-pill">v2.0 LIVE</span>
          </div>
          <p className="brand-subtitle">
            Instacart Intraday Sales Velocity & Intraday Momentum Analytics Engine
          </p>
        </div>
      </div>

      <div className="header-controls">
        {/* Architecture Spec Button */}
        <button
          className="header-btn secondary-btn"
          onClick={onOpenArchitecture}
          title="Inspect Big Data Pipeline Architecture"
        >
          <span>🏗️</span>
          <span className="btn-text">Architecture Spec</span>
        </button>

        {/* Polling Interval Select */}
        <div className="interval-selector-wrap">
          <label htmlFor="poll-rate-select" className="interval-label">Poll Rate:</label>
          <select
            id="poll-rate-select"
            className="interval-select"
            value={pollInterval}
            onChange={(e) => onIntervalChange(Number(e.target.value))}
          >
            <option value={2}>2s (Real-time)</option>
            <option value={5}>5s (Standard)</option>
            <option value={10}>10s (Eco)</option>
            <option value={30}>30s (Slow)</option>
          </select>
        </div>

        {/* Audio FX Toggle */}
        <button
          className={`header-btn icon-btn ${isAudioEnabled ? 'audio-active' : ''}`}
          onClick={onToggleAudio}
          title={isAudioEnabled ? 'Sound FX Enabled (Click to Mute)' : 'Sound FX Muted (Click to Enable)'}
        >
          {isAudioEnabled ? '🔔 Sound ON' : '🔕 Muted'}
        </button>

        {/* Manual Refresh Button */}
        <button
          onClick={onRefresh}
          className={`header-btn sync-btn ${isRefreshing ? 'is-syncing' : ''}`}
          disabled={isRefreshing}
          title="Manually fetch latest ranking output"
        >
          <span className={`sync-icon ${isRefreshing ? 'spin-anim' : ''}`}>🔄</span>
          <span className="btn-text">{isRefreshing ? 'Syncing...' : 'Sync Now'}</span>
        </button>
      </div>
    </header>
  );
}
