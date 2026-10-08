import React, { useState, useEffect } from 'react';
import { soundFX } from '../utils/audio';

export default function BurstControl({
  topProducts = [],
  movers = [],
  selectedProductId = '',
  onBurstTriggered,
}) {
  const [productId, setProductId] = useState('');
  const [multiplier, setMultiplier] = useState(10);
  const [durationSeconds, setDurationSeconds] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [activeBurstState, setActiveBurstState] = useState(null);

  const [prevSelectedProp, setPrevSelectedProp] = useState(selectedProductId);

  // Synchronize external selection during render when prop changes
  if (selectedProductId && selectedProductId !== prevSelectedProp) {
    setPrevSelectedProp(selectedProductId);
    setProductId(String(selectedProductId));
  }

  // Active burst countdown timer
  useEffect(() => {
    if (!activeBurstState) return;

    const timer = setInterval(() => {
      setActiveBurstState((prev) => {
        if (!prev) return null;
        if (prev.remaining <= 1) {
          return null;
        }
        return {
          ...prev,
          remaining: prev.remaining - 1,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeBurstState]);

  // Combined product list without duplicates
  const productOptions = React.useMemo(() => {
    const map = new Map();
    [...topProducts, ...movers].forEach((p) => {
      if (p.product_id && !map.has(p.product_id)) {
        map.set(p.product_id, p);
      }
    });
    return Array.from(map.values());
  }, [topProducts, movers]);

  const selectedProductObj = productOptions.find((p) => String(p.product_id) === String(productId));

  // Quick preset handlers
  const applyPreset = (mult, dur) => {
    setMultiplier(mult);
    setDurationSeconds(dur);
    soundFX.playClick();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);

    const parsedId = parseInt(productId, 10);
    const parsedMult = parseInt(multiplier, 10);
    const parsedDur = parseInt(durationSeconds, 10);

    if (isNaN(parsedId) || parsedId <= 0) {
      setFeedback({ type: 'error', message: 'Please specify a valid numeric Product ID.' });
      return;
    }

    if (isNaN(parsedMult) || parsedMult <= 0) {
      setFeedback({ type: 'error', message: 'Multiplier must be greater than 0.' });
      return;
    }

    if (isNaN(parsedDur) || parsedDur <= 0) {
      setFeedback({ type: 'error', message: 'Duration must be greater than 0 seconds.' });
      return;
    }

    setIsSubmitting(true);
    soundFX.playClick();

    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
      const response = await fetch(`${baseUrl}/api/burst`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: parsedId,
          multiplier: parsedMult,
          duration_seconds: parsedDur,
        }),
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.detail || 'Failed to trigger burst signal in API');
      }

      // Success
      soundFX.playBurst();

      const prodName = selectedProductObj?.product_name || `Product #${parsedId}`;
      setFeedback({
        type: 'success',
        message: `Signal deployed! Kafka will inject ${parsedMult}x burst for "${prodName}" for ${parsedDur}s.`,
      });

      setActiveBurstState({
        productId: parsedId,
        productName: prodName,
        multiplier: parsedMult,
        totalDuration: parsedDur,
        remaining: parsedDur,
      });

      if (onBurstTriggered) {
        onBurstTriggered(resData);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Burst dispatch error: ${err.message}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dashboard-panel burst-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-icon burst-icon">⚡</span>
          <div>
            <h3>Live Demo Traffic Injection</h3>
            <p className="panel-subtitle">Simulate real-time sales spike via Kafka producer</p>
          </div>
        </div>
        <span className="badge-live-stream">KAFKA LIVE</span>
      </div>

      {/* Active Burst Banner if running */}
      {activeBurstState && (
        <div className="active-burst-banner">
          <div className="active-burst-info">
            <span className="pulse-burst-dot" />
            <div>
              <strong className="active-burst-title">
                Active Traffic Spike: {activeBurstState.productName}
              </strong>
              <div className="active-burst-meta mono">
                ID: #{activeBurstState.productId} • {activeBurstState.multiplier}x Multiplier • {activeBurstState.remaining}s remaining
              </div>
            </div>
          </div>
          <div className="active-burst-timer mono">
            {activeBurstState.remaining}s
          </div>
          <div className="burst-progress-bar-bg">
            <div
              className="burst-progress-bar-fill"
              style={{
                width: `${(activeBurstState.remaining / activeBurstState.totalDuration) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Quick Presets */}
      <div className="burst-presets-row">
        <span className="presets-label">Sim Presets:</span>
        <div className="presets-buttons">
          <button
            type="button"
            className="preset-pill-btn"
            onClick={() => applyPreset(3, 30)}
          >
            ⚡ Light (3x / 30s)
          </button>
          <button
            type="button"
            className="preset-pill-btn"
            onClick={() => applyPreset(10, 60)}
          >
            🚀 Rush (10x / 60s)
          </button>
          <button
            type="button"
            className="preset-pill-btn"
            onClick={() => applyPreset(25, 120)}
          >
            💥 Flash (25x / 120s)
          </button>
          <button
            type="button"
            className="preset-pill-btn"
            onClick={() => applyPreset(50, 180)}
          >
            🌪️ Hyper (50x / 180s)
          </button>
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="burst-command-form">
        {/* Product Selector */}
        <div className="form-field">
          <label htmlFor="product-quick-select" className="field-label">
            Target Product Selection
          </label>
          <select
            id="product-quick-select"
            className="select-field"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="">-- Choose from active products or type ID below --</option>
            {productOptions.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                #{p.product_id} - {p.product_name} ({p.total_units?.toLocaleString()} units)
              </option>
            ))}
          </select>
        </div>

        {/* Manual ID Input */}
        <div className="form-field">
          <label htmlFor="manual-product-id" className="field-label">
            Product ID (Numeric SKU)
          </label>
          <input
            id="manual-product-id"
            type="number"
            className="input-field mono"
            placeholder="e.g. 24852 (Banana) or 26209 (Limes)"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        {/* Multiplier Slider & Value */}
        <div className="form-field">
          <div className="slider-header-row">
            <label htmlFor="multiplier-slider" className="field-label">
              Volume Multiplier
            </label>
            <span className="slider-badge mono">{multiplier}x Traffic</span>
          </div>
          <div className="range-slider-wrap">
            <input
              id="multiplier-slider"
              type="range"
              min="1"
              max="50"
              step="1"
              className="range-slider"
              value={multiplier}
              onChange={(e) => setMultiplier(Number(e.target.value))}
              disabled={isSubmitting}
            />
            <div className="slider-ticks">
              <span>1x (Base)</span>
              <span>10x</span>
              <span>25x</span>
              <span>50x (Max)</span>
            </div>
          </div>
        </div>

        {/* Duration Select Pills */}
        <div className="form-field">
          <label className="field-label">Burst Duration Window</label>
          <div className="duration-pills-row">
            {[30, 60, 120, 180, 300].map((sec) => (
              <button
                key={sec}
                type="button"
                className={`duration-pill ${durationSeconds === sec ? 'active' : ''}`}
                onClick={() => setDurationSeconds(sec)}
                disabled={isSubmitting}
              >
                {sec >= 60 ? `${sec / 60} min` : `${sec}s`}
              </button>
            ))}
          </div>
        </div>

        {/* Action Trigger Button */}
        <button
          type="submit"
          className="deploy-burst-button"
          disabled={isSubmitting || !productId}
        >
          {isSubmitting ? (
            <>
              <span className="pulse-spinner-sm" />
              <span>Transmitting Kafka Signal...</span>
            </>
          ) : (
            <>
              <span className="btn-lightning">⚡</span>
              <span>Inject Real-Time Traffic Spike</span>
            </>
          )}
        </button>

        {/* Feedback Message */}
        {feedback && (
          <div className={`status-banner-box banner-${feedback.type}`}>
            <span className="banner-icon">
              {feedback.type === 'success' ? '🚀' : '⚠️'}
            </span>
            <span className="banner-text">{feedback.message}</span>
          </div>
        )}
      </form>
    </div>
  );
}
