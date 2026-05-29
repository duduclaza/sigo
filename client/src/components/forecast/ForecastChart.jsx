import { formatNumber, riskClass } from '../../services/forecastApi.js';

const COLORS = ['#173a72', '#d22d2d', '#138a52', '#2368b8', '#c27803', '#5b6472', '#7c3aed'];

export default function ForecastChart({ title, type = 'bar', data = [], xKey = 'id_local', yKey = 'total_planejado', secondKey, emptyLabel = 'Sem dados' }) {
  if (!data.length) {
    return (
      <section className="forecast-panel">
        <div className="panel-head"><h2>{title}</h2></div>
        <div className="empty">{emptyLabel}</div>
      </section>
    );
  }

  return (
    <section className="forecast-panel">
      <div className="panel-head"><h2>{title}</h2></div>
      {type === 'donut' && <DonutChart data={data} xKey={xKey} yKey={yKey} />}
      {type === 'bar' && <BarChart data={data} xKey={xKey} yKey={yKey} />}
      {type === 'gap' && <GapChart data={data} xKey={xKey} yKey={yKey} />}
      {type === 'line' && <LineChart data={data} xKey={xKey} yKey={yKey} />}
      {type === 'comparison' && <ComparisonChart data={data} xKey={xKey} yKey={yKey} secondKey={secondKey} />}
      {type === 'ranking' && <RankingChart data={data} xKey={xKey} yKey={yKey} />}
    </section>
  );
}

function BarChart({ data, xKey, yKey }) {
  const max = Math.max(...data.map((item) => Number(item[yKey] || 0)), 1);
  return (
    <div className="bar-chart">
      {data.slice(0, 12).map((item, index) => (
        <div className="bar-row" key={`${item[xKey]}-${index}`}>
          <span>{item[xKey] || '-'}</span>
          <div className="bar-track">
            <div style={{ width: `${Math.max((Number(item[yKey] || 0) / max) * 100, 2)}%`, background: COLORS[index % COLORS.length] }} />
          </div>
          <strong>{formatNumber(item[yKey])}</strong>
        </div>
      ))}
    </div>
  );
}

function GapChart({ data, xKey, yKey }) {
  const max = Math.max(...data.map((item) => Math.abs(Number(item[yKey] || 0))), 1);
  return (
    <div className="gap-chart">
      {data.slice(0, 12).map((item, index) => {
        const value = Number(item[yKey] || 0);
        return (
          <div className="gap-row" key={`${item[xKey]}-${index}`}>
            <span>{item[xKey] || '-'}</span>
            <div className="gap-axis">
              <div className={value < 0 ? 'negative' : 'positive'} style={{ width: `${Math.max((Math.abs(value) / max) * 50, 2)}%` }} />
            </div>
            <strong>{formatNumber(value, 1)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ data, xKey, yKey }) {
  const total = data.reduce((acc, item) => acc + Number(item[yKey] || 0), 0) || 1;
  let offset = 25;
  const segments = data.slice(0, 8).map((item, index) => {
    const value = Number(item[yKey] || 0);
    const dash = (value / total) * 75;
    const segment = { item, index, dash, offset };
    offset -= dash;
    return segment;
  });

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 42 42" className="donut">
        <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#e5ecf4" strokeWidth="6" />
        {segments.map((segment) => (
          <circle
            key={segment.item[xKey] || segment.index}
            cx="21"
            cy="21"
            r="15.9"
            fill="transparent"
            stroke={COLORS[segment.index % COLORS.length]}
            strokeWidth="6"
            strokeDasharray={`${segment.dash} ${100 - segment.dash}`}
            strokeDashoffset={segment.offset}
          />
        ))}
      </svg>
      <div className="chart-legend">
        {segments.map((segment) => (
          <span key={segment.item[xKey] || segment.index}>
            <i style={{ background: COLORS[segment.index % COLORS.length] }} />
            {segment.item[xKey]} {formatNumber(segment.item[yKey])}
          </span>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, xKey, yKey }) {
  const values = data.map((item) => Number(item[yKey] || 0));
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
    const y = 96 - (value / max) * 84;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="line-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke="#2368b8" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="line-labels">
        {data.map((item) => <span key={item[xKey]}>{item[xKey]}</span>)}
      </div>
    </div>
  );
}

function ComparisonChart({ data, xKey, yKey, secondKey }) {
  const max = Math.max(...data.flatMap((item) => [Number(item[yKey] || 0), Number(item[secondKey] || 0)]), 1);
  return (
    <div className="comparison-chart">
      {data.slice(0, 10).map((item) => (
        <div className="comparison-row" key={item[xKey]}>
          <span>{item[xKey]}</span>
          <div>
            <i className="capacity" style={{ width: `${Math.max((Number(item[yKey] || 0) / max) * 100, 2)}%` }} />
            <i className="volume" style={{ width: `${Math.max((Number(item[secondKey] || 0) / max) * 100, 2)}%` }} />
          </div>
        </div>
      ))}
      <div className="chart-legend inline">
        <span><i className="capacity" /> Capacidade</span>
        <span><i className="volume" /> Volume</span>
      </div>
    </div>
  );
}

function RankingChart({ data, xKey, yKey }) {
  return (
    <div className="risk-ranking">
      {data.slice(0, 8).map((item, index) => (
        <div key={`${item[xKey]}-${index}`} className={`risk-item ${riskClass(item.status_risco)}`}>
          <strong>{index + 1}</strong>
          <span>{item[xKey]}</span>
          <small>{item.status_risco}</small>
          <b>{formatNumber(item[yKey], 1)}</b>
        </div>
      ))}
    </div>
  );
}
