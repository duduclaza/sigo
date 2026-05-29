import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { BarChart3, Calculator, ClipboardList, FileClock, FileSpreadsheet, LayoutDashboard, LogOut, PencilLine, UploadCloud } from 'lucide-react';
import ForecastDashboard from './ForecastDashboard.jsx';
import ImportarPlano from './ImportarPlano.jsx';
import CadastroPlano from './CadastroPlano.jsx';
import PrevisaoOperacional from './PrevisaoOperacional.jsx';
import SimuladorCapacidade from './SimuladorCapacidade.jsx';
import HistoricoRevisoes from './HistoricoRevisoes.jsx';
import RelatoriosForecast from './RelatoriosForecast.jsx';

const links = [
  ['/forecast/dashboard', 'Dashboard Forecast', LayoutDashboard],
  ['/forecast/importar', 'Importar Plano S&OP', UploadCloud],
  ['/forecast/cadastro', 'Cadastro Manual', PencilLine],
  ['/forecast/previsao', 'Previsao Operacional', ClipboardList],
  ['/forecast/simulador', 'Simulador de Capacidade', Calculator],
  ['/forecast/historico', 'Historico de Revisoes', FileClock],
  ['/forecast/relatorios', 'Relatorios', FileSpreadsheet]
];

export default function ForecastLayout({ user, onLogout }) {
  return (
    <main className="app-shell forecast-shell">
      <header className="main-header">
        <div className="main-header-inner">
          <NavLink className="header-brand" to="/dashboard">
            <span className="brand-mark small">S</span>
            <span>SIGO</span>
          </NavLink>
          <nav className="header-nav">
            <NavLink to="/dashboard"><BarChart3 size={16} /> Inicio</NavLink>
            {links.map(([to, label, Icon]) => (
              <NavLink key={to} to={to}>
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="header-actions">
            <div className="user-pill">
              {user?.foto_url ? <img src={user.foto_url} alt="" /> : <span>{user?.nome?.[0] || 'S'}</span>}
              <div>
                <strong>{user?.nome}</strong>
                <small>{user?.perfil_nome}</small>
              </div>
            </div>
            <button className="header-icon-btn" onClick={onLogout} title="Sair">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <section className="workspace">
        <div className="page-title">
          <div>
            <p className="eyebrow">Forecast S&OP</p>
            <h1>SIGO Forecast</h1>
            <span>Previsao operacional, capacidade, ABS, PT e gap por unidade</span>
          </div>
        </div>
        <section className="view-stage">
          <Routes>
            <Route path="/" element={<Navigate to="/forecast/dashboard" replace />} />
            <Route path="dashboard" element={<ForecastDashboard />} />
            <Route path="importar" element={<ImportarPlano />} />
            <Route path="cadastro" element={<CadastroPlano />} />
            <Route path="previsao" element={<PrevisaoOperacional />} />
            <Route path="simulador" element={<SimuladorCapacidade />} />
            <Route path="historico" element={<HistoricoRevisoes />} />
            <Route path="relatorios" element={<RelatoriosForecast />} />
            <Route path="*" element={<Navigate to="/forecast/dashboard" replace />} />
          </Routes>
        </section>
      </section>
    </main>
  );
}
