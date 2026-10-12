import React from 'react';
import { Zap, Flame, Rocket, CheckCircle2, X, TrendingUp } from 'lucide-react';

export default function BurstFeedbackBanner({
  activeBurst,
  lastBurstResult,
  onDismissResult,
}) {
  if (!activeBurst && !lastBurstResult) return null;

  return (
    <div className="burst-feedback-container">
      {/* 1. Live Active Overdrive Banner */}
      {activeBurst && (
        <div className="active-burst-overdrive-banner">
          <div className="burst-beam-scanline" />
          <div className="burst-banner-left">
            <div className="burst-live-icon-pill">
              <Zap size={15} className="text-amber-400 burst-spin-subtle" />
              <span className="live-pill-text">KAFKA OVERDRIVE ACTIVE</span>
            </div>
            <div className="burst-banner-text">
              <div className="burst-title">
                Injecting Traffic Surge into <strong>{activeBurst.productName || `SKU #${activeBurst.productId}`}</strong>
              </div>
              <div className="burst-sub-stats mono">
                <span>SKU #{activeBurst.productId}</span>
                <span className="sep">•</span>
                <span className="text-amber-400 font-bold">{activeBurst.multiplier}× Traffic Multiplier</span>
                <span className="sep">•</span>
                <span>Active Window Pipeline</span>
              </div>
            </div>
          </div>

          <div className="burst-banner-right">
            <div className="burst-timer-badge">
              <span className="timer-clock mono">{activeBurst.remaining}s</span>
              <span className="timer-label">UNTIL WINDOW LOCK</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Post-Burst Impact Banner */}
      {!activeBurst && lastBurstResult && (
        <div className="post-burst-impact-banner">
          <div className="post-banner-left">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <div className="post-banner-content">
              <div className="post-title">
                Overdrive Impact Committed: <strong>{lastBurstResult.productName || `SKU #${lastBurstResult.productId}`}</strong>
              </div>
              <div className="post-sub-stats mono">
                <span>Injected {lastBurstResult.multiplier}× ({lastBurstResult.totalDuration || 60}s)</span>
                {lastBurstResult.windowId && (
                  <>
                    <span className="sep">•</span>
                    <span>Window: {lastBurstResult.windowId}</span>
                  </>
                )}
                <span className="sep">•</span>
                <span className="text-emerald-400">
                  {lastBurstResult.windowUnits ? `${lastBurstResult.windowUnits.toLocaleString()} units reduced` : 'Aggregated in Hadoop'}
                </span>
                {lastBurstResult.momentumPct !== undefined && (
                  <>
                    <span className="sep">•</span>
                    <span className="text-cyan-400">
                      {Number(lastBurstResult.momentumPct) >= 0 ? `+${Number(lastBurstResult.momentumPct).toFixed(1)}%` : `${Number(lastBurstResult.momentumPct).toFixed(1)}%`} momentum
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            className="post-banner-close"
            onClick={onDismissResult}
            title="Dismiss impact report"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
