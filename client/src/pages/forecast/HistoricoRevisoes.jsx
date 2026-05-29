import { useEffect, useMemo, useState } from 'react';
import { formatDateTime } from '../../api.js';
import ForecastFilters from '../../components/forecast/ForecastFilters.jsx';
import ForecastTable from '../../components/forecast/ForecastTable.jsx';
import { forecastApi } from '../../services/forecastApi.js';

export default function HistoricoRevisoes() {
  const [filters, setFilters] = useState({});
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    forecastApi.historico({ id_local: filters.id_local, semana: filters.semana_operacional, mes: filters.mes_referencia })
      .then((payload) => setRows(payload.data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters]);

  const options = useMemo(() => ({
    unidades: [...new Set(rows.map((item) => item.plano?.id_local).filter(Boolean))].sort(),
    semanas: [...new Set(rows.map((item) => item.plano?.semana_operacional).filter(Boolean))].sort(),
    meses: [...new Set(rows.map((item) => item.plano?.mes_referencia).filter(Boolean))].sort()
  }), [rows]);

  return (
    <section className="forecast-panel">
      <div className="panel-head"><h2>Historico de Revisoes</h2></div>
      {error && <div className="notice error">{error}</div>}
      <ForecastFilters filters={filters} onChange={setFilters} options={options} showRisk={false} />
      {loading ? <div className="empty">Carregando historico...</div> : (
        <ForecastTable
          rows={rows}
          columns={[
            { key: 'created_at', label: 'Data da revisao', render: (row) => formatDateTime(row.created_at) },
            { key: 'id_local', label: 'Unidade', render: (row) => row.plano?.id_local || '-' },
            { key: 'campo_alterado', label: 'Campo alterado' },
            { key: 'valor_anterior', label: 'Valor anterior' },
            { key: 'valor_novo', label: 'Valor novo' },
            { key: 'motivo', label: 'Motivo' },
            { key: 'alterado_por', label: 'Usuario responsavel', render: (row) => row.alterado_por || '-' }
          ]}
        />
      )}
    </section>
  );
}
