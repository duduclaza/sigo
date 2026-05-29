import { formatNumber } from '../../services/forecastApi.js';

export default function ForecastCard({ icon: Icon, label, value, helper, tone = 'default', digits = 0 }) {
  return (
    <article className={`forecast-card ${tone}`}>
      <div className="forecast-card-icon">{Icon && <Icon size={19} />}</div>
      <span>{label}</span>
      <strong>{typeof value === 'number' ? formatNumber(value, digits) : value ?? '-'}</strong>
      {helper && <small>{helper}</small>}
    </article>
  );
}
