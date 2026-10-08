import React, { useState } from 'react';

export default function ArchitectureModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('pipeline');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-badge">BIG DATA ANALYTICS PIPELINE</span>
            <h2>🏗️ System Architecture & Engineering Specs</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="modal-tabs">
          <button
            className={`modal-tab ${activeTab === 'pipeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('pipeline')}
          >
            🌊 End-to-End Pipeline
          </button>
          <button
            className={`modal-tab ${activeTab === 'mapreduce' ? 'active' : ''}`}
            onClick={() => setActiveTab('mapreduce')}
          >
            ⚡ MapReduce & HDFS
          </button>
          <button
            className={`modal-tab ${activeTab === 'formulas' ? 'active' : ''}`}
            onClick={() => setActiveTab('formulas')}
          >
            📐 Mathematical Formulas
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'pipeline' && (
            <div className="tab-pane">
              <p className="tab-lead">
                Real-Time Top-Selling Product & Intraday Momentum Ranking Engine designed for streaming high-volume Instacart grocery transactions.
              </p>
              
              <div className="pipeline-steps">
                <div className="pipeline-step">
                  <div className="step-num">01</div>
                  <div className="step-content">
                    <h4>Instacart Stream Generator</h4>
                    <p>Replays 3.2M+ historical transactions at realistic speeds with configurable burst traffic injection capabilities.</p>
                    <span className="tech-tag">producer.py</span>
                  </div>
                </div>

                <div className="pipeline-step-arrow">⬇</div>

                <div className="pipeline-step">
                  <div className="step-num">02</div>
                  <div className="step-content">
                    <h4>Apache Kafka Event Bus</h4>
                    <p>High-throughput distributed event broker buffering sales transactions on topic <code>instacart.sales.events</code>.</p>
                    <span className="tech-tag">Kafka :9092</span>
                  </div>
                </div>

                <div className="pipeline-step-arrow">⬇</div>

                <div className="pipeline-step">
                  <div className="step-num">03</div>
                  <div className="step-content">
                    <h4>Sliding Window Buffer & HDFS Ingestion</h4>
                    <p>Tumbling window consumer batches events in 60-second time windows and uploads partitions directly to HDFS.</p>
                    <span className="tech-tag">HDFS /bda/input</span>
                  </div>
                </div>

                <div className="pipeline-step-arrow">⬇</div>

                <div className="pipeline-step">
                  <div className="step-num">04</div>
                  <div className="step-content">
                    <h4>Hadoop MapReduce Streaming</h4>
                    <p>Distributed Python Mapper & Reducer count and aggregate unit quantities per Product ID across window partitions.</p>
                    <span className="tech-tag">hadoop-streaming.jar</span>
                  </div>
                </div>

                <div className="pipeline-step-arrow">⬇</div>

                <div className="pipeline-step">
                  <div className="step-num">05</div>
                  <div className="step-content">
                    <h4>Stage 8 Ranking & Momentum Engine</h4>
                    <p>Maintains stateful sliding window history, calculates delta velocity %, detects top gainers, and persists JSON state.</p>
                    <span className="tech-tag">engine/ranking_engine.py</span>
                  </div>
                </div>

                <div className="pipeline-step-arrow">⬇</div>

                <div className="pipeline-step highlight">
                  <div className="step-num">06</div>
                  <div className="step-content">
                    <h4>FastAPI & React 19 Frontend</h4>
                    <p>Sub-millisecond static state serving layer with live polling, burst simulation console, and responsive UI.</p>
                    <span className="tech-tag">FastAPI :8000 + React :5173</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mapreduce' && (
            <div className="tab-pane">
              <h3>Hadoop Streaming Aggregator Architecture</h3>
              <p className="tab-lead">
                Uses standard POSIX input/output streams with Hadoop Streaming to parallelize transaction aggregation across cluster nodes.
              </p>

              <div className="spec-grid">
                <div className="spec-card">
                  <h4>Mapper (<span className="mono">mapper.py</span>)</h4>
                  <ul>
                    <li>Reads TSV lines from STDIN: <code>order_id, user_id, order_number, order_dow, order_hour_of_day, days_since_prior_order, product_id, add_to_cart_order, reordered, timestamp</code></li>
                    <li>Emits key-value pair to STDOUT: <code>product_id \t 1</code></li>
                    <li>Filters invalid records and headers defensively.</li>
                  </ul>
                </div>

                <div className="spec-card">
                  <h4>Reducer (<span className="mono">reducer.py</span>)</h4>
                  <ul>
                    <li>Reads sorted key-value pairs from Hadoop's Shuffle & Sort phase.</li>
                    <li>Accumulates unit sums per distinct <code>product_id</code>.</li>
                    <li>Emits aggregate result: <code>product_id \t total_units</code>.</li>
                    <li>Saves results back into HDFS output directory.</li>
                  </ul>
                </div>
              </div>

              <div className="cluster-specs">
                <div className="cluster-item">
                  <span className="cluster-label">HDFS Input URI</span>
                  <span className="cluster-value mono">hdfs://namenode:9000/bda/input/&lt;window_id&gt;</span>
                </div>
                <div className="cluster-item">
                  <span className="cluster-label">HDFS Output URI</span>
                  <span className="cluster-value mono">hdfs://namenode:9000/bda/output/&lt;window_id&gt;</span>
                </div>
                <div className="cluster-item">
                  <span className="cluster-label">Tumbling Window</span>
                  <span className="cluster-value mono">60 seconds</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'formulas' && (
            <div className="tab-pane">
              <h3>Momentum & Velocity Calculation Formulas</h3>
              <p className="tab-lead">
                Tracks sales acceleration and shifts in consumer purchase behaviors across tumbling time windows.
              </p>

              <div className="formula-box">
                <div className="formula-title">Intraday Momentum Percentage Formula</div>
                <div className="formula-math mono">
                  Momentum (%) = ((W_curr - W_prev) / max(W_prev, 1)) × 100
                </div>
                <p className="formula-desc">
                  Where <code>W_curr</code> is unit sales in the current 60s window, and <code>W_prev</code> is unit sales in the immediately preceding window. Using <code>max(W_prev, 1)</code> prevents division by zero when a cold item experiences a sudden surge.
                </p>
              </div>

              <div className="formula-box">
                <div className="formula-title">Direction Categorization Rules</div>
                <div className="rules-list">
                  <div className="rule-item">
                    <span className="pill up">▲ UP</span>
                    <span><code>Momentum &gt; 0%</code> (Sales rate accelerating)</span>
                  </div>
                  <div className="rule-item">
                    <span className="pill down">▼ DOWN</span>
                    <span><code>Momentum &lt; 0%</code> (Sales rate cooling down)</span>
                  </div>
                  <div className="rule-item">
                    <span className="pill neutral">― NEUTRAL</span>
                    <span><code>Momentum == 0%</code> (Stable sales rate)</span>
                  </div>
                </div>
              </div>

              <div className="formula-box">
                <div className="formula-title">All-Time Cumulative Rank vs Window Velocity</div>
                <p className="formula-desc">
                  The primary leaderboard ranks by cumulative <code>total_units</code> across the entire pipeline run, while the <strong>Top 5 Momentum Movers</strong> board highlights the fastest rate-of-change spikes regardless of total historical volume.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <span className="modal-footer-note">BDA Mini Project • High-Performance Big Data Architecture</span>
          <button className="primary-button" onClick={onClose}>
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
