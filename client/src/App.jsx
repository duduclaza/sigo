import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  Camera,
  Car,
  ChevronDown,
  CheckCircle2,
  Clock3,
  DoorOpen,
  FileText,
  History,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Lock,
  LogOut,
  Mail,
  Monitor,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  Truck,
  Upload,
  UserPlus,
  UserRound,
  Users,
  Warehouse,
  X
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { api, clearSession, formatDate, formatDateTime, getStoredUser, getToken, setSession } from './api.js';
import ForecastLayout from './pages/forecast/ForecastLayout.jsx';

const AuthContext = createContext(null);

function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser());
  const token = getToken();

  async function login(email, senha) {
    const payload = await api('/api/auth/login', { method: 'POST', body: { email, senha } });
    setSession(payload.token, payload.user);
    setUser(payload.user);
    return payload;
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // Sessao local ainda deve ser limpa.
    }
    clearSession();
    setUser(null);
  }

  function hasPermission(chave) {
    return Number(user?.perfil_id) === 1 || user?.permissions?.includes(chave);
  }

  const value = useMemo(() => ({ user, token, login, logout, hasPermission }), [user, token]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function RequireAuth({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function Spinner({ label = 'Carregando...' }) {
  return (
    <div className="empty">
      <RefreshCw className="spin" size={18} />
      {label}
    </div>
  );
}

function Notice({ type = 'info', children }) {
  if (!children) return null;
  return <div className={`notice ${type}`}>{children}</div>;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
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

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get('action') === 'reset' ? 'reset' : 'login');
  const [options, setOptions] = useState({ perfis: [], transportadoras: [] });
  const [form, setForm] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api('/api/public/access-options')
      .then((payload) => setOptions(payload))
      .catch(() => setOptions({ perfis: [], transportadoras: [] }));
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
      if (mode === 'login') {
        await login(form.email, form.senha);
        navigate('/dashboard');
      } else if (mode === 'recover') {
        const payload = await api('/api/auth/recuperar', { method: 'POST', body: { email: form.email } });
        setMessage(payload.message);
      } else if (mode === 'reset') {
        const payload = await api('/api/auth/redefinir', {
          method: 'POST',
          body: {
            token: searchParams.get('token'),
            senha: form.senha,
            confirmar_senha: form.confirmar_senha
          }
        });
        setMessage(payload.message);
        setMode('login');
      } else {
        const payload = await api('/api/auth/solicitar-acesso', {
          method: 'POST',
          body: {
            nome: form.nome,
            email: form.email,
            senha: form.senha,
            confirmar_senha: form.confirmar_senha,
            perfil_id: form.perfil_id,
            is_despachante: form.is_despachante,
            transportadora_id: form.transportadora_id,
            justificativa: form.justificativa
          }
        });
        setMessage(payload.message);
        setMode('login');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-visual">
        <div className="brand-mark">S</div>
        <div>
          <p className="eyebrow">SIGO</p>
          <h1>Operacao, docas e romaneios em tempo real.</h1>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-box">
          <div className="login-title">
            <div className="brand-mark small">S</div>
            <div>
              <h2>{mode === 'reset' ? 'Nova Senha' : mode === 'request' ? 'Solicitar Acesso' : 'Acesse o SIGO'}</h2>
              <p>{mode === 'recover' ? 'Recuperacao de credencial' : 'Sistema de Gerenciamento Operacional'}</p>
            </div>
          </div>

          <Notice type="success">{message}</Notice>
          <Notice type="error">{error}</Notice>

          <form className="form-stack" onSubmit={submit}>
            {mode === 'request' && (
              <Field label="Nome">
                <input value={form.nome || ''} onChange={(e) => update('nome', e.target.value)} required />
              </Field>
            )}

            {mode !== 'reset' && (
              <Field label="E-mail">
                <div className="input-icon">
                  <Mail size={17} />
                  <input type="email" value={form.email || ''} onChange={(e) => update('email', e.target.value)} required />
                </div>
              </Field>
            )}

            {mode !== 'recover' && (
              <Field label={mode === 'reset' ? 'Nova senha' : 'Senha'}>
                <div className="input-icon">
                  <Lock size={17} />
                  <input type="password" value={form.senha || ''} onChange={(e) => update('senha', e.target.value)} required />
                </div>
              </Field>
            )}

            {(mode === 'request' || mode === 'reset') && (
              <Field label="Confirmar senha">
                <input type="password" value={form.confirmar_senha || ''} onChange={(e) => update('confirmar_senha', e.target.value)} required />
              </Field>
            )}

            {mode === 'request' && (
              <>
                <Field label="Perfil">
                  <select value={form.perfil_id || ''} onChange={(e) => update('perfil_id', e.target.value)} required>
                    <option value="">Selecione</option>
                    {options.perfis.map((perfil) => (
                      <option key={perfil.id} value={perfil.id}>{perfil.nome}</option>
                    ))}
                  </select>
                </Field>
                <label className="check-line">
                  <input type="checkbox" checked={Boolean(form.is_despachante)} onChange={(e) => update('is_despachante', e.target.checked)} />
                  Despachante vinculado a transportadora
                </label>
                {form.is_despachante && (
                  <Field label="Transportadora">
                    <select value={form.transportadora_id || ''} onChange={(e) => update('transportadora_id', e.target.value)} required>
                      <option value="">Selecione</option>
                      {options.transportadoras.map((transportadora) => (
                        <option key={transportadora.id} value={transportadora.id}>{transportadora.nome_fantasia}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Justificativa">
                  <textarea rows="3" value={form.justificativa || ''} onChange={(e) => update('justificativa', e.target.value)} required />
                </Field>
              </>
            )}

            <button className="primary-btn" disabled={loading}>
              {loading ? <RefreshCw className="spin" size={18} /> : mode === 'request' ? <UserPlus size={18} /> : <KeyRound size={18} />}
              {mode === 'login' ? 'Entrar' : mode === 'recover' ? 'Enviar recuperacao' : mode === 'reset' ? 'Salvar nova senha' : 'Enviar solicitacao'}
            </button>
          </form>

          <div className="login-actions">
            {mode !== 'login' && <button onClick={() => setMode('login')}>Voltar ao login</button>}
            {mode === 'login' && <button onClick={() => setMode('recover')}>Esqueci a senha</button>}
            {mode === 'login' && <button onClick={() => setMode('request')}>Solicitar acesso</button>}
          </div>
        </div>
      </section>
    </main>
  );
}

function DashboardPage() {
  const { user, logout, hasPermission } = useAuth();
  const [view, setView] = useState('inicio');

  const hasExpedicao = hasPermission('acesso_romaneios') || hasPermission('acesso_expedicao') || hasPermission('acesso_checkin') || hasPermission('acesso_monitor_docas') || hasPermission('acesso_app_motorista');
  const canAdmin = hasPermission('cadastrar_usuarios') || hasPermission('cadastrar_perfis') || hasPermission('cadastrar_transportadoras');
  const titles = {
    inicio: 'Centro operacional',
    romaneios: 'Romaneios',
    admin: 'Administracao',
    conta: 'Minha conta'
  };

  return (
    <main className="app-shell">
      <header className="main-header">
        <div className="main-header-inner">
          <button className="header-brand" onClick={() => setView('inicio')}>
            <span className="brand-mark small">S</span>
            <span>SIGO</span>
          </button>

          <nav className="header-nav">
            <button className={view === 'inicio' ? 'active' : ''} onClick={() => setView('inicio')}>
              <LayoutDashboard size={16} />
              Inicio
            </button>

            <div className="nav-dropdown">
              <button type="button">
                <BarChart3 size={16} />
                Indicadores
                <ChevronDown size={14} />
              </button>
              <div className="nav-menu">
                <button type="button"><LayoutDashboard size={16} /> Dashboards</button>
                <button type="button"><Users size={16} /> Absenteismo</button>
                <button type="button"><Clock3 size={16} /> Horas Extras</button>
                <button type="button"><ShieldCheck size={16} /> Qualidade</button>
              </div>
            </div>

            {hasExpedicao && (
              <div className="nav-dropdown">
                <button className={view === 'romaneios' ? 'active' : ''}>
                  <Truck size={16} />
                  Expedicao
                  <ChevronDown size={14} />
                </button>
                <div className="nav-menu">
                  {(hasPermission('acesso_romaneios') || hasPermission('acesso_expedicao')) && (
                    <button onClick={() => setView('romaneios')}><FileText size={16} /> Romaneios</button>
                  )}
                  <Link to="/painel" target="_blank"><Monitor size={16} /> Monitor de Docas</Link>
                  <Link to="/motorista" target="_blank"><Smartphone size={16} /> App do Motorista</Link>
                  <Link to="/checkin" target="_blank"><DoorOpen size={16} /> Porteiro Check-in</Link>
                </div>
              </div>
            )}

            <div className="nav-dropdown">
              <button type="button">
                <LayoutDashboard size={16} />
                Forecast S&OP
                <ChevronDown size={14} />
              </button>
              <div className="nav-menu">
                <Link to="/forecast/dashboard"><LayoutDashboard size={16} /> Dashboard Forecast</Link>
                <Link to="/forecast/importar"><Upload size={16} /> Importar Plano S&OP</Link>
                <Link to="/forecast/cadastro"><Pencil size={16} /> Cadastro Manual</Link>
                <Link to="/forecast/previsao"><ListChecks size={16} /> Previsao Operacional</Link>
                <Link to="/forecast/simulador"><RefreshCw size={16} /> Simulador de Capacidade</Link>
                <Link to="/forecast/historico"><History size={16} /> Historico de Revisoes</Link>
                <Link to="/forecast/relatorios"><FileText size={16} /> Relatorios</Link>
              </div>
            </div>

            {canAdmin && (
              <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>
                <Settings size={16} />
                Configuracoes
              </button>
            )}
          </nav>

          <div className="header-actions">
            <button className={view === 'conta' ? 'user-pill active' : 'user-pill'} onClick={() => setView('conta')}>
              {user?.foto_url ? <img src={user.foto_url} alt="" /> : <span>{user?.nome?.[0] || 'S'}</span>}
              <div>
                <strong>{user?.nome}</strong>
                <small>{user?.perfil_nome}</small>
              </div>
            </button>
            <button className="header-icon-btn" onClick={logout} title="Sair">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <section className="workspace">
        <div className="page-title">
          <div>
            <p className="eyebrow">{user?.perfil_nome}</p>
            <h1>{titles[view] || 'SIGO'}</h1>
            <span>{user?.email}</span>
          </div>
        </div>

        <section className="view-stage">
          {view === 'inicio' && <HomeView />}
          {view === 'romaneios' && <RomaneiosView />}
          {view === 'admin' && <AdminView />}
          {view === 'conta' && <AccountView />}
        </section>
      </section>
    </main>
  );
}

function HomeView() {
  const { hasPermission } = useAuth();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      api('/api/romaneios?tipo=ativos'),
      api('/api/docas/status'),
      hasPermission('cadastrar_usuarios') ? api('/api/solicitacoes') : Promise.resolve({ data: [] })
    ])
      .then(([romaneios, docas, solicitacoes]) => {
        if (!alive) return;
        const firstError = [romaneios, docas, solicitacoes].find((result) => result.status === 'rejected')?.reason;
        setState({
          loading: false,
          error: firstError?.message || '',
          romaneios: romaneios.status === 'fulfilled' ? romaneios.value.data || [] : [],
          docas: docas.status === 'fulfilled' ? docas.value.data || [] : [],
          solicitacoes: solicitacoes.status === 'fulfilled' ? solicitacoes.value.data || [] : []
        });
      });
    return () => {
      alive = false;
    };
  }, [hasPermission]);

  if (state.loading) return <Spinner />;

  const docasOcupadas = state.docas.filter((doca) => doca.op_id).length;
  const atrasos = state.docas.filter((doca) => doca.min_carregando > 90 || doca.min_no_cd > 180).length;

  return (
    <div className="grid-page">
      {state.error && (
        <div className="home-warning">
          <Notice type="error">{state.error}</Notice>
        </div>
      )}
      <div className="metric-card">
        <FileText />
        <span>Romaneios hoje</span>
        <strong>{state.romaneios.length}</strong>
      </div>
      <div className="metric-card">
        <Warehouse />
        <span>Docas ocupadas</span>
        <strong>{docasOcupadas}/{state.docas.length}</strong>
      </div>
      <div className="metric-card">
        <AlertTriangle />
        <span>Atrasos operacionais</span>
        <strong>{atrasos}</strong>
      </div>
      <div className="metric-card">
        <Bell />
        <span>Solicitacoes pendentes</span>
        <strong>{state.solicitacoes.length}</strong>
      </div>

      <section className="wide-panel">
        <div className="panel-head">
          <h2>Docas agora</h2>
          <Link className="ghost-link" to="/painel" target="_blank">Abrir monitor</Link>
        </div>
        <div className="dock-strip">
          {state.docas.map((doca) => (
            <div key={doca.doca_id} className={`dock-mini ${doca.status || 'livre'}`}>
              <strong>{doca.doca_nome}</strong>
              <span>{doca.placa || 'Livre'}</span>
              <small>{doca.status ? `${doca.status.replaceAll('_', ' ')} ${doca.min_carregando ? `${doca.min_carregando} min` : ''}` : 'Sem operacao ativa'}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function RomaneiosView() {
  const [tipo, setTipo] = useState('ativos');
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const payload = tipo === 'auditoria' ? await api('/api/romaneios/auditoria') : await api(`/api/romaneios?tipo=${tipo}`);
      setRows(payload.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [tipo]);

  const filtered = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));

  async function uploadCsv(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('csv_file', file);
    setMessage('');
    setError('');
    try {
      const payload = await api('/api/romaneios/upload', { method: 'POST', body: formData });
      setMessage(payload.message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      event.target.value = '';
    }
  }

  async function deleteSelected() {
    if (!selected.length || !confirm(`Excluir ${selected.length} romaneio(s)?`)) return;
    try {
      const payload = await api('/api/romaneios', { method: 'DELETE', body: { ids: selected } });
      setMessage(payload.message);
      setSelected([]);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="segmented">
          <button className={tipo === 'ativos' ? 'active' : ''} onClick={() => setTipo('ativos')}>Ativos</button>
          <button className={tipo === 'historico' ? 'active' : ''} onClick={() => setTipo('historico')}>Historico</button>
          <button className={tipo === 'auditoria' ? 'active' : ''} onClick={() => setTipo('auditoria')}>Auditoria</button>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" />
        </div>
        {tipo !== 'auditoria' && (
          <label className="tool-btn">
            <Upload size={17} />
            CSV
            <input type="file" accept=".csv,text/csv" hidden onChange={uploadCsv} />
          </label>
        )}
        {!!selected.length && (
          <button className="danger-btn" onClick={deleteSelected}>
            <Trash2 size={17} />
            {selected.length}
          </button>
        )}
      </div>

      <Notice type="success">{message}</Notice>
      <Notice type="error">{error}</Notice>

      {loading ? <Spinner /> : tipo === 'auditoria' ? (
        <DataTable
          rows={filtered}
          columns={[
            ['created_at', 'Data', (row) => formatDateTime(row.created_at)],
            ['usuario_nome', 'Usuario'],
            ['campo_alterado', 'Campo'],
            ['valor_anterior', 'Anterior'],
            ['valor_novo', 'Novo'],
            ['fora_do_horario', 'Fora horario', (row) => row.fora_do_horario ? 'Sim' : 'Nao']
          ]}
        />
      ) : (
        <DataTable
          rows={filtered}
          selectable
          selected={selected}
          onSelect={setSelected}
          columns={[
            ['data_romaneio', 'Data', (row) => formatDate(row.data_romaneio)],
            ['transportadora_nome', 'Transportadora'],
            ['onda', 'Onda'],
            ['vaga', 'Vaga'],
            ['gaiola', 'Gaiola'],
            ['regiao', 'Regiao'],
            ['veiculo', 'Veiculo'],
            ['placa', 'Placa'],
            ['rota', 'Rota'],
            ['paradas', 'Paradas'],
            ['actions', '', (row) => <button className="icon-btn" onClick={() => setEditing(row)} title="Editar"><Pencil size={17} /></button>]
          ]}
        />
      )}

      {editing && <EditRomaneioModal row={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function EditRomaneioModal({ row, onClose, onSaved }) {
  const [form, setForm] = useState({ ...row });
  const [transportadoras, setTransportadoras] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/transportadoras').then((payload) => setTransportadoras(payload.data || [])).catch(() => setTransportadoras([]));
  }, []);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await api(`/api/romaneios/${row.id}/geral`, { method: 'PUT', body: form });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="Editar romaneio" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <Notice type="error">{error}</Notice>
        {['onda', 'vaga', 'gaiola', 'regiao', 'veiculo', 'placa', 'rota', 'paradas'].map((field) => (
          <Field key={field} label={field.replace('_', ' ')}>
            <input value={form[field] || ''} onChange={(e) => update(field, e.target.value)} />
          </Field>
        ))}
        <Field label="Bairros / Devolucao">
          <textarea value={form.bairros_devolucao || ''} onChange={(e) => update('bairros_devolucao', e.target.value)} />
        </Field>
        <Field label="Transportadora">
          <select value={form.transportadora_id || ''} onChange={(e) => update('transportadora_id', e.target.value)}>
            {transportadoras.map((transportadora) => (
              <option key={transportadora.id} value={transportadora.id}>{transportadora.nome_fantasia}</option>
            ))}
          </select>
        </Field>
        <button className="primary-btn"><Save size={17} /> Salvar</button>
      </form>
    </Modal>
  );
}

function DataTable({ rows, columns, selectable = false, selected = [], onSelect }) {
  if (!rows.length) return <div className="empty">Nenhum registro encontrado.</div>;

  function toggle(id) {
    onSelect?.(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {selectable && <th className="tight"></th>}
            {columns.map(([, label]) => <th key={label}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {selectable && (
                <td className="tight">
                  <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} />
                </td>
              )}
              {columns.map(([key, , render]) => (
                <td key={key}>{render ? render(row) : row[key] || '-'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminView() {
  const [tab, setTab] = useState('usuarios');
  const tabs = [
    ['usuarios', 'Usuarios', Users],
    ['perfis', 'Perfis', ShieldCheck],
    ['transportadoras', 'Transportadoras', Truck],
    ['solicitacoes', 'Solicitacoes', Bell],
    ['config', 'Config', Settings],
    ['logs', 'Logs', History]
  ];

  return (
    <div className="stack">
      <div className="segmented wrap">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      {tab === 'usuarios' && <UsuariosManager />}
      {tab === 'perfis' && <PerfisManager />}
      {tab === 'transportadoras' && <TransportadorasManager />}
      {tab === 'solicitacoes' && <SolicitacoesManager />}
      {tab === 'config' && <ConfigManager />}
      {tab === 'logs' && <LogsManager />}
    </div>
  );
}

function UsuariosManager() {
  const empty = { nome: '', email: '', senha: '', perfil_id: '', ativo: true, is_despachante: false, transportadora_id: '' };
  const [rows, setRows] = useState([]);
  const [perfis, setPerfis] = useState([]);
  const [transportadoras, setTransportadoras] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');

  async function load() {
    const [usuarios, perfisPayload, transPayload] = await Promise.all([
      api('/api/usuarios'),
      api('/api/perfis'),
      api('/api/transportadoras')
    ]);
    setRows(usuarios.data || []);
    setPerfis(perfisPayload.data || []);
    setTransportadoras(transPayload.data || []);
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      if (form.id) {
        await api(`/api/usuarios/${form.id}`, { method: 'PUT', body: form });
      } else {
        await api('/api/usuarios', { method: 'POST', body: form });
      }
      setForm(empty);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Excluir usuario?')) return;
    try {
      await api(`/api/usuarios/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <ManagerLayout
      error={error}
      form={(
        <form className="form-stack" onSubmit={submit}>
          <Field label="Nome"><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></Field>
          <Field label="E-mail"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <Field label="Senha"><input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required={!form.id} /></Field>
          <Field label="Perfil">
            <select value={form.perfil_id} onChange={(e) => setForm({ ...form, perfil_id: e.target.value })} required>
              <option value="">Selecione</option>
              {perfis.map((perfil) => <option key={perfil.id} value={perfil.id}>{perfil.nome}</option>)}
            </select>
          </Field>
          <label className="check-line"><input type="checkbox" checked={Boolean(form.ativo)} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo</label>
          <label className="check-line"><input type="checkbox" checked={Boolean(form.is_despachante)} onChange={(e) => setForm({ ...form, is_despachante: e.target.checked })} /> Despachante</label>
          <Field label="Transportadora">
            <select value={form.transportadora_id || ''} onChange={(e) => setForm({ ...form, transportadora_id: e.target.value })}>
              <option value="">Nenhuma</option>
              {transportadoras.map((transportadora) => <option key={transportadora.id} value={transportadora.id}>{transportadora.nome_fantasia}</option>)}
            </select>
          </Field>
          <button className="primary-btn">{form.id ? <Save size={17} /> : <Plus size={17} />} {form.id ? 'Salvar' : 'Criar'}</button>
          {form.id && <button type="button" className="ghost-btn" onClick={() => setForm(empty)}>Cancelar</button>}
        </form>
      )}
    >
      <DataTable
        rows={rows}
        columns={[
          ['nome', 'Nome'],
          ['email', 'E-mail'],
          ['perfil_nome', 'Perfil'],
          ['transportadora_nome', 'Transportadora'],
          ['ativo', 'Ativo', (row) => row.ativo ? 'Sim' : 'Nao'],
          ['actions', '', (row) => (
            <div className="row-actions">
              <button className="icon-btn" onClick={() => setForm({ ...row, senha: '' })} title="Editar"><Pencil size={16} /></button>
              <button className="icon-btn danger" onClick={() => remove(row.id)} title="Excluir"><Trash2 size={16} /></button>
            </div>
          )]
        ]}
      />
    </ManagerLayout>
  );
}

function PerfisManager() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ nome: '', descricao: '' });
  const [permissioning, setPermissioning] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const payload = await api('/api/perfis');
    setRows(payload.data || []);
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      if (form.id) await api(`/api/perfis/${form.id}`, { method: 'PUT', body: form });
      else await api('/api/perfis', { method: 'POST', body: form });
      setForm({ nome: '', descricao: '' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Excluir perfil?')) return;
    try {
      await api(`/api/perfis/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <ManagerLayout
      error={error}
      form={(
        <form className="form-stack" onSubmit={submit}>
          <Field label="Nome"><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></Field>
          <Field label="Descricao"><textarea value={form.descricao || ''} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Field>
          <button className="primary-btn">{form.id ? <Save size={17} /> : <Plus size={17} />} {form.id ? 'Salvar' : 'Criar'}</button>
          {form.id && <button type="button" className="ghost-btn" onClick={() => setForm({ nome: '', descricao: '' })}>Cancelar</button>}
        </form>
      )}
    >
      <DataTable
        rows={rows}
        columns={[
          ['nome', 'Perfil'],
          ['descricao', 'Descricao'],
          ['actions', '', (row) => (
            <div className="row-actions">
              <button className="icon-btn" onClick={() => setPermissioning(row)} title="Permissoes"><ListChecks size={16} /></button>
              <button className="icon-btn" onClick={() => setForm(row)} title="Editar"><Pencil size={16} /></button>
              <button className="icon-btn danger" onClick={() => remove(row.id)} title="Excluir"><Trash2 size={16} /></button>
            </div>
          )]
        ]}
      />
      {permissioning && <PermissoesModal perfil={permissioning} onClose={() => setPermissioning(null)} />}
    </ManagerLayout>
  );
}

function PermissoesModal({ perfil, onClose }) {
  const [state, setState] = useState({ loading: true, todas: [], ativas: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/perfis/${perfil.id}/permissoes`)
      .then((payload) => setState({ loading: false, todas: payload.todas || [], ativas: payload.ativas || [] }))
      .catch((err) => setError(err.message));
  }, [perfil.id]);

  async function save() {
    try {
      await api(`/api/perfis/${perfil.id}/permissoes`, { method: 'PUT', body: { permissao_ids: state.ativas } });
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  function toggle(id) {
    setState((current) => ({
      ...current,
      ativas: current.ativas.includes(id) ? current.ativas.filter((item) => item !== id) : [...current.ativas, id]
    }));
  }

  return (
    <Modal title={`Permissoes: ${perfil.nome}`} onClose={onClose}>
      {state.loading ? <Spinner /> : (
        <div className="permission-grid">
          <Notice type="error">{error}</Notice>
          {state.todas.map((permissao) => (
            <label key={permissao.id} className="permission-row">
              <input type="checkbox" checked={state.ativas.includes(permissao.id)} onChange={() => toggle(permissao.id)} />
              <span>{permissao.nome}</span>
              <small>{permissao.categoria}</small>
            </label>
          ))}
          <button className="primary-btn" onClick={save}><Save size={17} /> Salvar permissoes</button>
        </div>
      )}
    </Modal>
  );
}

function TransportadorasManager() {
  const empty = { nome_fantasia: '', razao_social: '', cnpj: '', email: '', telefone: '', ativo: true };
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');

  async function load() {
    const payload = await api('/api/transportadoras');
    setRows(payload.data || []);
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      if (form.id) await api(`/api/transportadoras/${form.id}`, { method: 'PUT', body: form });
      else await api('/api/transportadoras', { method: 'POST', body: form });
      setForm(empty);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Excluir transportadora?')) return;
    try {
      await api(`/api/transportadoras/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <ManagerLayout
      error={error}
      form={(
        <form className="form-stack" onSubmit={submit}>
          {['nome_fantasia', 'razao_social', 'cnpj', 'email', 'telefone'].map((field) => (
            <Field key={field} label={field.replace('_', ' ')}>
              <input value={form[field] || ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} required={field === 'nome_fantasia'} />
            </Field>
          ))}
          <label className="check-line"><input type="checkbox" checked={Boolean(form.ativo)} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativa</label>
          <button className="primary-btn">{form.id ? <Save size={17} /> : <Plus size={17} />} {form.id ? 'Salvar' : 'Criar'}</button>
          {form.id && <button type="button" className="ghost-btn" onClick={() => setForm(empty)}>Cancelar</button>}
        </form>
      )}
    >
      <DataTable
        rows={rows}
        columns={[
          ['nome_fantasia', 'Nome fantasia'],
          ['cnpj', 'CNPJ'],
          ['email', 'E-mail'],
          ['telefone', 'Telefone'],
          ['ativo', 'Ativa', (row) => row.ativo ? 'Sim' : 'Nao'],
          ['actions', '', (row) => (
            <div className="row-actions">
              <button className="icon-btn" onClick={() => setForm(row)} title="Editar"><Pencil size={16} /></button>
              <button className="icon-btn danger" onClick={() => remove(row.id)} title="Excluir"><Trash2 size={16} /></button>
            </div>
          )]
        ]}
      />
    </ManagerLayout>
  );
}

function SolicitacoesManager() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    const payload = await api('/api/solicitacoes');
    setRows(payload.data || []);
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  async function act(id, action) {
    try {
      await api(`/api/solicitacoes/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      <Notice type="error">{error}</Notice>
      <DataTable
        rows={rows}
        columns={[
          ['nome', 'Nome'],
          ['email', 'E-mail'],
          ['perfil_nome', 'Perfil'],
          ['transportadora_nome', 'Transportadora'],
          ['created_at', 'Criada em', (row) => formatDateTime(row.created_at)],
          ['actions', '', (row) => (
            <div className="row-actions">
              <button className="ok-btn" onClick={() => act(row.id, 'aprovar')}><CheckCircle2 size={15} /> Aprovar</button>
              <button className="danger-btn" onClick={() => act(row.id, 'rejeitar')}><X size={15} /> Rejeitar</button>
            </div>
          )]
        ]}
      />
    </div>
  );
}

function ConfigManager() {
  const [horario, setHorario] = useState('18:00');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/configuracoes').then((payload) => setHorario(payload.horario_corte || '18:00')).catch((err) => setError(err.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    try {
      const payload = await api('/api/configuracoes', { method: 'POST', body: { horario_corte: horario } });
      setMessage(payload.message);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="single-panel">
      <Notice type="success">{message}</Notice>
      <Notice type="error">{error}</Notice>
      <form className="form-stack compact" onSubmit={save}>
        <Field label="Horario de corte">
          <input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} required />
        </Field>
        <button className="primary-btn"><Save size={17} /> Salvar</button>
      </form>
    </section>
  );
}

function LogsManager() {
  const [rows, setRows] = useState([]);
  const [busca, setBusca] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const payload = await api(`/api/logs?busca=${encodeURIComponent(busca)}&limite=80`);
    setRows(payload.data || []);
  }

  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="Buscar logs" />
        </div>
        <button className="tool-btn" onClick={load}><RefreshCw size={17} /> Atualizar</button>
      </div>
      <Notice type="error">{error}</Notice>
      <DataTable
        rows={rows}
        columns={[
          ['created_at', 'Data', (row) => formatDateTime(row.created_at)],
          ['usuario_nome', 'Usuario'],
          ['acao', 'Acao'],
          ['descricao', 'Descricao'],
          ['ip_address', 'IP']
        ]}
      />
    </div>
  );
}

function ManagerLayout({ children, form, error }) {
  return (
    <div className="manager-layout">
      <section className="list-panel">
        <Notice type="error">{error}</Notice>
        {children}
      </section>
      <aside className="editor-panel">
        {form}
      </aside>
    </div>
  );
}

function AccountView() {
  const { user } = useAuth();
  const [senha, setSenha] = useState({ senha_atual: '', nova_senha: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function changePassword(event) {
    event.preventDefault();
    try {
      const payload = await api('/api/me/senha', { method: 'POST', body: senha });
      setMessage(payload.message);
      setSenha({ senha_atual: '', nova_senha: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('foto', file);
    try {
      const payload = await api('/api/me/foto', { method: 'POST', body: formData });
      setMessage(payload.message);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="account-grid">
      <div className="single-panel">
        <div className="profile-photo">
          {user?.foto_url ? <img src={user.foto_url} alt="" /> : <UserRound size={42} />}
          <label className="tool-btn">
            <Camera size={17} />
            Foto
            <input hidden type="file" accept="image/*" onChange={uploadPhoto} />
          </label>
        </div>
        <h2>{user?.nome}</h2>
        <p>{user?.email}</p>
        <p>{user?.perfil_nome}</p>
      </div>
      <div className="single-panel">
        <Notice type="success">{message}</Notice>
        <Notice type="error">{error}</Notice>
        <form className="form-stack compact" onSubmit={changePassword}>
          <Field label="Senha atual"><input type="password" value={senha.senha_atual} onChange={(e) => setSenha({ ...senha, senha_atual: e.target.value })} required /></Field>
          <Field label="Nova senha"><input type="password" value={senha.nova_senha} onChange={(e) => setSenha({ ...senha, nova_senha: e.target.value })} required /></Field>
          <button className="primary-btn"><KeyRound size={17} /> Alterar senha</button>
        </form>
      </div>
    </section>
  );
}

function ForecastModulePage() {
  const { user, logout } = useAuth();
  return <ForecastLayout user={user} onLogout={logout} />;
}

function PainelDocasPage() {
  const [docas, setDocas] = useState([]);
  const [clock, setClock] = useState(new Date());

  async function load() {
    const payload = await api('/api/docas/status');
    setDocas(payload.data || []);
  }

  useEffect(() => {
    load();
    const dataTimer = setInterval(load, 10000);
    const clockTimer = setInterval(() => setClock(new Date()), 1000);
    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, []);

  return (
    <main className="dock-monitor">
      <header className="monitor-head">
        <div className="side-brand"><span className="brand-mark small">S</span><strong>SIGO</strong></div>
        <div><h1>Painel de Docas</h1><p>Monitor Operacional</p></div>
        <time>{clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
      </header>
      <section className="dock-grid">
        {docas.map((doca) => {
          const statusClass = getDockClass(doca);
          return (
            <article key={doca.doca_id} className={`dock-card ${statusClass}`}>
              <div className="dock-card-head">
                <strong>{doca.doca_nome}</strong>
                <span>{doca.status ? doca.status.replaceAll('_', ' ') : 'Livre'}</span>
              </div>
              <h2>{doca.placa || 'LIVRE'}</h2>
              <p>{doca.transportadora_nome || 'Sem veiculo direcionado'}</p>
              <div className="dock-facts">
                <span>Onda {doca.onda || '-'}</span>
                <span>Rota {doca.rota || '-'}</span>
                <span>{doca.min_carregando || doca.min_no_cd || 0} min</span>
              </div>
              <div className="dock-qr">
                <QRCodeSVG value={JSON.stringify({ tipo: 'doca', doca_id: doca.doca_id })} size={76} />
              </div>
              {!!doca.fila?.length && <small>Fila: {doca.fila.map((item) => item.placa).join(', ')}</small>}
            </article>
          );
        })}
      </section>
    </main>
  );
}

function getDockClass(doca) {
  if (!doca.status) return 'livre';
  if (doca.status === 'aguardando_doca') return 'aguardando';
  if (doca.status === 'carregando' && doca.min_carregando > 120) return 'critico';
  if (doca.status === 'carregando' && doca.min_carregando > 90) return 'atrasado';
  if (doca.status === 'carregando' && doca.min_carregando > 60) return 'atencao';
  return doca.status;
}

function MotoristaPage() {
  const [placa, setPlaca] = useState('');
  const [data, setData] = useState(null);
  const [report, setReport] = useState({ observacao: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function buscar(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const payload = await api(`/api/motorista/buscar-placa?placa=${encodeURIComponent(placa)}`);
      setData(payload);
    } catch (err) {
      setData(null);
      setError(err.message);
    }
  }

  async function iniciarCarga() {
    try {
      const payload = await api('/api/docas/motorista-checkin-doca', {
        method: 'POST',
        body: { placa: data.placa, doca_id: data.operacao?.doca_id }
      });
      setMessage(payload.message);
    } catch (err) {
      setError(err.message);
    }
  }

  async function enviarReporte(event) {
    event.preventDefault();
    if (!data?.placa) return;
    const formData = new FormData();
    formData.append('placa', data.placa);
    if (data.romaneio?.id) formData.append('romaneio_id', data.romaneio.id);
    formData.append('observacao', report.observacao);
    ['foto1', 'foto2', 'foto3'].forEach((key) => {
      if (report[key]) formData.append(key, report[key]);
    });
    try {
      const payload = await api('/api/motorista/reporte', { method: 'POST', body: formData });
      setMessage(payload.message);
      setReport({ observacao: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="mobile-app">
      <header className="mobile-head"><span className="brand-mark small">S</span><div><strong>App do Motorista</strong><small>SIGO</small></div></header>
      <section className="mobile-panel">
        <form className="plate-form" onSubmit={buscar}>
          <Car size={20} />
          <input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={8} placeholder="ABC1D23" />
          <button><Search size={18} /></button>
        </form>
        <Notice type="success">{message}</Notice>
        <Notice type="error">{error}</Notice>
      </section>

      {data?.placa && (
        <>
          <section className="mobile-panel center">
            <QRCodeSVG value={data.placa} size={178} />
            <h1>{data.placa}</h1>
            <p>{data.operacao?.doca_nome ? `${data.operacao.doca_nome} - ${data.operacao.status}` : 'Aguardando direcionamento'}</p>
            {data.operacao?.doca_id && data.operacao?.status === 'aguardando_doca' && (
              <button className="primary-btn" onClick={iniciarCarga}><Warehouse size={18} /> Iniciar carregamento</button>
            )}
          </section>
          {data.romaneio && (
            <section className="mobile-panel info-grid">
              {['onda', 'vaga', 'gaiola', 'rota', 'regiao', 'paradas'].map((field) => (
                <div key={field} className="info-chip"><small>{field}</small><strong>{data.romaneio[field] || '-'}</strong></div>
              ))}
            </section>
          )}
          <section className="mobile-panel">
            <form className="form-stack" onSubmit={enviarReporte}>
              <Field label="Observacao"><textarea value={report.observacao} onChange={(e) => setReport({ ...report, observacao: e.target.value })} required /></Field>
              <div className="photo-row">
                {[1, 2, 3].map((item) => (
                  <label key={item} className="photo-slot">
                    <Camera size={20} />
                    <span>Foto {item}</span>
                    <input hidden type="file" accept="image/*" onChange={(e) => setReport({ ...report, [`foto${item}`]: e.target.files?.[0] })} />
                  </label>
                ))}
              </div>
              <button className="primary-btn"><Upload size={17} /> Enviar reporte</button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}

function CheckinPage() {
  const [modo, setModo] = useState('entrada');
  const [placa, setPlaca] = useState('');
  const [docas, setDocas] = useState([]);
  const [current, setCurrent] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function processar(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      if (modo === 'entrada') {
        const payload = await api('/api/docas/porteiro-entrada', { method: 'POST', body: { placa } });
        setMessage(payload.message);
        setCurrent({ placa });
        const docasPayload = await api('/api/docas');
        setDocas(docasPayload.data || []);
      } else {
        const payload = await api('/api/docas/porteiro-saida', { method: 'POST', body: { placa } });
        setMessage(`${payload.message} Total: ${payload.tempo_total_min ?? '-'} min`);
        setCurrent(null);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function selecionarDoca(docaId, forcar = false) {
    try {
      const payload = await api('/api/docas/selecionar-doca', { method: 'POST', body: { placa: current.placa, doca_id: docaId, forcar } });
      setMessage(payload.message);
      setCurrent(null);
    } catch (err) {
      if (err.payload?.doca_ocupada && confirm(err.message)) {
        await selecionarDoca(docaId, true);
      } else {
        setError(err.message);
      }
    }
  }

  return (
    <main className="mobile-app">
      <header className="mobile-head"><span className="brand-mark small">S</span><div><strong>Porteiro</strong><small>Check-in / Check-out</small></div></header>
      <section className="mobile-panel">
        <div className="segmented full">
          <button className={modo === 'entrada' ? 'active' : ''} onClick={() => setModo('entrada')}>Entrada</button>
          <button className={modo === 'saida' ? 'active' : ''} onClick={() => setModo('saida')}>Saida</button>
        </div>
        <form className="plate-form" onSubmit={processar}>
          <Car size={20} />
          <input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={8} placeholder="ABC1D23" required />
          <button><CheckCircle2 size={18} /></button>
        </form>
        <Notice type="success">{message}</Notice>
        <Notice type="error">{error}</Notice>
      </section>
      {current && (
        <section className="mobile-panel">
          <h2>Selecionar doca para {current.placa}</h2>
          <div className="doca-buttons">
            {docas.map((doca) => (
              <button key={doca.id} className={doca.ocupada ? 'occupied' : ''} onClick={() => selecionarDoca(doca.id)}>
                <Warehouse size={18} />
                {doca.nome}
                <small>{doca.ocupada ? 'Ocupada' : 'Livre'}</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/forecast/*" element={<RequireAuth><ForecastModulePage /></RequireAuth>} />
        <Route path="/painel" element={<PainelDocasPage />} />
        <Route path="/motorista" element={<MotoristaPage />} />
        <Route path="/checkin" element={<RequireAuth><CheckinPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to={getToken() ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </AuthProvider>
  );
}
