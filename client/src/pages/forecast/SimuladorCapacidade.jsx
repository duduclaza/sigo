import { useEffect, useState } from 'react';
import { Gauge, Play } from 'lucide-react';
import ForecastCard from '../../components/forecast/ForecastCard.jsx';
import RiskBadge from '../../components/forecast/RiskBadge.jsx';
import { forecastApi, formatNumber } from '../../services/forecastApi.js';

const empty = {
  plano_id: '',
  volume_previsto: '',
  produtividade_media: '',
  abs_percentual: '',
  abs_simulado_percentual: '',
  volume_variacao_percentual: 15,
  produtividade_variacao_percentual: -5,
  pt_adicional: 10,
  ciclos_removidos: 0
};

export default function SimuladorCapacidade() {
  const [planos, setPlanos] = useState([]);
  const [form, setForm] = useState(empty);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    forecastApi.listPlanos()
      .then((payload) => setPlanos(payload.data || []))
      .catch((err) => setError(err.message));
  }, []);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function simulate(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = await forecastApi.simulador(form);
      setResult(payload.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="forecast-two-col">
      <section className="forecast-panel">
        <div className="panel-head"><h2>Simulador de Capacidade</h2></div>
        {error && <div className="notice error">{error}</div>}
        <form className="form-stack" onSubmit={simulate}>
          <Field label="Plano / unidade">
            <select value={form.plano_id} onChange={(e) => update('plano_id', e.target.value)} required>
              <option value="">Selecione</option>
              {planos.map((plano) => <option key={plano.id} value={plano.id}>{plano.id_local} - Total {plano.total_planejado}</option>)}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Volume atual"><input type="number" min="0" value={form.volume_previsto} onChange={(e) => update('volume_previsto', e.target.value)} required /></Field>
            <Field label="Produtividade atual"><input type="number" min="0.01" step="0.01" value={form.produtividade_media} onChange={(e) => update('produtividade_media', e.target.value)} required /></Field>
            <Field label="ABS atual %"><input type="number" min="0" step="0.01" value={form.abs_percentual} onChange={(e) => update('abs_percentual', e.target.value)} /></Field>
            <Field label="ABS simulado %"><input type="number" min="0" step="0.01" value={form.abs_simulado_percentual} onChange={(e) => update('abs_simulado_percentual', e.target.value)} /></Field>
            <Field label="Aumento de volume %"><input type="number" step="0.01" value={form.volume_variacao_percentual} onChange={(e) => update('volume_variacao_percentual', e.target.value)} /></Field>
            <Field label="Variacao produtividade %"><input type="number" step="0.01" value={form.produtividade_variacao_percentual} onChange={(e) => update('produtividade_variacao_percentual', e.target.value)} /></Field>
            <Field label="Pessoas PT adicionais"><input type="number" step="1" value={form.pt_adicional} onChange={(e) => update('pt_adicional', e.target.value)} /></Field>
            <Field label="Ciclos removidos"><input type="number" min="0" step="1" value={form.ciclos_removidos} onChange={(e) => update('ciclos_removidos', e.target.value)} /></Field>
          </div>
          <button className="primary-btn" disabled={loading}>
            <Play size={17} />
            {loading ? 'Simulando...' : 'Simular cenario'}
          </button>
        </form>
      </section>

      <section className="forecast-panel">
        <div className="panel-head"><h2>Comparacao</h2></div>
        {result ? (
          <div className="stack">
            <div className="forecast-sim-grid">
              <Scenario title="Cenario atual" data={result.atual} />
              <Scenario title="Cenario simulado" data={result.simulado} />
            </div>
            <div className="forecast-card-grid compact">
              <ForecastCard icon={Gauge} label="Diferenca capacidade" value={result.diferenca_capacidade} digits={1} />
              <ForecastCard icon={Gauge} label="Diferenca gap" value={result.diferenca_gap} digits={1} />
            </div>
            <div className="recommendation">{result.recomendacao}</div>
          </div>
        ) : (
          <div className="empty">Monte um cenario para comparar capacidade e gap.</div>
        )}
      </section>
    </div>
  );
}

function Scenario({ title, data }) {
  return (
    <article className="scenario-card">
      <div className="panel-head">
        <h3>{title}</h3>
        <RiskBadge status={data.status_risco} />
      </div>
      <p><span>Capacidade</span><strong>{formatNumber(data.capacidade_prevista, 1)}</strong></p>
      <p><span>Pessoas disponiveis</span><strong>{formatNumber(data.pessoas_disponiveis, 1)}</strong></p>
      <p><span>Necessidade</span><strong>{formatNumber(data.necessidade_pessoas, 1)}</strong></p>
      <p><span>Gap</span><strong>{formatNumber(data.gap, 1)}</strong></p>
    </article>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
