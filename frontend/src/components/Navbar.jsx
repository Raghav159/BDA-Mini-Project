import React from 'react';
import {
  Cpu,
  Workflow,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  RefreshCw,
  Radio,
} from 'lucide-react';

export default function Navbar({
  theme,
  onToggleTheme,
  onRefresh,
  isRefreshing,
  pollInterval,
  onIntervalChange,
  isAudioEnabled,
  onToggleAudio,
  onOpenArchitecture,
  clusterStatus,
  windowId,
}) {
  return (
    <header className="cockpit-nav">
      {/* Brand & System Status */}
      <div className="nav-brand-section">
        <div className="nav-logo-box">
          <Cpu className="nav-logo-icon" size={22} strokeWidth={2.4} />
          <span className="logo-pulse-ring" />
        </div>
        <div className="nav-titles">
          <div className="nav-main-title">
            <span>VELOCITY</span>
            <span className="title-accent">ENGINE</span>
          </div>
          <div className="nav-sub-title">
            <Radio size={11} className="nav-live-icon" />
            <span>MapReduce Streaming Horizon · {windowId ? `Window ${windowId}` : 'Standby'}</span>
          </div>
        </div>
      </div>

      {/* Cluster Status Pill */}
      <div className={`cluster-health-pill ${clusterStatus === 'online' ? 'status-live' : clusterStatus === 'buffering' ? 'status-buffering' : 'status-alert'}`}>
        <span className="health-dot" />
        <span className="health-label">
          {clusterStatus === 'online' ? 'Cluster Synced' : clusterStatus === 'buffering' ? 'Cluster Live (Buffering)' : 'Cluster Offline'}
        </span>
      </div>

      {/* Action Controls */}
      <div className="nav-actions">
        {/* Architecture Inspector */}
        <button
          className="cockpit-btn btn-secondary"
          onClick={onOpenArchitecture}
          title="Inspect Big Data Pipeline Specs"
        >
          <Workflow size={14} />
          <span>Architecture</span>
        </button>

        {/* Polling Interval Select */}
        <div className="poll-chip">
          <span className="poll-chip-label">Poll</span>
          <select
            className="poll-chip-select"
            value={pollInterval}
            onChange={(e) => onIntervalChange(Number(e.target.value))}
            title="Auto-refresh polling rate"
          >
            <option value={2}>2s</option>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
            <option value={30}>30s</option>
          </select>
        </div>

        {/* Sound FX Toggle */}
        <button
          className={`cockpit-icon-btn ${isAudioEnabled ? 'active-audio' : ''}`}
          onClick={onToggleAudio}
          title={isAudioEnabled ? 'Audio alerts active' : 'Audio alerts muted'}
          aria-label="Toggle sound alerts"
        >
          {isAudioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        {/* Theme Toggle */}
        <button
          className="cockpit-icon-btn"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Manual Refresh / Sync */}
        <button
          className={`cockpit-btn btn-primary ${isRefreshing ? 'is-syncing' : ''}`}
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Force pipeline synchronization"
        >
          <RefreshCw size={13} className={isRefreshing ? 'spin-anim' : ''} />
          <span>{isRefreshing ? 'Syncing…' : 'Sync'}</span>
        </button>
      </div>
    </header>
  );
}
