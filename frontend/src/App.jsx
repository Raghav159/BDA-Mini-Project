import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import SummaryCards from './components/SummaryCards';
import RankingTable from './components/RankingTable';
import MomentumMovers from './components/MomentumMovers';
import BurstControl from './components/BurstControl';
import ArchitectureModal from './components/ArchitectureModal';
import { soundFX } from './utils/audio';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function App() {
  const [rankingData, setRankingData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Polling configuration
  const [pollInterval, setPollInterval] = useState(5); // default 5 seconds
  const [countdown, setCountdown] = useState(5);
  const [isPaused, setIsPaused] = useState(false);

  // Audio FX toggle
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);

  // Target product for burst pre-fill
  const [burstTargetProductId, setBurstTargetProductId] = useState('');

  // Architecture modal
  const [isArchModalOpen, setIsArchModalOpen] = useState(false);

  // Track previous window to play chime when new window arrives
  const previousWindowRef = useRef(null);

  const fetchRankings = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/rankings`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setRankingData(data);
      setError(null);

      // Play soft chime if window changed
      if (data?.window_id && previousWindowRef.current && data.window_id !== previousWindowRef.current) {
        soundFX.playRefresh();
      }
      if (data?.window_id) {
        previousWindowRef.current = data.window_id;
      }
    } catch (err) {
      console.error('Error fetching rankings:', err);
      setError(err.message || 'Network error fetching rankings');
    } finally {
      setIsLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  // Initial load effect
  useEffect(() => {
    let isSubscribed = true;
    const loadInitialData = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/rankings`);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const data = await response.json();
        if (isSubscribed) {
          setRankingData(data);
          setError(null);
          if (data?.window_id) {
            previousWindowRef.current = data.window_id;
          }
        }
      } catch (err) {
        if (isSubscribed) setError(err.message || 'Network error fetching rankings');
      } finally {
        if (isSubscribed) setIsLoading(false);
      }
    };

    loadInitialData();
    return () => {
      isSubscribed = false;
    };
  }, []);

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

  // Handle poll interval changes
  const handleIntervalChange = (newInterval) => {
    setPollInterval(newInterval);
    setCountdown(newInterval);
  };

  const handleManualRefresh = () => {
    soundFX.playClick();
    setCountdown(pollInterval);
    fetchRankings(true);
  };

  const handleToggleAudio = () => {
    const newState = soundFX.toggle();
    setIsAudioEnabled(newState);
    if (newState) {
      soundFX.playRefresh();
    }
  };

  const handleSelectProductForBurst = (productId) => {
    soundFX.playClick();
    setBurstTargetProductId(String(productId));
    // Scroll burst control into view smoothly on mobile/narrow screens
    const burstElement = document.querySelector('.burst-panel');
    if (burstElement) {
      burstElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const top10Items = rankingData?.top_10 || [];
  const momentumMovers = rankingData?.momentum_movers || [];

  return (
    <div className="velocity-root">
      {/* Background ambient lighting glows */}
      <div className="ambient-glow glow-1" />
      <div className="ambient-glow glow-2" />
      <div className="ambient-glow glow-3" />

      <div className="app-layout">
        {/* Modern Navbar */}
        <Header
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
        />

        {/* Executive KPI Metrics Strip */}
        <SummaryCards
          data={rankingData}
          countdown={countdown}
          pollInterval={pollInterval}
          isPaused={isPaused}
          onTogglePause={() => {
            soundFX.playClick();
            setIsPaused((prev) => !prev);
          }}
          onQuickSelectProduct={handleSelectProductForBurst}
          error={error}
        />

        {/* Main Analytics Grid */}
        <main className="analytics-grid">
          {/* Left Column: Top 10 Leaderboard */}
          <section className="analytics-main-col">
            <RankingTable
              items={top10Items}
              isLoading={isLoading}
              error={error}
              onSelectProductForBurst={handleSelectProductForBurst}
            />
          </section>

          {/* Right Column: Intraday Momentum & Burst Trigger */}
          <aside className="analytics-side-col">
            <MomentumMovers
              movers={momentumMovers}
              onSelectProductForBurst={handleSelectProductForBurst}
            />

            <BurstControl
              topProducts={top10Items}
              movers={momentumMovers}
              selectedProductId={burstTargetProductId}
              onBurstTriggered={() => {
                // Instantly re-fetch to reflect any fast state changes
                fetchRankings();
              }}
            />
          </aside>
        </main>

        {/* Footer */}
        <footer className="dashboard-footer">
          <div className="footer-left">
            <span>BDA Mini Project • Instacart Intraday Velocity Engine</span>
            <span className="footer-dot">•</span>
            <span>Hadoop Streaming MapReduce + Kafka + FastAPI</span>
          </div>
          <div className="footer-right">
            <span className="mono">Window Cadence: 60s</span>
            <span className="footer-dot">•</span>
            <span className="mono">State: /state/ranking_output.json</span>
          </div>
        </footer>
      </div>

      {/* System Architecture Modal */}
      <ArchitectureModal
        isOpen={isArchModalOpen}
        onClose={() => setIsArchModalOpen(false)}
      />
    </div>
  );
}
