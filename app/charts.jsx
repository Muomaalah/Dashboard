// Chart helpers wrapping Chart.js
const { useRef, useEffect: cEffect } = React;

const CHART_COLORS = {
  primary:   'oklch(45% 0.13 235)',
  primaryS:  'oklch(45% 0.13 235 / 0.12)',
  teal:      'oklch(60% 0.12 195)',
  tealS:     'oklch(60% 0.12 195 / 0.15)',
  amber:     'oklch(70% 0.14 70)',
  red:       'oklch(58% 0.18 25)',
  green:     'oklch(58% 0.13 150)',
  slate:     'oklch(55% 0.02 240)',
  ink:       'oklch(22% 0.02 240)',
  muted:     'oklch(70% 0.02 240)',
  gridline:  'oklch(92% 0.005 240)',
  districts: {
    'ACCRA NORTHEAST': 'oklch(45% 0.13 235)',
    'ADENTA':          'oklch(60% 0.13 175)',
    'DODOWA':          'oklch(60% 0.14 70)',
    'AGBOGBA':         'oklch(58% 0.18 25)',
  }
};

function fmtMoney(v) {
  if (v == null || isNaN(v)) return '—';
  if (Math.abs(v) >= 1e6) return 'GHS ' + (v/1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e3) return 'GHS ' + (v/1e3).toFixed(1) + 'K';
  return 'GHS ' + Math.round(v).toLocaleString();
}
function fmtNum(v, d=0) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}
function fmtPct(v, d=1) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(d) + '%';
}
function fmtM3(v) {
  if (v == null || isNaN(v)) return '—';
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(2) + 'M m³';
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(0) + 'K m³';
  return Math.round(v).toLocaleString() + ' m³';
}

// Generic Chart component
function ChartCanvas({ type, data, options, height = 240 }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  cEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) chartRef.current.destroy();
    const ctx = ref.current.getContext('2d');
    Chart.defaults.font.family = "'Geist', system-ui, sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = CHART_COLORS.slate;
    // Register datalabels plugin globally if available, but disable by default
    if (window.ChartDataLabels && !Chart.registry.plugins.get('datalabels')) {
      Chart.register(window.ChartDataLabels);
    }
    chartRef.current = new Chart(ctx, { type, data, options });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [type, JSON.stringify(data), JSON.stringify(options)]);
  return <div style={{ position: 'relative', height }}><canvas ref={ref} /></div>;
}

// Smart label formatter — auto-formats numbers based on magnitude
function smartLabelFmt(v) {
  if (v == null || isNaN(v)) return '';
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v/1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (v/1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (v/1e3).toFixed(0) + 'K';
  if (abs >= 10)  return Math.round(v).toString();
  return v.toFixed(1);
}

// Defaults for line chart — straight segments, clean (labels off, opt-in via `endLabels: true`)
function lineOpts(extra = {}) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 8, right: extra.endLabels ? 64 : 8, left: 4, bottom: 4 } },
    elements: {
      line:  { tension: 0 },
      point: { radius: 0, hoverRadius: 6, borderWidth: 2, backgroundColor: 'white', hoverBorderWidth: 2 }
    },
    plugins: {
      legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, padding: 12, font: { size: 11 } } },
      tooltip: {
        backgroundColor: 'oklch(22% 0.02 240)',
        titleFont: { weight: '600' }, padding: 10,
        boxPadding: 4,
        callbacks: extra.tooltipCallbacks || {}
      },
      datalabels: {
        // Default OFF. End-of-line labels only when extra.endLabels === true.
        display: (ctx) => {
          if (!window.ChartDataLabels) return false;
          if (!extra.endLabels) return false;
          if (ctx.dataset.borderDash) return false;
          if (ctx.dataset._dim) return false;
          if (ctx.dataset._noLabel) return false;
          // Show only at the last non-null index of each dataset
          const arr = ctx.dataset.data;
          let lastIdx = -1;
          for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i] != null) { lastIdx = i; break; }
          }
          return ctx.dataIndex === lastIdx;
        },
        align: 'right', anchor: 'end', offset: 10,
        clamp: false, clip: false,
        backgroundColor: 'transparent', borderWidth: 0, padding: 0,
        color: (ctx) => ctx.dataset.borderColor,
        font: { size: 11, weight: '600', family: "'Geist Mono', monospace" },
        formatter: extra.labelFormatter || ((v, ctx) => v == null ? '' : smartLabelFmt(v)),
      },
      ...(extra.plugins || {}),
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 10 } },
      y: { grid: { color: CHART_COLORS.gridline, drawBorder: false }, ticks: { font: { size: 10 }, ...(extra.yTicks || {}) } }
    },
    onClick: extra.onClick,
  };
}

// Defaults for bar charts — no inline labels (tooltip handles exact values)
function barOpts(extra = {}) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } } },
      tooltip: {
        backgroundColor: 'oklch(22% 0.02 240)', padding: 10, boxPadding: 4,
        callbacks: extra.tooltipCallbacks || {}
      },
      datalabels: { display: false },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, autoSkip: true, autoSkipPadding: 10 } },
      y: { grid: { color: CHART_COLORS.gridline }, ticks: { font: { size: 10 }, ...(extra.yTicks || {}) } }
    },
    ...(extra.options || {}),
  };
}

Object.assign(window, { ChartCanvas, CHART_COLORS, lineOpts, barOpts, fmtMoney, fmtNum, fmtPct, fmtM3, smartLabelFmt });
