export default function ForecastTable({ rows = [], columns = [] }) {
  if (!rows.length) return <div className="empty">Nenhum registro encontrado.</div>;

  return (
    <div className="table-wrap forecast-table">
      <table>
        <thead>
          <tr>
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || `${row.id_local || 'row'}-${index}`}>
              {columns.map((column) => (
                <td key={column.key}>{column.render ? column.render(row, index) : row[column.key] ?? '-'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
