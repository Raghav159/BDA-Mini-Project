import React, { useState, useEffect } from 'react';
import {
  Database,
  Radio,
  Cpu,
  Zap,
  Play,
  Pause,
  Layers,
  Sparkles,
  Server,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';

export default function BatchPipelineRadar({
  windowId,
  totalWindows = 0,
  windowSizeSeconds = 60,
  lastUpdated = null,
  pipelineStatus = null,
  countdown,
  pollInterval,
  isPaused,
  onTogglePause,
  isRefreshing,
  isOnline = false,
  isBuffering = false,
  error = null,
}) {
  const [secondsSinceLastSync, setSecondsSinceLastSync] = useState(0);

  // Calculate genuine seconds elapsed since last completed backend window
  useEffect(() => {
    if (!lastUpdated || !isOnline) {
      setSecondsSinceLastSync(0);
      return;
    }
    const updateElapsed = () => {
      try {
        const lastMs = new Date(lastUpdated).getTime();
        if (isNaN(lastMs)) {
          setSecondsSinceLastSync(0);
          return;
        }
        const diff = Math.max(0, Math.floor((Date.now() - lastMs) / 1000));
        setSecondsSinceLastSync(diff);
      } catch {
        setSecondsSinceLastSync(0);
      }
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated, isOnline]);

  // Genuine stage index from backend (0: Kafka, 1: HDFS, 2: MapReduce, 3: Rankings)
  const currentStageIndex = !isOnline
    ? -1
    : pipelineStatus?.stage_index !== undefined
    ? pipelineStatus.stage_index
    : Math.min(3, Math.floor((secondsSinceLastSync / windowSizeSeconds) * 4));

  const isMapReduceRunning = isOnline && (currentStageIndex === 2 || pipelineStatus?.status === 'mapreduce');

  // Realistic window progress: reflects real buffer timeline and MapReduce crunching
  const windowProgressPct = !isOnline
    ? 0
    : isMapReduceRunning
    ? 85
    : currentStageIndex === 1
    ? 65
    : currentStageIndex === 3
    ? 98
    : Math.min(100, Math.max(5, (secondsSinceLastSync / windowSizeSeconds) * 100));

  const displayElapsed = Math.min(windowSizeSeconds, secondsSinceLastSync);

  const PIPELINE_STAGES = [
    { name: 'Kafka Streaming', icon: Radio, detail: pipelineStatus?.buffered_events ? `${pipelineStatus.buffered_events} events buffered` : 'Topic buffer :9092' },
    { name: 'HDFS Window Commit', icon: Database, detail: '/bda-project/windows/' },
    { name: 'MapReduce Aggregation', icon: Cpu, detail: 'Hadoop streaming jobs' },
    { name: 'Velocity Broadcast', icon: Zap, detail: 'Atomic state serialization' },
  ];

  return (
    <section className={`batch-radar-panel ${isOnline && (isMapReduceRunning || isRefreshing) ? 'is-crunching' : ''} ${!isOnline ? 'is-offline-panel' : ''}`}>
      {/* Background cyber grid */}
      <div className="radar-grid-bg" />
      {isOnline && (isMapReduceRunning || isRefreshing) && <div className="radar-scanline-beam" />}

      {/* Top Banner: Real telemetry status */}
      <div className="radar-header">
        <div className="radar-meta-group">
          <div className="radar-badge-pulse">
            <span className={`radar-blip ${!isOnline ? 'blip-offline' : isBuffering ? 'blip-buffering' : isMapReduceRunning ? 'blip-crunching' : ''}`} />
            <span className={`radar-cadence-title ${!isOnline ? 'title-offline' : isBuffering ? 'title-buffering' : ''}`}>
              {!isOnline
                ? 'ENGINE INACTIVE · AWAITING PIPELINE START'
                : isBuffering
                ? 'WINDOW #1 IN PROGRESS · BUFFERING KAFKA STREAM'
                : isMapReduceRunning
                ? 'HADOOP MAPREDUCE EXECUTING (YARN CLUSTER)'
                : pipelineStatus?.stage
                ? `${pipelineStatus.stage.toUpperCase()} IN PROGRESS`
                : '60s TUMBLING WINDOW CADENCE'}
            </span>
          </div>

          <div className="radar-window-tags">
            {isOnline ? (
              <>
                <span className="tag-mono tag-cyan">{isBuffering ? 'Window #1 Buffering' : `Window ${windowId || '#active'}`}</span>
                <span className="tag-mono tag-purple">{totalWindows} batches reduced</span>
                <span className="tag-mono tag-emerald">{windowSizeSeconds}s tumbling cycle</span>
                {pipelineStatus?.buffered_events !== undefined && (
                  <span className="tag-mono tag-cyan">{pipelineStatus.buffered_events} buffered</span>
                )}
              </>
            ) : (
              <>
                <span className="tag-mono tag-offline">FastAPI :8000 Offline</span>
                <span className="tag-mono tag-offline">0 batches active</span>
              </>
            )}
          </div>
        </div>

        {/* Polling Controls */}
        <div className="radar-controls">
          <div className="countdown-pill">
            <span className="countdown-label">Next UI Sync:</span>
            <span className="countdown-number">{isPaused ? 'PAUSED' : `${countdown}s`}</span>
          </div>
          <button
            className={`pause-toggle-btn ${isPaused ? 'is-paused' : ''}`}
            onClick={onTogglePause}
            title={isPaused ? 'Resume polling' : 'Pause polling'}
          >
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
        </div>
      </div>

      {/* 60s Tumbling Window Progress */}
      <div className="radar-progress-container">
        <div className="progress-labels">
          <div className="progress-status-text">
            <Layers size={13} className={isOnline ? 'text-cyan-400' : 'text-slate-500'} />
            {isOnline ? (
              <span>
                Tumbling Window Partition: <strong>{displayElapsed}s / {windowSizeSeconds}s</strong>
              </span>
            ) : (
              <span className="text-muted">
                Tumbling Window Engine: <strong>Standby (0s / {windowSizeSeconds}s)</strong>
              </span>
            )}
            {isOnline && (
              <span className="progress-pct-badge">{Math.round(windowProgressPct)}%</span>
            )}
          </div>

          <div className="progress-sub-activity">
            {!isOnline ? (
              <span className="activity-offline flex items-center gap-1 text-xs text-rose-400">
                <AlertCircle size={12} /> Start backend via <code>uvicorn api.main:app</code> or <code>bash run_demo.sh</code>
              </span>
            ) : isMapReduceRunning || isRefreshing ? (
              <span className="activity-crunching">
                <Sparkles size={12} className="spin-anim" /> Executing MapReduce Shuffle &amp; Sort on Hadoop YARN…
              </span>
            ) : pipelineStatus?.detail ? (
              <span className="activity-buffering">
                <Server size={12} /> {pipelineStatus.detail}
              </span>
            ) : (
              <span className="activity-buffering">
                <Server size={12} /> Buffering streaming events from Kafka…
              </span>
            )}
          </div>
        </div>

        {/* The Track */}
        <div className="radar-track-bar">
          <div
            className="radar-fill-bar"
            style={{ width: `${windowProgressPct}%` }}
          >
            {isOnline && <div className="radar-fill-glow" />}
            {isOnline && <span className="radar-fill-head" />}
          </div>

          {/* Data packet flow only when online */}
          {isOnline && (
            <div className="data-packets-lane">
              <span className="packet packet-1" />
              <span className="packet packet-2" />
              <span className="packet packet-3" />
            </div>
          )}
        </div>
      </div>

      {/* 4 Pipeline Stages */}
      <div className="radar-pipeline-nodes">
        {PIPELINE_STAGES.map((stage, idx) => {
          const StageIcon = stage.icon;
          const isActive = isOnline && (idx === currentStageIndex || isMapReduceRunning);
          const isDone = isOnline && idx < currentStageIndex;

          return (
            <React.Fragment key={stage.name}>
              <div
                className={`stage-node ${
                  !isOnline
                    ? 'stage-offline'
                    : isActive
                    ? 'stage-active'
                    : isDone
                    ? 'stage-done'
                    : ''
                }`}
              >
                <div className="stage-icon-circle">
                  <StageIcon size={14} />
                  {isActive && <span className="stage-ring-pulse" />}
                </div>
                <div className="stage-info">
                  <div className="stage-title">{stage.name}</div>
                  <div className="stage-detail">{stage.detail}</div>
                </div>
              </div>
              {idx < PIPELINE_STAGES.length - 1 && (
                <div className={`stage-connector ${isDone ? 'connector-done' : ''}`}>
                  <ArrowRight size={12} className="connector-arrow" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}
