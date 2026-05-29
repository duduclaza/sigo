import { useState } from 'react';
import { CalendarClock, Save } from 'lucide-react';
import { forecastApi } from '../../services/forecastApi.js';

const empty = {
  regional: '',
  id_local: '',
  terceiro: '',
  tipo: '',
  qf: '',
  pt: '',
  observacao: '',
  semana_operacional: '',
  mes_referencia: '',
  data_formalizacao: '',
  data_entrada_prevista: '',
  motivo_revisao: '',
  calcular_entrada: true,
  semanas_entrada: 2
};

export default function CadastroPlano() {
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const total = Number(form.qf || 0) + Number(form.pt || 0);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const payload = await forecastApi.createPlano(form);
      setMessage(payload.message);
      setForm(empty);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="forecast-panel">
      <div className="panel-head">
        <h2>Cadastro Manual</h2>
        <span className="metric-chip">Total planejado: {total}</span>
      </div>
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}
      <form className="form-grid forecast-form" onSubmit={submit}>
        <Field label="Regional"><input value={form.regional} onChange={(e) => update('regional', e.target.value.toUpperCase())} required /></Field>
        <Field label="ID Local"><input value={form.id_local} onChange={(e) => update('id_local', e.target.value.toUpperCase())} required /></Field>
        <Field label="Terceiro"><input value={form.terceiro} onChange={(e) => update('terceiro', e.target.value)} required /></Field>
        <Field label="Tipo"><input value={form.tipo} onChange={(e) => update('tipo', e.target.value.toUpperCase())} required /></Field>
        <Field label="QF"><input type="number" min="0" value={form.qf} onChange={(e) => update('qf', e.target.value)} required /></Field>
        <Field label="PT"><input type="number" min="0" value={form.pt} onChange={(e) => update('pt', e.target.value)} required /></Field>
        <Field label="Semana operacional"><input value={form.semana_operacional} onChange={(e) => update('semana_operacional', e.target.value)} placeholder="W23" /></Field>
        <Field label="Mes referencia"><input type="month" value={form.mes_referencia} onChange={(e) => update('mes_referencia', e.target.value)} /></Field>
        <Field label="Data de formalizacao"><input type="date" value={form.data_formalizacao} onChange={(e) => update('data_formalizacao', e.target.value)} /></Field>
        <Field label="Data de entrada prevista"><input type="date" value={form.data_entrada_prevista} onChange={(e) => update('data_entrada_prevista', e.target.value)} /></Field>
        <label className="check-line">
          <input type="checkbox" checked={Boolean(form.calcular_entrada)} onChange={(e) => update('calcular_entrada', e.target.checked)} />
          Calcular entrada automaticamente
        </label>
        <Field label="Semanas para entrada">
          <div className="input-icon">
            <CalendarClock size={17} />
            <input type="number" min="1" value={form.semanas_entrada} onChange={(e) => update('semanas_entrada', e.target.value)} />
          </div>
        </Field>
        <Field label="Observacao"><textarea value={form.observacao} onChange={(e) => update('observacao', e.target.value)} /></Field>
        <Field label="Motivo da revisao"><textarea value={form.motivo_revisao} onChange={(e) => update('motivo_revisao', e.target.value)} /></Field>
        <button className="primary-btn" disabled={loading}>
          <Save size={17} />
          {loading ? 'Salvando...' : 'Salvar plano'}
        </button>
      </form>
    </section>
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
