import React, { useState, useMemo } from 'react';
import {
  Zap,
  Rocket,
  Sparkles,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Sliders,
  Clock,
} from 'lucide-react';
import { soundFX } from '../utils/audio';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const PRESETS = [
  { label: '3× Light', mult: 3, dur: 30, icon: Zap },
  { label: '10× Rush', mult: 10, dur: 60, icon: Rocket },
  { label: '25× Flash', mult: 25, dur: 120, icon: Sparkles },
  { label: '50× Hyper', mult: 50, dur: 180, icon: Flame },
];

export default function BurstConsole({
  topProducts = [],
  movers = [],
  selectedProductId = '',
  activeBurst,
  setActiveBurst,
  onBurstTriggered,
}) {
  const [productId, setProductId] = useState(selectedProductId ? String(selectedProductId) : '');
  const [multiplier, setMultiplier] = useState(10);
  const [durSecs, setDurSecs] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [prevProp, setPrevProp] = useState(selectedProductId);

  // Sync external selection
  if (selectedProductId && selectedProductId !== prevProp) {
    setPrevProp(selectedProductId);
    setProductId(String(selectedProductId));
  }

  const productOptions = useMemo(() => {
    const map = new Map();
    [...topProducts, ...movers].forEach((p) => {
      if (p.product_id && !map.has(p.product_id)) map.set(p.product_id, p);
    });
    return Array.from(map.values());
  }, [topProducts, movers]);

  const selectedObj = productOptions.find(
    (p) => String(p.product_id) === String(productId)
  );

  const applyPreset = (mult, dur) => {
    setMultiplier(mult);
    setDurSecs(dur);
    soundFX.playClick();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);
    const pid = parseInt(productId, 10);
    const mult = parseInt(multiplier, 10);
    const dur = parseInt(durSecs, 10);

    if (isNaN(pid) || pid <= 0) {
      setFeedback({ type: 'error', msg: 'Please provide a valid numeric Product SKU.' });
      return;
    }
    if (isNaN(mult) || mult <= 0) {
      setFeedback({ type: 'error', msg: 'Multiplier must be greater than 0.' });
      return;
    }
    if (isNaN(dur) || dur <= 0) {
      setFeedback({ type: 'error', msg: 'Duration must be greater than 0.' });
      return;
    }

    setIsSubmitting(true);
    soundFX.playClick();

    try {
      const res = await fetch(`${API_BASE_URL}/api/burst`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: pid,
          multiplier: mult,
          duration_seconds: dur,
        }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.detail || 'Burst API request rejected');

      soundFX.playBurst?.();
      const name = selectedObj?.product_name || `Product #${pid}`;
      setFeedback({
        type: 'success',
        msg: `Signal deployed! Transmitting ${mult}× spike traffic on "${name}" for ${dur}s into Kafka broker.`,
      });

      const burstObj = {
        productId: pid,
        productName: name,
        multiplier: mult,
        totalDuration: dur,
        remaining: dur,
      };

      setActiveBurst?.(burstObj);
      onBurstTriggered?.(burstObj);
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const sliderPct = ((multiplier - 1) / (50 - 1)) * 100;

  return (
    <section className="burst-console-card">
      <div className="burst-header-row">
        <div className="burst-header-titles">
          <div className="icon-pulse-box text-cyan-400">
            <Radio size={16} />
          </div>
          <div>
            <h3 className="burst-title">Kafka Overdrive Injector</h3>
            <span className="burst-subtitle">Inject live synthetic spike traffic into Kafka topic</span>
          </div>
        </div>
        <span className="burst-bus-tag">TOPIC: instacart.sales.events</span>
      </div>

      {/* Preset Buttons */}
      <div className="preset-bar">
        <span className="preset-bar-title">Presets:</span>
        <div className="preset-btn-list">
          {PRESETS.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.label}
                type="button"
                className="preset-action-btn"
                onClick={() => applyPreset(p.mult, p.dur)}
              >
                <Icon size={12} />
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Form Controls */}
      <form className="burst-ctrl-form" onSubmit={handleSubmit}>
        {/* SKU Selector Dropdown */}
        <div className="ctrl-field">
          <label className="ctrl-label">Target Product Stream</label>
          <select
            className="ctrl-select"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="">— Select from live active products —</option>
            {productOptions.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                #{p.product_id} • {p.product_name} ({(p.total_units || 0).toLocaleString()} units)
              </option>
            ))}
          </select>
        </div>

        {/* Manual SKU input */}
        <div className="ctrl-field">
          <label className="ctrl-label">Direct SKU ID Input</label>
          <input
            type="number"
            className="ctrl-input mono"
            placeholder="e.g. 24852 (Banana) or any SKU"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        {/* Multiplier Slider */}
        <div className="ctrl-field">
          <div className="slider-label-row">
            <label className="ctrl-label flex items-center gap-1">
              <Sliders size={12} />
              <span>Volume Spike Multiplier</span>
            </label>
            <span className="slider-current-val mono">{multiplier}× Traffic Rate</span>
          </div>
          <input
            type="range"
            min="1"
            max="50"
            step="1"
            className="overdrive-slider"
            style={{ '--pct': `${sliderPct}%` }}
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value))}
            disabled={isSubmitting}
          />
          <div className="slider-tick-row">
            <span>1× Normal</span>
            <span>10×</span>
            <span>25×</span>
            <span>50× Maximum</span>
          </div>
        </div>

        {/* Duration selector */}
        <div className="ctrl-field">
          <label className="ctrl-label flex items-center gap-1">
            <Clock size={12} />
            <span>Overdrive Duration</span>
          </label>
          <div className="dur-btn-strip">
            {[30, 60, 120, 180, 300].map((s) => (
              <button
                key={s}
                type="button"
                className={`dur-select-btn ${durSecs === s ? 'dur-active' : ''}`}
                onClick={() => setDurSecs(s)}
                disabled={isSubmitting}
              >
                {s >= 60 ? `${s / 60}m` : `${s}s`}
              </button>
            ))}
          </div>
        </div>

        {/* Deploy Signal Button */}
        <button
          type="submit"
          className="deploy-overdrive-btn"
          disabled={isSubmitting || !productId}
        >
          {isSubmitting ? (
            <>
              <span className="cyber-spinner-sm" />
              <span>Transmitting Kafka Signal…</span>
            </>
          ) : (
            <>
              <Zap size={16} />
              <span>Transmit Real-Time Traffic Spike</span>
            </>
          )}
        </button>

        {/* Feedback message */}
        {feedback && (
          <div className={`feedback-alert ${feedback.type === 'success' ? 'alert-success' : 'alert-error'}`}>
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{feedback.msg}</span>
          </div>
        )}
      </form>
    </section>
  );
}
