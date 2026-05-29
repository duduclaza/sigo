import { riskClass } from '../../services/forecastApi.js';

export default function RiskBadge({ status }) {
  return <span className={`risk-badge ${riskClass(status)}`}>{status || 'Sem previsao'}</span>;
}
