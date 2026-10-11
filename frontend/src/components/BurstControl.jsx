import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Rocket,
  Sparkles,
  Flame,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { soundFX } from '../utils/audio';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const PRESETS = [
  { label: 'Light', icon: Zap,      mult: 3,  dur: 30  },
  { label: 'Rush',  icon: Rocket,   mult: 10, dur: 60  },
  { label: 'Flash', icon: Sparkles, mult: 25, dur: 120 },
  { label: 'Hyper', icon: Flame,    mult: 50, dur: 180 },
];

export default function BurstControl({
  className = '',
  topProducts = [],
  movers = [],
  selectedProductId = '',
  onBurstTriggered,
}) {
  const [productId,      setProductId]      = useState('');
  const [multiplier,     setMultiplier]     = useState(10);
  const [durSecs,        setDurSecs]        = useState(60);
  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [feedback,       setFeedback]       = useState(null);
  const [activeBurst,    setActiveBurst]    = useState(null);
  const [prevProp,       setPrevProp]       = useState(selectedProductId);

  // Sync external selection
  if (selectedProductId && selectedProductId !== prevProp) {
    setPrevProp(selectedProductId);
    setProductId(String(selectedProductId));
  }

  // Active burst countdown
  useEffect(() => {
    if (!activeBurst) return;
    const t = setInterval(() => {
      setActiveBurst(prev => {
        if (!prev) return null;
        if (prev.remaining <= 1) return null;
        return { ...prev, remaining: prev.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [activeBurst]);

  const productOptions = useMemo(() => {
    const map = new Map();
    [...topProducts, ...movers].forEach(p => {
      if (p.product_id && !map.has(p.product_id)) map.set(p.product_id, p);
    });
    return Array.from(map.values());
  }, [topProducts, movers]);

  const selectedObj = productOptions.find(p => String(p.product_id) === String(productId));

  const applyPreset = (mult, dur) => {
    setMultiplier(mult);
    setDurSecs(dur);
    soundFX.playClick();
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setFeedback(null);
    const pid  = parseInt(productId, 10);
    const mult = parseInt(multiplier, 10);
    const dur  = parseInt(durSecs, 10);

    if (isNaN(pid)  || pid  <= 0) { setFeedback({ type: 'error', msg: 'Enter a valid numeric Product ID.' }); return; }
    if (isNaN(mult) || mult <= 0) { setFeedback({ type: 'error', msg: 'Multiplier must be > 0.' }); return; }
    if (isNaN(dur)  || dur  <= 0) { setFeedback({ type: 'error', msg: 'Duration must be > 0 seconds.' }); return; }

    setIsSubmitting(true);
    soundFX.playClick();

    try {
      const res     = await fetch(`${API_BASE_URL}/api/burst`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ product_id: pid, multiplier: mult, duration_seconds: dur }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.detail || 'Burst API failed');

      soundFX.playBurst?.();
      const name = selectedObj?.product_name || `Product #${pid}`;
      setFeedback({ type: 'success', msg: `Signal deployed! Injecting ${mult}x burst for "${name}" for ${dur}s.` });
      setActiveBurst({ productId: pid, productName: name, multiplier: mult, totalDuration: dur, remaining: dur });
      onBurstTriggered?.(resData);
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Slider fill percentage
  const sliderPct = ((multiplier - 1) / (50 - 1)) * 100;

  return (
    <div className={`panel burst-panel ${className}`} style={{ marginTop: '16px' }}>
      {/* Header */}
      <div className="panel-hdr">
        <div className="panel-title-group">
          <div className="panel-icon-wrap panel-icon-wrap-orange">
            <Zap size={16} />
          </div>
          <div>
            <div className="panel-heading">Live Traffic Injection</div>
            <div className="panel-sub">Simulate real-time sales spike via Kafka producer</div>
          </div>
        </div>
        <div className="panel-badges">
          <span className="badge badge-kafka">KAFKA LIVE</span>
        </div>
      </div>

      {/* Active burst banner */}
      {activeBurst && (
        <div style={{ padding: '12px 16px 0' }}>
          <div className="active-burst-banner">
            <div className="burst-banner-top">
              <div className="burst-banner-info">
                <span className="burst-live-dot" />
                <div>
                  <div className="burst-banner-title">Active: {activeBurst.productName}</div>
                  <div className="burst-banner-meta">
                    ID #{activeBurst.productId} · {activeBurst.multiplier}x · {activeBurst.remaining}s remaining
                  </div>
                </div>
              </div>
              <div className="burst-timer">{activeBurst.remaining}s</div>
            </div>
            <div className="burst-progress-bg">
              <div
                className="burst-progress-fill"
                style={{ width: `${(activeBurst.remaining / activeBurst.totalDuration) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Presets */}
      <div className="burst-presets">
        <span className="preset-label">Presets:</span>
        {PRESETS.map(p => {
          const PresetIcon = p.icon;
          return (
            <button
              key={p.label}
              type="button"
              className="preset-btn"
              onClick={() => applyPreset(p.mult, p.dur)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <PresetIcon size={12} />
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* Form */}
      <form className="burst-form" onSubmit={handleSubmit}>
        {/* Product dropdown */}
        <div className="form-field">
          <label className="field-label">Target Product</label>
          <select
            className="field-select"
            value={productId}
            onChange={e => setProductId(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="">— Select from active products —</option>
            {productOptions.map(p => (
              <option key={p.product_id} value={p.product_id}>
                #{p.product_id} · {p.product_name} ({(p.total_units || 0).toLocaleString()} units)
              </option>
            ))}
          </select>
        </div>

        {/* Manual ID */}
        <div className="form-field">
          <label className="field-label">Product ID (Numeric SKU)</label>
          <input
            type="number"
            className="field-input mono-input"
            placeholder="e.g. 24852 (Banana)"
            value={productId}
            onChange={e => setProductId(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        {/* Multiplier slider */}
        <div className="form-field">
          <div className="slider-header">
            <label className="field-label">Volume Multiplier</label>
            <span className="slider-val">{multiplier}× Traffic</span>
          </div>
          <input
            type="range"
            min="1" max="50" step="1"
            className="range-slider"
            style={{ '--pct': `${sliderPct}%` }}
            value={multiplier}
            onChange={e => setMultiplier(Number(e.target.value))}
            disabled={isSubmitting}
          />
          <div className="slider-ticks">
            <span>1× Base</span>
            <span>10×</span>
            <span>25×</span>
            <span>50× Max</span>
          </div>
        </div>

        {/* Duration pills */}
        <div className="form-field">
          <label className="field-label">Burst Duration</label>
          <div className="dur-pills">
            {[30, 60, 120, 180, 300].map(s => (
              <button
                key={s}
                type="button"
                className={`dur-pill ${durSecs === s ? 'active' : ''}`}
                onClick={() => setDurSecs(s)}
                disabled={isSubmitting}
              >
                {s >= 60 ? `${s / 60}min` : `${s}s`}
              </button>
            ))}
          </div>
        </div>

        {/* Deploy */}
        <button
          type="submit"
          className="deploy-btn"
          disabled={isSubmitting || !productId}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          {isSubmitting ? (
            <>
              <span className="spinner spinner-sm" />
              <span>Transmitting Kafka Signal…</span>
            </>
          ) : (
            <>
              <Zap size={15} />
              <span>Inject Real-Time Traffic Spike</span>
            </>
          )}
        </button>

        {/* Feedback */}
        {feedback && (
          <div className={`feedback-banner ${feedback.type === 'success' ? 'feedback-success' : 'feedback-error'}`}>
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{feedback.msg}</span>
          </div>
        )}
      </form>
    </div>
  );
}
