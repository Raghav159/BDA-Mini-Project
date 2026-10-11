import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from './components/Navbar';
import BatchPipelineRadar from './components/BatchPipelineRadar';
import TelemetryHudStrip from './components/TelemetryHudStrip';
import PodiumShowcase from './components/PodiumShowcase';
import LeaderboardGrid from './components/LeaderboardGrid';
import MomentumRadar from './components/MomentumRadar';
import BurstConsole from './components/BurstConsole';
import ArchitectureModal from './components/ArchitectureModal';
import { Gauge, Zap, Flame, Radio } from 'lucide-react';
import { soundFX } from './utils/audio';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function App() {
  // Theme state: 'dark' | 'light'
  const [theme, setTheme] = useState(() => localStorage.getItem('ve_cockpit_theme') || 'dark');

  // Side Deck Active Tab: 'momentum' | 'injector' (Option A: Balanced Split)
  const [activeSideTab, setActiveSideTab] = useState('momentum');

  const [rankingData, setRankingData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [pollInterval, setPollInterval] = useState(5);
  const [countdown, setCountdown] = useState(5);
  const [isPaused, setIsPaused] = useState(false);

  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [burstTargetProductId, setBurstTargetProductId] = useState('');
  const [activeBurst, setActiveBurst] = useState(null);
  const [isArchModalOpen, setIsArchModalOpen] = useState(false);

  const previousWindowRef = useRef(null);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ve_cockpit_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // Active burst countdown loop
  useEffect(() => {
    if (!activeBurst) return;
    const t = setInterval(() => {
      setActiveBurst((prev) => {
        if (!prev) return null;
        if (prev.remaining <= 1) return null;
        return { ...prev, remaining: prev.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [activeBurst]);

  // Fetch rankings from FastAPI backend
  const fetchRankings = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/rankings`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setRankingData(data);
      setError(null);
      if (
        data?.window_id &&
        previousWindowRef.current &&
        data.window_id !== previousWindowRef.current
      ) {
        soundFX.playRefresh();
      }
      if (data?.window_id) previousWindowRef.current = data.window_id;
    } catch (err) {
      setError(err.message || 'Pipeline synchronization failed');
    } finally {
      setIsLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    let isLive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/rankings`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isLive) {
          setRankingData(data);
          if (data?.window_id) previousWindowRef.current = data.window_id;
        }
      } catch (err) {
        if (isLive) setError(err.message);
      } finally {
        if (isLive) setIsLoading(false);
      }
    })();
    return () => {
      isLive = false;
    };
  }, []);

  // Polling countdown effect
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchRankings();
          return pollInterval;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchRankings, pollInterval, isPaused]);

  const handleIntervalChange = (val) => {
    setPollInterval(val);
    setCountdown(val);
  };

  const handleManualRefresh = () => {
    soundFX.playClick();
    setCountdown(pollInterval);
    fetchRankings(true);
  };

  const handleToggleAudio = () => {
    const on = soundFX.toggle();
    setIsAudioEnabled(on);
    if (on) soundFX.playRefresh();
  };

  // When clicking "Spike / Boost" on any product row, switch right tab to Injector
  const handleSelectProductForBurst = (pid) => {
    soundFX.playClick();
    setBurstTargetProductId(String(pid));
    setActiveSideTab('injector');
  };

  // When burst signal deploys, switch back to Momentum tab so the user sees live surge!
  const handleBurstSuccess = (burstObj) => {
    fetchRankings();
    setTimeout(() => {
      setActiveSideTab('momentum');
    }, 900);
  };

  const isBackendConnected = !error && rankingData !== null;
  const isBufferingFirstWindow = isBackendConnected && rankingData?.status === 'no_data';
  const hasWindowData = isBackendConnected && !isBufferingFirstWindow;
  const isOnline = isBackendConnected;
  const top10 = rankingData?.top_10 || [];
  const movers = rankingData?.momentum_movers || [];
  const windowId = rankingData?.window_id ? rankingData.window_id.replace('window_', '#') : null;

  return (
    <div className="cockpit-container">
      {/* 1. Global Navigation & Mission Status */}
      <Navbar
        theme={theme}
        onToggleTheme={toggleTheme}
        onRefresh={handleManualRefresh}
        isRefreshing={isRefreshing}
        pollInterval={pollInterval}
        onIntervalChange={handleIntervalChange}
        isAudioEnabled={isAudioEnabled}
        onToggleAudio={handleToggleAudio}
        onOpenArchitecture={() => {
          soundFX.playClick();
          setIsArchModalOpen(true);
        }}
        clusterStatus={isBackendConnected ? (isBufferingFirstWindow ? 'buffering' : 'online') : 'offline'}
        windowId={windowId}
      />

      {/* Main Mission Control Body */}
      <main className="cockpit-viewport">
        {/* 2. Real-Time 60s Tumbling Window & MapReduce Batch Radar */}
        <BatchPipelineRadar
          windowId={windowId}
          totalWindows={rankingData?.total_windows_processed || 0}
          windowSizeSeconds={rankingData?.window_size_seconds || 60}
          lastUpdated={rankingData?.last_updated}
          pipelineStatus={rankingData?.pipeline_status}
          countdown={countdown}
          pollInterval={pollInterval}
          isPaused={isPaused}
          onTogglePause={() => {
            soundFX.playClick();
            setIsPaused((p) => !p);
          }}
          isRefreshing={isRefreshing}
          isOnline={isBackendConnected}
          isBuffering={isBufferingFirstWindow}
          error={error}
        />

        {/* 3. Global Telemetry HUD Strip */}
        <TelemetryHudStrip
          data={rankingData}
          onQuickSelectProduct={handleSelectProductForBurst}
        />

        {/* 4. Top 3 Champions Podium Showcase (only if real products exist) */}
        {top10.length >= 3 && (
          <PodiumShowcase
            topItems={top10.slice(0, 3)}
            onSelectForBurst={handleSelectProductForBurst}
          />
        )}

        {/* 5. Perfectly Balanced Split Deck: Leaderboard on Left (Output) ↔ Tabbed Side Deck on Right (Output/Input) */}
        <div className="cockpit-split-deck">
          {/* Left Column: Full Cumulative Leaderboard Grid */}
          <div className="deck-main-column">
            <LeaderboardGrid
              items={top10}
              isLoading={isLoading}
              error={error}
              isBuffering={isBufferingFirstWindow}
              onSelectProductForBurst={handleSelectProductForBurst}
            />
          </div>

          {/* Right Column: Tab Switcher (Momentum Radar ↔ Traffic Injector) */}
          <div className="deck-side-column">
            <div className="side-deck-shell">
              {/* Tab Switcher Header */}
              <div className="side-deck-nav">
                <div className="side-nav-pills">
                  <button
                    className={`side-nav-pill ${activeSideTab === 'momentum' ? 'pill-active' : ''}`}
                    onClick={() => {
                      soundFX.playClick();
                      setActiveSideTab('momentum');
                    }}
                  >
                    <Gauge size={14} />
                    <span>Momentum Radar</span>
                    {movers.length > 0 && <span className="pill-badge">{movers.length}</span>}
                  </button>

                  <button
                    className={`side-nav-pill ${activeSideTab === 'injector' ? 'pill-active' : ''}`}
                    onClick={() => {
                      soundFX.playClick();
                      setActiveSideTab('injector');
                    }}
                  >
                    <Zap size={14} />
                    <span>Spike Injector</span>
                    {activeBurst && <span className="pill-dot-pulse" />}
                  </button>
                </div>

                <div className="side-nav-status">
                  <Radio size={11} className="nav-live-icon" />
                  <span>{activeSideTab === 'momentum' ? 'Velocity Surges' : 'Kafka Bus'}</span>
                </div>
              </div>

              {/* Persistent Active Burst Banner (visible across both tabs during an active spike!) */}
              {activeBurst && (
                <div className="persistent-burst-banner">
                  <div className="persistent-burst-meta">
                    <span className="burst-live-dot" />
                    <div className="persistent-burst-info">
                      <span className="persistent-burst-title">
                        Active Overdrive: <strong>{activeBurst.productName}</strong>
                      </span>
                      <span className="persistent-burst-sub">
                        SKU #{activeBurst.productId} • {activeBurst.multiplier}× Traffic • {activeBurst.remaining}s remaining
                      </span>
                    </div>
                  </div>
                  <div className="persistent-burst-clock mono">{activeBurst.remaining}s</div>
                </div>
              )}

              {/* Tab Panels */}
              <div className="side-deck-panel">
                {activeSideTab === 'momentum' ? (
                  <MomentumRadar
                    movers={movers}
                    onSelectProductForBurst={handleSelectProductForBurst}
                  />
                ) : (
                  <BurstConsole
                    topProducts={top10}
                    movers={movers}
                    selectedProductId={burstTargetProductId}
                    activeBurst={activeBurst}
                    setActiveBurst={setActiveBurst}
                    onBurstTriggered={handleBurstSuccess}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Cockpit Horizon Footer */}
      <footer className="cockpit-footer">
        <div className="footer-cluster-info">
          <span className={`footer-dot-pulse ${!isOnline ? 'dot-offline' : ''}`} />
          <span>Hadoop Streaming MapReduce</span>
          <span className="footer-sep">/</span>
          <span>Apache Kafka :9092</span>
          <span className="footer-sep">/</span>
          <span>HDFS /bda/input</span>
          <span className="footer-sep">/</span>
          <span>FastAPI :8000</span>
        </div>
        <div className="footer-meta-right">
          <span>BDA Mini Project · Instacart Intraday Velocity Engine</span>
        </div>
      </footer>

      {/* 6. System Architecture Inspector Modal */}
      <ArchitectureModal
        isOpen={isArchModalOpen}
        onClose={() => setIsArchModalOpen(false)}
      />
    </div>
  );
}
