import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Activity,
  Info,
  Zap,
  Clock,
  Layers,
  Gauge,
} from 'lucide-react';

// Neon accent palette for top product trajectories (matching design tokens)
const LINE_COLORS = [
  { stroke: '#06b6d4', glow: 'rgba(6, 182, 212, 0.45)', fill: 'rgba(6, 182, 212, 0.08)', name: 'Electric Cyan' },
  { stroke: '#a855f7', glow: 'rgba(168, 85, 247, 0.45)', fill: 'rgba(168, 85, 247, 0.08)', name: 'Neon Purple' },
  { stroke: '#10b981', glow: 'rgba(16, 185, 129, 0.45)', fill: 'rgba(16, 185, 129, 0.08)', name: 'Emerald Wave' },
];

/**
 * Format a window identifier like "window_20261011_064600" into a readable short label (e.g. "06:46").
 */
function formatWindowLabel(windowId, index, total) {
  if (!windowId) return `W#${index + 1}`;
  const parts = windowId.split('_');
  if (parts.length >= 3 && parts[2].length >= 4) {
    const timePart = parts[2]; // e.g. "064600"
    const hh = timePart.slice(0, 2);
    const mm = timePart.slice(2, 4);
    return `${hh}:${mm}`;
  }
  return windowId.replace(/^window_/, 'W:');
}

export default function IntradayVelocityChart({
  rankingData,
  onSelectProductForBurst,
}) {
  const top10 = rankingData?.top_10 || [];
  const movers = rankingData?.momentum_movers || [];
  const rawHistory = rankingData?.window_history || [];
  const currentWindowId = rankingData?.window_id;

  // Active series toggle state
  const [activeSeries, setActiveSeries] = useState({ 0: true, 1: true, 2: true });
  // Interactive hover tooltip state
  const [hoveredPoint, setHoveredPoint] = useState(null);

  /**
   * OPTION A: Top 3 Current-Window Velocity Leaders
   * Select the 3 products with the HIGHEST units sold in the latest completed window.
   * This makes the chart completely independent from the cumulative bestseller leaderboard
   * and highlights the products moving fastest RIGHT NOW.
   */
  const trackedSkus = useMemo(() => {
    // Gather candidates from both top 10 and momentum movers
    const candidateMap = new Map();
    [...top10, ...movers].forEach((p) => {
      if (p.product_id && !candidateMap.has(String(p.product_id))) {
        candidateMap.set(String(p.product_id), p);
      }
    });

    const candidates = Array.from(candidateMap.values());
    // Sort strictly by current_window_units descending (fastest selling products right now)
    candidates.sort((a, b) => Number(b.current_window_units || 0) - Number(a.current_window_units || 0));

    return candidates.slice(0, 3).map((item, idx) => ({
      productId: String(item.product_id),
      productName: item.product_name || `SKU #${item.product_id}`,
      color: LINE_COLORS[idx % LINE_COLORS.length],
      currentUnits: Number(item.current_window_units ?? 0),
      prevUnits: Number(item.previous_window_units ?? 0),
      totalUnits: Number(item.total_units ?? 0),
      cumulativeRank: item.rank,
      velocityRank: idx + 1,
    }));
  }, [top10, movers]);

  // Build real historical window points (up to 20 recent tumbling windows)
  const chartData = useMemo(() => {
    if (trackedSkus.length === 0) {
      return { windows: [], series: [], maxVal: 100, isColdStart: true };
    }

    let windows = [];

    // Case 1: Backend persistent history has entries
    if (rawHistory && rawHistory.length > 0) {
      const recentHistory = rawHistory.slice(-20);
      windows = recentHistory.map((wh, idx) => {
        const shortLabel = formatWindowLabel(wh.window_id, idx, recentHistory.length);
        return {
          windowId: wh.window_id,
          label: shortLabel,
          timestamp: wh.timestamp,
          productUnits: wh.product_units || {},
          totalWindowUnits: wh.total_window_units || 0,
        };
      });
    } else if (currentWindowId) {
      // Case 2: Fresh start with 1 window processed but history array not yet accumulated
      windows = [
        {
          windowId: currentWindowId,
          label: formatWindowLabel(currentWindowId, 0, 1),
          productUnits: trackedSkus.reduce((acc, s) => {
            acc[s.productId] = s.currentUnits;
            return acc;
          }, {}),
          totalWindowUnits: trackedSkus.reduce((acc, s) => acc + s.currentUnits, 0),
        },
      ];
    }

    // Calculate dynamic headroom for Y-axis
    let maxVal = 10;
    const series = trackedSkus.map((sku) => {
      const points = windows.map((w, wIdx) => {
        const val = Number(w.productUnits[sku.productId] ?? 0);
        if (val > maxVal) maxVal = val;
        return {
          windowLabel: w.label,
          windowId: w.windowId,
          timestamp: w.timestamp,
          xIndex: wIdx,
          value: val,
          skuId: sku.productId,
          skuName: sku.productName,
          color: sku.color,
          velocityRank: sku.velocityRank,
        };
      });
      return {
        ...sku,
        points,
      };
    });

    // Clean Y-axis scale ceiling
    maxVal = Math.ceil((maxVal * 1.15) / 50) * 50 || 100;

    return {
      windows,
      series,
      maxVal,
      isColdStart: windows.length <= 1,
    };
  }, [rawHistory, trackedSkus, currentWindowId]);

  // Coordinate geometry
  const svgWidth = 840;
  const svgHeight = 230;
  const padLeft = 65;
  const padRight = 45;
  const padTop = 25;
  const padBottom = 40;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const getX = (idx, totalPoints) => {
    if (totalPoints <= 1) return padLeft + chartW / 2;
    return padLeft + (idx / (totalPoints - 1)) * chartW;
  };

  const getY = (val) => {
    const ratio = Math.max(0, Math.min(1, val / (chartData.maxVal || 1)));
    return padTop + chartH - ratio * chartH;
  };

  const toggleSeries = (idx) => {
    setActiveSeries((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  // 4 Y-axis grid tick levels
  const yTicks = [0, 0.33, 0.66, 1].map((r) => Math.round(r * chartData.maxVal));

  // Determine interval for X-axis labels to avoid overlapping text
  const labelInterval = Math.max(1, Math.ceil(chartData.windows.length / 7));

  return (
    <div className="telemetry-panel intraday-chart-panel">
      {/* Panel Header & Unified Legend */}
      <div className="panel-title-strip">
        <div className="panel-title-text-group">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-cyan-400" />
            <h3 className="panel-box-title">Sales Velocity Radar · Top 3 Current-Window Velocity Leaders</h3>
          </div>
          <span className="panel-box-sub">
            Fastest-selling SKUs right now (Units sold in latest 60s tumbling window · Independent of cumulative rank)
          </span>
        </div>

        {/* Single Coherent Legend with Product Name & Color Indicators */}
        <div className="chart-legend-pills">
          {trackedSkus.map((sku, idx) => {
            const isActive = activeSeries[idx] !== false;
            return (
              <button
                key={sku.productId}
                className={`chart-legend-pill ${isActive ? 'legend-active' : 'legend-muted'}`}
                style={{
                  borderColor: isActive ? sku.color.stroke : 'transparent',
                  background: isActive ? `${sku.color.glow}` : 'rgba(255,255,255,0.03)',
                }}
                onClick={() => toggleSeries(idx)}
                title={`Click to toggle ${sku.productName}`}
              >
                <span
                  className="legend-dot"
                  style={{
                    backgroundColor: sku.color.stroke,
                    boxShadow: isActive ? `0 0 8px ${sku.color.stroke}` : 'none',
                  }}
                />
                <span className="legend-sku-name">{sku.productName}</span>
                <span className="legend-sku-rate mono">{sku.currentUnits.toLocaleString()} / win</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main SVG Visualization */}
      <div className="chart-svg-wrapper">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="velocity-svg-chart"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {LINE_COLORS.map((c, i) => (
              <React.Fragment key={i}>
                <linearGradient id={`grad-area-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.stroke} stopOpacity="0.2" />
                  <stop offset="100%" stopColor={c.stroke} stopOpacity="0.0" />
                </linearGradient>
                <filter id={`glow-${i}`} x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </React.Fragment>
            ))}
          </defs>

          {/* Y-Axis Label */}
          <text
            x={12}
            y={padTop + chartH / 2}
            transform={`rotate(-90, 12, ${padTop + chartH / 2})`}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize="10"
            fontFamily="var(--font-mono)"
            letterSpacing="0.04em"
          >
            Units / 60s Window
          </text>

          {/* Horizontal Grid lines and Y-axis tick values */}
          {yTicks.map((tickVal, tIdx) => {
            const yPos = getY(tickVal);
            return (
              <g key={tIdx} className="chart-grid-line-group">
                <line
                  x1={padLeft}
                  y1={yPos}
                  x2={svgWidth - padRight}
                  y2={yPos}
                  stroke="rgba(255, 255, 255, 0.07)"
                  strokeDasharray={tIdx === 0 ? 'none' : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 10}
                  y={yPos + 3.5}
                  textAnchor="end"
                  className="chart-axis-label mono"
                  fill="var(--text-muted)"
                  fontSize="10"
                >
                  {tickVal.toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* X-Axis Vertical Grid Lines and Non-Overlapping Window Labels */}
          {chartData.windows.map((w, wIdx) => {
            const xPos = getX(wIdx, chartData.windows.length);
            const isLast = wIdx === chartData.windows.length - 1;
            const isFirst = wIdx === 0;
            const isLabeled = isFirst || isLast || (wIdx % labelInterval === 0);

            return (
              <g key={wIdx} className="chart-x-group">
                <line
                  x1={xPos}
                  y1={padTop}
                  x2={xPos}
                  y2={padTop + chartH}
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeWidth="1"
                />
                {isLabeled && (
                  <text
                    x={xPos}
                    y={svgHeight - 14}
                    textAnchor="middle"
                    className="chart-axis-label mono"
                    fill="var(--text-muted)"
                    fontSize="10"
                  >
                    {w.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Series Lines, Shaded Area, and Precise Node Coordinates */}
          {chartData.series.map((ser, sIdx) => {
            if (activeSeries[sIdx] === false) return null;
            const pts = ser.points;
            if (pts.length === 0) return null;

            // Generate polyline string
            const pathPoints = pts
              .map((p, idx) => `${getX(idx, pts.length)},${getY(p.value)}`)
              .join(' ');

            // Area fill under #1 current velocity leader
            const firstX = getX(0, pts.length);
            const lastX = getX(pts.length - 1, pts.length);
            const baseY = getY(0);
            const areaPoints = `${firstX},${baseY} ${pathPoints} ${lastX},${baseY}`;

            return (
              <g key={ser.productId} className={`chart-series-group series-${sIdx}`}>
                {/* Area under series 0 */}
                {sIdx === 0 && pts.length > 1 && (
                  <polygon points={areaPoints} fill={`url(#grad-area-${sIdx})`} />
                )}

                {/* Main Glowing Line */}
                {pts.length > 1 && (
                  <polyline
                    points={pathPoints}
                    fill="none"
                    stroke={ser.color.stroke}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter={`url(#glow-${sIdx})`}
                  />
                )}

                {/* Node Points strictly on line coordinates */}
                {pts.map((p, pIdx) => {
                  const cx = getX(pIdx, pts.length);
                  const cy = getY(p.value);
                  const isHovered =
                    hoveredPoint &&
                    hoveredPoint.skuId === p.skuId &&
                    hoveredPoint.xIndex === p.xIndex;

                  return (
                    <g
                      key={pIdx}
                      className="chart-node-group"
                      onMouseEnter={() =>
                        setHoveredPoint({
                          ...p,
                          cx,
                          cy,
                        })
                      }
                      onMouseLeave={() => setHoveredPoint(null)}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 6 : 4}
                        fill="#050813"
                        stroke={ser.color.stroke}
                        strokeWidth={isHovered ? 3 : 2}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="chart-tooltip-bubble"
            style={{
              left: `${(hoveredPoint.cx / svgWidth) * 100}%`,
              top: `${(hoveredPoint.cy / svgHeight) * 100}%`,
            }}
          >
            <div className="tooltip-header flex items-center justify-between gap-2">
              <span className="tooltip-title">{hoveredPoint.skuName}</span>
              <span className="tooltip-rank mono">#{hoveredPoint.velocityRank} Velocity</span>
            </div>
            <div className="tooltip-body">
              <div className="tooltip-metric-row">
                <span className="text-muted">Window:</span>
                <span className="mono font-semibold">{hoveredPoint.windowId || hoveredPoint.windowLabel}</span>
              </div>
              <div className="tooltip-metric-row">
                <span className="text-muted">Units Sold:</span>
                <span className="mono font-bold text-cyan-400">
                  {hoveredPoint.value.toLocaleString()} units
                </span>
              </div>
            </div>
            {onSelectProductForBurst && (
              <button
                className="tooltip-spike-btn"
                onClick={() => onSelectProductForBurst(hoveredPoint.skuId)}
              >
                <Zap size={10} />
                <span>Inject Surge</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chart Footer Insight Strip */}
      <div className="chart-insight-strip">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Info size={12} className="text-cyan-400" />
          <span>
            {chartData.windows.length >= 2
              ? `Displaying rolling history across ${chartData.windows.length} tumbling windows (YARN MapReduce commits).`
              : 'Window 1 of 20 recorded. Trajectory curve expands automatically with each 60s tumbling window commit.'}
          </span>
        </div>

        <div className="chart-rate-badge mono">
          <TrendingUp size={11} className="text-emerald-400" />
          <span>Peak Velocity: {chartData.maxVal.toLocaleString()} units / win</span>
        </div>
      </div>
    </div>
  );
}
