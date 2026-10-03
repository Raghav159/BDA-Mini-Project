import React, { useState, useEffect, useCallback } from 'react';
import StatusBar from './components/StatusBar';
import RankingTable from './components/RankingTable';
import MomentumMovers from './components/MomentumMovers';
import BurstControl from './components/BurstControl';
import './App.css';

const POLL_INTERVAL_SECONDS = 5;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function App() {
  const [rankingData, setRankingData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_SECONDS);

  const fetchRankings = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rankings`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setRankingData(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching rankings:', err);
      setError(err.message || 'Network error fetching rankings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Polling logic & countdown
  useEffect(() => {
    // Initial fetch
    fetchRankings();

    // 1-second interval for countdown & polling trigger
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchRankings();
          return POLL_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [fetchRankings]);

  const handleManualRefresh = () => {
    setCountdown(POLL_INTERVAL_SECONDS);
    fetchRankings();
  };

  const top10Items = rankingData?.top_10 || [];
  const momentumMovers = rankingData?.momentum_movers || [];

  return (
    <div className="app-container">
      {/* Header Banner */}
      <header className="dashboard-header">
        <div className="brand-section">
          <h1>
            <span>📊 Real-Time Top-Selling & Momentum Dashboard</span>
          </h1>
          <p>Instacart Intraday Sales Velocity Analytics Engine (BDA Mini Project)</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={handleManualRefresh}
            className="form-input"
            style={{
              cursor: 'pointer',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              borderColor: 'rgba(59, 130, 246, 0.3)',
              fontWeight: 600,
            }}
          >
            🔄 Refresh Now
          </button>
        </div>
      </header>

      {/* System Status Bar */}
      <StatusBar
        data={rankingData}
        countdown={countdown}
        isPolling={true}
        error={error}
      />

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Left Column: Top 10 Table */}
        <div className="left-column">
          <RankingTable
            items={top10Items}
            isLoading={isLoading}
            error={error}
          />
        </div>

        {/* Right Column: Momentum Movers & Demo Burst Control */}
        <div className="right-column">
          <MomentumMovers movers={momentumMovers} />

          <BurstControl
            topProducts={top10Items}
            onBurstTriggered={() => {
              // Trigger fast refresh when burst signal sent
              fetchRankings();
            }}
          />
        </div>
      </div>
    </div>
  );
}
