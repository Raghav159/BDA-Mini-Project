import React, { useState } from 'react';

export default function BurstControl({ topProducts = [], onBurstTriggered }) {
  const [productId, setProductId] = useState('');
  const [multiplier, setMultiplier] = useState(10);
  const [durationSeconds, setDurationSeconds] = useState(120);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleSelectProduct = (e) => {
    const val = e.target.value;
    setProductId(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);

    const parsedId = parseInt(productId, 10);
    const parsedMult = parseInt(multiplier, 10);
    const parsedDur = parseInt(durationSeconds, 10);

    if (isNaN(parsedId) || parsedId <= 0) {
      setFeedback({ type: 'error', message: 'Please enter or select a valid Product ID (> 0).' });
      return;
    }

    if (isNaN(parsedMult) || parsedMult <= 0) {
      setFeedback({ type: 'error', message: 'Multiplier must be a positive integer.' });
      return;
    }

    if (isNaN(parsedDur) || parsedDur <= 0) {
      setFeedback({ type: 'error', message: 'Duration must be a positive integer.' });
      return;
    }

    setIsSubmitting(true);

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
        throw new Error(resData.detail || 'Failed to trigger burst signal');
      }

      setFeedback({
        type: 'success',
        message: `🚀 Sales burst triggered! Product #${parsedId} (${parsedMult}x volume for ${parsedDur}s)`,
      });

      if (onBurstTriggered) {
        onBurstTriggered(resData);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Failed to send burst signal: ${err.message}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dashboard-card">
      <div className="card-title-bar">
        <h2>⚡ Demo Sales Burst Trigger</h2>
        <span className="pipeline-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fcd34d', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
          Kafka Injection
        </span>
      </div>

      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Inject spike traffic into Kafka producer to simulate intraday sales surge for live demo.
      </p>

      <form onSubmit={handleSubmit} className="burst-form">
        <div className="form-group">
          <label htmlFor="product-select">Quick Select Top Product</label>
          <select
            id="product-select"
            className="form-select"
            value={productId}
            onChange={handleSelectProduct}
            disabled={isSubmitting}
          >
            <option value="">-- Select from Top 10 or enter ID below --</option>
            {topProducts.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                #{p.product_id} - {p.product_name} ({p.total_units} units)
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="product-id-input">Product ID *</label>
          <input
            id="product-id-input"
            type="number"
            className="form-input mono"
            placeholder="e.g. 24852"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label htmlFor="multiplier-input">Multiplier (x)</label>
            <input
              id="multiplier-input"
              type="number"
              className="form-input mono"
              min="1"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="duration-input">Duration (sec)</label>
            <input
              id="duration-input"
              type="number"
              className="form-input mono"
              min="1"
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>
        </div>

        <button type="submit" className="burst-btn" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></span>
              Sending Burst Signal...
            </>
          ) : (
            <>
              ⚡ Trigger Sales Burst
            </>
          )}
        </button>

        {feedback && (
          <div className={`feedback-msg ${feedback.type}`}>
            {feedback.message}
          </div>
        )}
      </form>
    </div>
  );
}
