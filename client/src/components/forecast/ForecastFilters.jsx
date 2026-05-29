import { Search, X } from 'lucide-react';

const riskOptions = ['Risco Alto', 'Equilibrado', 'Sobra de Capacidade'];

export default function ForecastFilters({ filters, onChange, options = {}, showRisk = true }) {
  function update(key, value) {
    onChange({ ...filters, [key]: value });
  }

  function clear() {
    onChange({});
  }

  return (
    <div className="forecast-filters">
      <div className="filter-title">
        <Search size={17} />
        <strong>Filtros</strong>
      </div>
      <select value={filters.regional || ''} onChange={(e) => update('regional', e.target.value)}>
        <option value="">Regional</option>
        {(options.regionais || []).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <select value={filters.id_local || ''} onChange={(e) => update('id_local', e.target.value)}>
        <option value="">Unidade</option>
        {(options.unidades || []).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <select value={filters.tipo || ''} onChange={(e) => update('tipo', e.target.value)}>
        <option value="">Tipo</option>
        {(options.tipos || []).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <select value={filters.semana_operacional || ''} onChange={(e) => update('semana_operacional', e.target.value)}>
        <option value="">Semana</option>
        {(options.semanas || []).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <select value={filters.mes_referencia || ''} onChange={(e) => update('mes_referencia', e.target.value)}>
        <option value="">Mes</option>
        {(options.meses || []).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      {showRisk && (
        <select value={filters.status_risco || ''} onChange={(e) => update('status_risco', e.target.value)}>
          <option value="">Risco</option>
          {riskOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      )}
      <button type="button" className="tool-btn" onClick={clear}>
        <X size={16} />
        Limpar
      </button>
    </div>
  );
}
