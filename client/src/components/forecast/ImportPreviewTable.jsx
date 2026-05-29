import ForecastTable from './ForecastTable.jsx';

export default function ImportPreviewTable({ rows = [], errors = [] }) {
  return (
    <div className="stack">
      {!!errors.length && (
        <div className="notice error">
          {errors.join(' ')}
        </div>
      )}
      <ForecastTable
        rows={rows}
        columns={[
          { key: 'REGIONAL', label: 'Regional' },
          { key: 'ID_LOCAL', label: 'ID Local' },
          { key: 'TERCEIRO', label: 'Terceiro' },
          { key: 'TIPO', label: 'Tipo' },
          { key: 'QF', label: 'QF' },
          { key: 'PT', label: 'PT' },
          { key: 'TOTAL', label: 'Total', render: (row) => Number(row.QF || 0) + Number(row.PT || 0) },
          { key: 'OBS', label: 'Obs' }
        ]}
      />
    </div>
  );
}
