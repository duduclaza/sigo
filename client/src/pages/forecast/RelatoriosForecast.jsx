import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Printer } from 'lucide-react';
import ForecastTable from '../../components/forecast/ForecastTable.jsx';
import RiskBadge from '../../components/forecast/RiskBadge.jsx';
import { forecastApi, formatNumber } from '../../services/forecastApi.js';

export default function RelatoriosForecast() {
  const [state, setState] = useState({ loading: true, data: null, historico: [], error: '' });
  const report = useMemo(() => buildReport(state.data, state.historico), [state.data, state.historico]);

  useEffect(() => {
    Promise.all([forecastApi.dashboard(), forecastApi.historico()])
      .then(([dashboard, historico]) => setState({ loading: false, data: dashboard.data, historico: historico.data || [], error: '' }))
      .catch((err) => setState({ loading: false, data: null, historico: [], error: err.message }));
  }, []);

  function exportCsv() {
    const rows = state.data?.por_unidade || [];
    const header = ['Unidade', 'Regional', 'Planejado', 'Capacidade', 'Volume', 'Gap', 'Risco'];
    const csv = [header, ...rows.map((row) => [row.id_local, row.regional, row.total_planejado, row.capacidade_prevista, row.volume_previsto, row.gap, row.status_risco])]
      .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'forecast-relatorio.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (state.loading) return <div className="empty">Gerando relatorio Forecast...</div>;

  return (
    <div className="stack">
      {state.error && <div className="notice error">{state.error}</div>}
      <section className="forecast-panel report-panel">
        <div className="panel-head">
          <h2>Relatorio Forecast S&OP</h2>
          <div className="row-actions">
            <button className="tool-btn" onClick={() => window.print()}><Printer size={17} /> PDF</button>
            <button className="tool-btn" onClick={exportCsv}><Download size={17} /> Excel</button>
          </div>
        </div>
        <article className="report-text">
          <FileText size={24} />
          {report.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </article>
      </section>

      <section className="forecast-panel">
        <div className="panel-head"><h2>Unidades analisadas</h2></div>
        <ForecastTable
          rows={state.data?.por_unidade || []}
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

function buildReport(data, historico) {
  const indicadores = data?.indicadores || {};
  const units = data?.por_unidade || [];
  const risk = units.filter((unit) => unit.status_risco === 'Risco Alto');
  const surplus = units.filter((unit) => unit.status_risco === 'Sobra de Capacidade');
  const biggest = [...units].sort((a, b) => Number(b.total_planejado || 0) - Number(a.total_planejado || 0))[0];
  const worstGap = [...units].sort((a, b) => Number(a.gap || 0) - Number(b.gap || 0))[0];

  return [
    `Resumo executivo: o Forecast possui ${formatNumber(indicadores.total_planejado)} pessoas planejadas, sendo ${formatNumber(indicadores.total_qf)} QF e ${formatNumber(indicadores.total_pt)} PT. A capacidade prevista consolidada e de ${formatNumber(indicadores.capacidade_total_prevista, 1)} para um volume previsto de ${formatNumber(indicadores.volume_total_previsto, 1)}.`,
    biggest ? `A unidade ${biggest.id_local} concentra o maior quadro, com ${formatNumber(biggest.total_planejado)} pessoas planejadas.` : 'Ainda nao ha unidades com quadro planejado cadastrado.',
    risk.length ? `Unidades com risco: ${risk.map((unit) => `${unit.id_local} (gap ${formatNumber(unit.gap, 1)})`).join(', ')}.` : 'Nao ha unidades com gap negativo no cenario atual.',
    surplus.length ? `Unidades com sobra: ${surplus.slice(0, 5).map((unit) => `${unit.id_local} (gap ${formatNumber(unit.gap, 1)})`).join(', ')}.` : 'Nao ha sobra de capacidade registrada nas previsoes atuais.',
    worstGap ? `Maior gap operacional: ${worstGap.id_local}, com gap de ${formatNumber(worstGap.gap, 1)} pessoas.` : 'Sem gap operacional calculado.',
    `Impacto do ABS: a media atual de ABS prevista e ${formatNumber(indicadores.media_abs, 1)}%, reduzindo a disponibilidade real antes do calculo de capacidade.`,
    `Impacto da produtividade: a produtividade media consolidada e ${formatNumber(indicadores.media_produtividade, 1)} por pessoa. Quedas nesse indicador aumentam diretamente a necessidade de pessoas.`,
    historico.length ? `Historico de alteracao: existem ${historico.length} revisoes registradas, permitindo acompanhar mudancas de quadro, datas, PT e motivos.` : 'Historico de alteracao: ainda nao existem revisoes registradas.',
    risk.length ? 'Recomendacao de acao: priorizar reforco de quadro, revisao de produtividade ou redistribuicao de PT nas unidades em risco antes da data prevista de entrada.' : 'Recomendacao de acao: manter acompanhamento semanal e usar o simulador para testar aumentos de volume ou ABS.'
  ];
}
