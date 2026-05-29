import { useEffect, useMemo, useState } from 'react';
import { Calculator, Save } from 'lucide-react';
import ForecastCard from '../../components/forecast/ForecastCard.jsx';
import RiskBadge from '../../components/forecast/RiskBadge.jsx';
import { calculateLocalForecast, forecastApi, formatNumber, riskClass } from '../../services/forecastApi.js';

const empty = {
  plano_id: '',
  volume_previsto: '',
  produtividade_media: '',
  abs_percentual: '',
  abs_pessoas: '',
  turnover_percentual: '',
  dias_operacao: '',
  ciclos_ativos: '',
  observacao: ''
};

export default function PrevisaoOperacional() {
  const [planos, setPlanos] = useState([]);
  const [form, setForm] = useState(empty);
  const [saved, setSaved] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const selected = planos.find((plano) => plano.id === form.plano_id);
  const result = useMemo(() => {
    if (!selected) return null;
    return calculateLocalForecast({ ...form, total_planejado: selected.total_planejado });
  }, [form, selected]);

  useEffect(() => {
    forecastApi.listPlanos()
      .then((payload) => setPlanos(payload.data || []))
      .catch((err) => setError(err.message));
  }, []);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const payload = await forecastApi.previsao(form);
      setSaved(payload.previsao);
      setMessage(payload.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="forecast-two-col">
      <section className="forecast-panel">
        <div className="panel-head"><h2>Previsao Operacional</h2></div>
        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice error">{error}</div>}
        <form className="form-stack" onSubmit={submit}>
          <Field label="Plano / unidade">
            <select value={form.plano_id} onChange={(e) => update('plano_id', e.target.value)} required>
              <option value="">Selecione</option>
              {planos.map((plano) => (
                <option key={plano.id} value={plano.id}>{plano.id_local} - {plano.regional} - Total {plano.total_planejado}</option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Volume previsto"><input type="number" min="0" value={form.volume_previsto} onChange={(e) => update('volume_previsto', e.target.value)} required /></Field>
            <Field label="Produtividade media"><input type="number" min="0.01" step="0.01" value={form.produtividade_media} onChange={(e) => update('produtividade_media', e.target.value)} required /></Field>
            <Field label="ABS percentual"><input type="number" min="0" step="0.01" value={form.abs_percentual} onChange={(e) => update('abs_percentual', e.target.value)} /></Field>
            <Field label="ABS em pessoas"><input type="number" min="0" step="0.01" value={form.abs_pessoas} onChange={(e) => update('abs_pessoas', e.target.value)} /></Field>
            <Field label="Turnover percentual"><input type="number" min="0" step="0.01" value={form.turnover_percentual} onChange={(e) => update('turnover_percentual', e.target.value)} /></Field>
            <Field label="Dias de operacao"><input type="number" min="0" value={form.dias_operacao} onChange={(e) => update('dias_operacao', e.target.value)} /></Field>
            <Field label="Ciclos ativos"><input type="number" min="0" value={form.ciclos_ativos} onChange={(e) => update('ciclos_ativos', e.target.value)} /></Field>
          </div>
          <Field label="Observacoes"><textarea value={form.observacao} onChange={(e) => update('observacao', e.target.value)} /></Field>
          <button className="primary-btn" disabled={loading || !result}>
            <Save size={17} />
            {loading ? 'Salvando...' : 'Salvar previsao'}
          </button>
        </form>
      </section>

      <section className={`forecast-result ${riskClass(result?.status_risco)}`}>
        <div className="panel-head">
          <h2>Resultado</h2>
          <RiskBadge status={result?.status_risco} />
        </div>
        {selected ? (
          <>
            <ForecastCard icon={Calculator} label="Total planejado" value={selected.total_planejado} />
            <div className="forecast-result-grid">
              <Result label="Pessoas disponiveis" value={result.pessoas_disponiveis} />
              <Result label="Capacidade prevista" value={result.capacidade_prevista} />
              <Result label="Necessidade de pessoas" value={result.necessidade_pessoas} />
              <Result label="Gap operacional" value={result.gap} />
            </div>
            {saved && <p className="muted-text">Ultima previsao salva: gap {formatNumber(saved.gap, 1)}.</p>}
          </>
        ) : (
          <div className="empty">Selecione um plano para calcular.</div>
        )}
      </section>
    </div>
  );
}

function Result({ label, value }) {
  return (
    <div className="result-tile">
      <span>{label}</span>
      <strong>{formatNumber(value, 1)}</strong>
    </div>
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
