import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Boxes, Target, TrendingUp, Users, Warehouse } from 'lucide-react';
import ForecastCard from '../../components/forecast/ForecastCard.jsx';
import ForecastChart from '../../components/forecast/ForecastChart.jsx';
import ForecastFilters from '../../components/forecast/ForecastFilters.jsx';
import RiskBadge from '../../components/forecast/RiskBadge.jsx';
import ForecastTable from '../../components/forecast/ForecastTable.jsx';
import { forecastApi, formatNumber } from '../../services/forecastApi.js';

export default function ForecastDashboard() {
  const [filters, setFilters] = useState({});
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    forecastApi.dashboard(filters)
      .then((payload) => alive && setState({ loading: false, data: payload.data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: err.message }));
    return () => {
      alive = false;
    };
  }, [filters]);

  const data = state.data || { indicadores: {}, planos: [], por_unidade: [], ranking_risco: [], revisoes_por_semana: [] };
  const options = useMemo(() => buildFilterOptions(data.planos || []), [data.planos]);
  const indicadores = data.indicadores || {};

  if (state.loading) return <div className="empty">Carregando dashboard Forecast...</div>;

  return (
    <div className="stack forecast-page">
      {state.error && <div className="notice error">{state.error}</div>}
      <ForecastFilters filters={filters} onChange={setFilters} options={options} />

      <section className="forecast-card-grid">
        <ForecastCard icon={Users} label="QF Total" value={indicadores.total_qf} />
        <ForecastCard icon={Users} label="PT Total" value={indicadores.total_pt} />
        <ForecastCard icon={Boxes} label="Total Planejado" value={indicadores.total_planejado} />
        <ForecastCard icon={Warehouse} label="Pessoas Disponiveis" value={indicadores.total_pessoas_disponiveis} digits={1} />
        <ForecastCard icon={Activity} label="Capacidade Prevista" value={indicadores.capacidade_total_prevista} digits={1} />
        <ForecastCard icon={Target} label="Volume Previsto" value={indicadores.volume_total_previsto} digits={1} />
        <ForecastCard icon={BarChart3} label="Gap Total" value={indicadores.gap_total} digits={1} tone={Number(indicadores.gap_total) < 0 ? 'danger' : 'ok'} />
        <ForecastCard icon={AlertTriangle} label="Unidades em Risco" value={indicadores.unidades_em_risco} tone={indicadores.unidades_em_risco ? 'danger' : 'ok'} />
        <ForecastCard icon={TrendingUp} label="ABS Medio" value={indicadores.media_abs} digits={1} helper="%" />
        <ForecastCard icon={Activity} label="Produtividade Media" value={indicadores.media_produtividade} digits={1} />
      </section>

      <section className="forecast-chart-grid">
        <ForecastChart title="Total planejado por unidade" type="bar" data={data.por_unidade} yKey="total_planejado" />
        <ForecastChart title="Gap por unidade" type="gap" data={data.por_unidade} yKey="gap" />
        <ForecastChart title="Participacao no quadro" type="donut" data={data.por_unidade} yKey="total_planejado" />
        <ForecastChart title="Revisoes por semana" type="line" data={data.revisoes_por_semana} xKey="semana" yKey="total" />
        <ForecastChart title="Capacidade x volume previsto" type="comparison" data={data.por_unidade} yKey="capacidade_prevista" secondKey="volume_previsto" />
        <ForecastChart title="Ranking de maior risco" type="ranking" data={data.ranking_risco} yKey="gap" />
      </section>

      <section className="forecast-panel">
        <div className="panel-head"><h2>Resumo por unidade</h2></div>
        <ForecastTable
          rows={data.por_unidade}
          columns={[
            { key: 'id_local', label: 'Unidade' },
            { key: 'regional', label: 'Regional' },
            { key: 'total_planejado', label: 'Planejado', render: (row) => formatNumber(row.total_planejado) },
            { key: 'capacidade_prevista', label: 'Capacidade', render: (row) => formatNumber(row.capacidade_prevista, 1) },
            { key: 'volume_previsto', label: 'Volume', render: (row) => formatNumber(row.volume_previsto, 1) },
            { key: 'gap', label: 'Gap', render: (row) => formatNumber(row.gap, 1) },
            { key: 'status_risco', label: 'Risco', render: (row) => <RiskBadge status={row.status_risco} /> }
          ]}
        />
      </section>
    </div>
  );
}

function buildFilterOptions(planos) {
  const pick = (key) => [...new Set(planos.map((item) => item[key]).filter(Boolean))].sort();
  return {
    regionais: pick('regional'),
    unidades: pick('id_local'),
    tipos: pick('tipo'),
    semanas: pick('semana_operacional'),
    meses: pick('mes_referencia')
  };
}
