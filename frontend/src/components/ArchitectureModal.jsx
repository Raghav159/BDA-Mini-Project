import React, { useState } from 'react';
import {
  Workflow,
  Cpu,
  Calculator,
  Network,
  X,
  ArrowDown,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

const TABS = [
  { key: 'pipeline',   label: 'Pipeline',   icon: Workflow   },
  { key: 'mapreduce',  label: 'MapReduce',  icon: Cpu        },
  { key: 'formulas',   label: 'Formulas',   icon: Calculator },
];

const PIPELINE_STEPS = [
  {
    num: '01',
    title: 'Instacart Stream Generator',
    desc:  'Replays 3.2M+ historical transactions at realistic speeds with configurable burst traffic injection. Enriches raw events with product metadata.',
    tag:   'producer/producer.py',
  },
  {
    num: '02',
    title: 'Apache Kafka Event Bus',
    desc:  'High-throughput distributed event broker buffering sales transactions on topic instacart.sales.events with configurable partitioning.',
    tag:   'Kafka :9092',
    arrow: true,
  },
  {
    num: '03',
    title: 'Tumbling Window Buffer & HDFS Ingestion',
    desc:  'Consumer batches events into 60-second tumbling time windows and serializes window partitions directly to HDFS.',
    tag:   'HDFS /bda/input/<window_id>',
  },
  {
    num: '04',
    title: 'Hadoop Streaming MapReduce',
    desc:  'Distributed Python Mapper & Reducer running on Hadoop Streaming inside Docker. Counts and aggregates unit quantities per Product ID per window.',
    tag:   'hadoop-streaming.jar',
  },
  {
    num: '05',
    title: 'Ranking & Momentum Engine',
    desc:  'Maintains stateful sliding window history, calculates delta velocity %, detects top gainers, and atomically persists JSON state.',
    tag:   'engine/ranking_engine.py',
  },
  {
    num: '06',
    title: 'FastAPI + React Dashboard',
    desc:  'Sub-millisecond static state serving layer with live polling, burst simulation console, and this real-time responsive UI.',
    tag:   'FastAPI :8000 + React :5173',
    highlight: true,
  },
];

export default function ArchitectureModal({ isOpen, onClose }) {
  const [tab, setTab] = useState('pipeline');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-hdr">
          <div className="modal-title-area">
            <div className="modal-eyebrow">Big Data Analytics Pipeline</div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Network size={20} />
              <span>System Architecture & Engineering Specs</span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          {TABS.map(t => {
            const TabIcon = t.icon;
            return (
              <button
                key={t.key}
                className={`modal-tab ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <TabIcon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Pipeline tab */}
          {tab === 'pipeline' && (
            <div className="tab-pane">
              <div className="tab-lead">
                Real-Time Top-Selling Product &amp; Intraday Momentum Ranking Engine — streaming 3.2M+ Instacart grocery transactions through a full distributed big data pipeline.
              </div>
              <div className="pipeline-flow">
                {PIPELINE_STEPS.map((step, i) => (
                  <React.Fragment key={step.num}>
                    <div className={`pipeline-step ${step.highlight ? 'highlight' : ''}`}>
                      <div className="step-num">{step.num}</div>
                      <div className="step-body">
                        <h4>{step.title}</h4>
                        <p>{step.desc}</p>
                        <span className="tech-tag">{step.tag}</span>
                      </div>
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div className="pipeline-connector">
                        <ArrowDown size={14} />
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* MapReduce tab */}
          {tab === 'mapreduce' && (
            <div className="tab-pane">
              <div className="tab-lead">
                Hadoop Streaming Aggregator uses standard POSIX I/O to parallelize transaction aggregation across cluster nodes — no JVM code required.
              </div>

              <div className="spec-grid">
                <div className="spec-card">
                  <h4>Mapper (<span className="mono">mapper.py</span>)</h4>
                  <ul>
                    <li>Reads TSV lines from STDIN: <code>order_id, product_id, quantity, timestamp…</code></li>
                    <li>Emits key-value pair to STDOUT: <code>product_id \t 1</code></li>
                    <li>Defensively filters invalid records and headers.</li>
                  </ul>
                </div>
                <div className="spec-card">
                  <h4>Reducer (<span className="mono">reducer.py</span>)</h4>
                  <ul>
                    <li>Reads sorted key-value pairs from Hadoop Shuffle & Sort.</li>
                    <li>Accumulates unit sums per distinct <code>product_id</code>.</li>
                    <li>Emits: <code>product_id \t total_units</code></li>
                    <li>Saves results back into HDFS output directory.</li>
                  </ul>
                </div>
              </div>

              <div className="cluster-specs">
                {[
                  { label: 'HDFS Input URI',    val: 'hdfs://namenode:9000/bda/input/<window_id>' },
                  { label: 'HDFS Output URI',   val: 'hdfs://namenode:9000/bda/output/<window_id>' },
                  { label: 'Tumbling Window',   val: '60 seconds' },
                  { label: 'State File',        val: 'state/ranking_output.json' },
                  { label: 'Kafka Topic',       val: 'instacart.sales.events' },
                ].map(c => (
                  <div key={c.label} className="cluster-item">
                    <span className="cluster-label">{c.label}</span>
                    <span className="cluster-val mono">{c.val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formulas tab */}
          {tab === 'formulas' && (
            <div className="tab-pane">
              <div className="tab-lead">
                Tracks sales acceleration and shifts in consumer purchase behaviors across tumbling time windows using window-over-window velocity delta.
              </div>

              <div className="formula-box">
                <div className="formula-title">Intraday Momentum Percentage Formula</div>
                <div className="formula-math">
                  Momentum (%) = ((W_curr − W_prev) / max(W_prev, 1)) × 100
                </div>
                <p className="formula-desc">
                  Where <code>W_curr</code> is unit sales in the current 60s window, and <code>W_prev</code> is
                  unit sales in the immediately preceding window. Using <code>max(W_prev, 1)</code> prevents
                  division by zero when a cold item experiences a sudden surge.
                </p>
              </div>

              <div className="formula-box">
                <div className="formula-title">Direction Classification Rules</div>
                <div className="rules-list">
                  <div className="rule-item">
                    <span className="rule-pill up" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <TrendingUp size={12} />
                      <span>UP</span>
                    </span>
                    <span><code>Momentum &gt; 0%</code> — sales rate accelerating window-over-window</span>
                  </div>
                  <div className="rule-item">
                    <span className="rule-pill down" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <TrendingDown size={12} />
                      <span>DOWN</span>
                    </span>
                    <span><code>Momentum &lt; 0%</code> — sales rate cooling compared to prior window</span>
                  </div>
                  <div className="rule-item">
                    <span className="rule-pill neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Minus size={12} />
                      <span>NEUTRAL</span>
                    </span>
                    <span><code>Momentum == 0%</code> — stable, identical unit sales across windows</span>
                  </div>
                </div>
              </div>

              <div className="formula-box">
                <div className="formula-title">Cumulative Rank vs Window Velocity</div>
                <p className="formula-desc">
                  The primary leaderboard ranks by cumulative <code>total_units</code> across the entire pipeline
                  run. The <strong>Top 5 Momentum Movers</strong> board highlights the fastest rate-of-change
                  spikes regardless of total historical volume — a product can spike to #1 mover while ranked
                  #10 on the leaderboard.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-ftr">
          <span className="modal-ftr-note">BDA Mini Project · High-Performance Big Data Architecture</span>
          <button className="primary-btn" onClick={onClose}>Close Inspector</button>
        </div>
      </div>
    </div>
  );
}
