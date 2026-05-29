import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { parse } from 'csv-parse/sync';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const TIMEZONE = process.env.TIMEZONE || 'America/Sao_Paulo';
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'missing-service-role-key';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'sigo-uploads';
const JWT_SECRET = process.env.JWT_SECRET || 'sigo-dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: process.env.CLIENT_URL?.split(',').map((origin) => origin.trim()).filter(Boolean) || true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function apiOk(res, payload = {}) {
  res.json({ success: true, ...payload });
}

function apiFail(res, message, status = 400, extra = {}) {
  res.status(status).json({ success: false, message, ...extra });
}

function cleanText(value) {
  return String(value ?? '').trim().replace(/[<>]/g, '');
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'on', 'sim', 'yes'].includes(String(value ?? '').toLowerCase());
}

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function nowTimeMinutes() {
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date());
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function timeToMinutes(time) {
  const [hour = 0, minute = 0] = String(time || '18:00').split(':').map(Number);
  return hour * 60 + minute;
}

function minutesBetween(start, end = new Date()) {
  if (!start) return null;
  return Math.max(0, Math.floor((end.getTime() - new Date(start).getTime()) / 60000));
}

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
}

function userPayload(user, permissions) {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    perfil_id: user.perfil_id,
    perfil_nome: user.perfil?.nome || user.perfis?.nome || user.perfil_nome || 'Operador',
    is_despachante: Boolean(user.is_despachante),
    transportadora_id: user.transportadora_id,
    foto_url: user.foto_url,
    permissions
  };
}

async function getPermissions(perfilId) {
  if (Number(perfilId) === 1) {
    const { data, error } = await supabase.from('permissoes').select('chave');
    if (error) throw error;
    return (data || []).map((item) => item.chave);
  }

  const { data, error } = await supabase
    .from('perfil_permissoes')
    .select('permissoes(chave)')
    .eq('perfil_id', perfilId);

  if (error) throw error;
  return (data || []).map((item) => item.permissoes?.chave).filter(Boolean);
}

async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*, perfil:perfis(id,nome)')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getUserById(id) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*, perfil:perfis(id,nome)')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function logAction(req, acao, descricao, usuarioId = req.user?.id ?? null) {
  const { error } = await supabase.from('logs').insert({
    usuario_id: usuarioId,
    acao,
    descricao,
    ip_address: clientIp(req)
  });

  if (error) {
    console.warn('Falha ao registrar log:', error.message);
  }
}

function signUser(user, permissions) {
  const payload = userPayload(user, permissions);
  return {
    token: jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }),
    user: payload
  };
}

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return apiFail(res, 'Acesso negado. Faca login novamente.', 401);
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return apiFail(res, 'Sessao expirada. Faca login novamente.', 401);
  }
}

function optionalAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      req.user = null;
    }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (Number(req.user?.perfil_id) !== 1) {
    return apiFail(res, 'Permissao insuficiente. Apenas administradores podem acessar esta funcao.', 403);
  }
  return next();
}

function requirePermission(chave) {
  return (req, res, next) => {
    const isAdmin = Number(req.user?.perfil_id) === 1;
    const allowed = isAdmin || req.user?.permissions?.includes(chave);
    if (!allowed) {
      return apiFail(res, 'Voce nao tem permissao para realizar esta acao.', 403);
    }
    return next();
  };
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, storedHash) {
  const normalizedHash = String(storedHash || '').replace(/^\$2y\$/, '$2b$');
  return bcrypt.compare(password, normalizedHash);
}

async function sendMail({ to, subject, html }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn(`[mail skipped] ${subject} -> ${to}`);
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE ?? 'true') !== 'false',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'SIGO - Sistema Operacional'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    text: html.replace(/<[^>]+>/g, ' ')
  });

  return true;
}

async function uploadFileToSupabase(file, folder) {
  if (!file) return null;

  const extByMime = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  const ext = extByMime[file.mimetype] || file.originalname?.split('.').pop() || 'bin';
  const path = `${folder}/${Date.now()}-${randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) throw error;

  const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function getHorarioCorte() {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'horario_corte')
    .maybeSingle();

  if (error) throw error;
  return data?.valor || '18:00';
}

function isAfterCutoff(horarioCorte) {
  return nowTimeMinutes() > timeToMinutes(horarioCorte);
}

function normalizeUsuario(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    ativo: Boolean(row.ativo),
    perfil_id: row.perfil_id,
    perfil_nome: row.perfil?.nome || row.perfis?.nome || null,
    is_despachante: Boolean(row.is_despachante),
    transportadora_id: row.transportadora_id,
    transportadora_nome: row.transportadora?.nome_fantasia || row.transportadoras?.nome_fantasia || null,
    foto_url: row.foto_url,
    created_at: row.created_at
  };
}

function normalizeRomaneio(row) {
  return {
    ...row,
    usuario_nome: row.usuario?.nome || row.usuarios?.nome || null,
    transportadora_nome: row.transportadora?.nome_fantasia || row.transportadoras?.nome_fantasia || null
  };
}

async function getRomaneioForUser(id, user) {
  const { data, error } = await supabase
    .from('romaneios')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Romaneio nao encontrado.');
  if (user?.is_despachante && Number(data.transportadora_id) !== Number(user.transportadora_id)) {
    throw new Error('Acesso negado. Voce nao pode alterar romaneios de outras transportadoras.');
  }
  return data;
}

async function logRomaneioChange({ romaneioId, usuarioId, campo, anterior, novo, foraDoHorario }) {
  const { error } = await supabase.from('romaneio_logs').insert({
    romaneio_id: romaneioId,
    usuario_id: usuarioId,
    campo_alterado: campo,
    valor_anterior: anterior == null ? null : String(anterior),
    valor_novo: novo == null ? null : String(novo),
    fora_do_horario: Boolean(foraDoHorario)
  });
  if (error) throw error;
}

async function primeiraTransportadoraId() {
  const { data, error } = await supabase
    .from('transportadoras')
    .select('id')
    .eq('ativo', true)
    .order('nome_fantasia', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

const publicRouter = express.Router();

publicRouter.get('/access-options', asyncRoute(async (_req, res) => {
  const [{ data: perfis, error: perfisError }, { data: transportadoras, error: transError }] = await Promise.all([
    supabase.from('perfis').select('id,nome').neq('id', 1).order('nome'),
    supabase.from('transportadoras').select('id,nome_fantasia').eq('ativo', true).order('nome_fantasia')
  ]);

  if (perfisError) throw perfisError;
  if (transError) throw transError;
  apiOk(res, { perfis, transportadoras });
}));

app.use('/api/public', publicRouter);

const authRouter = express.Router();

authRouter.post('/login', asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const senha = String(req.body.senha || '');

  if (!isValidEmail(email)) return apiFail(res, 'Por favor, informe um e-mail valido.');
  if (!senha) return apiFail(res, 'A senha e obrigatoria.');

  const user = await getUserByEmail(email);
  if (!user) {
    await logAction(req, 'LOGIN_FAILED', `Tentativa de login falhou. E-mail nao encontrado: ${email}`, null);
    return apiFail(res, 'E-mail ou senha incorretos.', 401);
  }

  if (!user.ativo) {
    await logAction(req, 'LOGIN_FAILED', `Tentativa de login falhou. Usuario inativo: ${email}`, null);
    return apiFail(res, 'Esta conta esta desativada. Por favor, contate o administrador.', 403);
  }

  const validPassword = await verifyPassword(senha, user.senha_hash);
  if (!validPassword) {
    await logAction(req, 'LOGIN_FAILED', `Tentativa de login falhou. Senha incorreta para o e-mail: ${email}`, null);
    return apiFail(res, 'E-mail ou senha incorretos.', 401);
  }

  const permissions = await getPermissions(user.perfil_id);
  const signed = signUser(user, permissions);
  await logAction(req, 'LOGIN_SUCCESS', 'Usuario logou no sistema.', user.id);

  apiOk(res, {
    message: 'Login efetuado com sucesso!',
    redirect: '/dashboard',
    ...signed
  });
}));

authRouter.post('/logout', requireAuth, asyncRoute(async (req, res) => {
  await logAction(req, 'LOGOUT', 'Usuario deslogou do sistema.');
  apiOk(res, { message: 'Desconectado com sucesso.' });
}));

authRouter.post('/recuperar', asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!isValidEmail(email)) return apiFail(res, 'Por favor, informe um e-mail valido.');

  const user = await getUserByEmail(email);
  if (user) {
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('usuarios')
      .update({ token_recuperacao: token, expiracao_token: expires })
      .eq('id', user.id);
    if (error) throw error;

    const link = `${process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:5173'}/login?action=reset&token=${token}`;
    await sendMail({
      to: email,
      subject: 'Recuperacao de Senha - SIGO',
      html: `<p>Ola, ${user.nome}.</p><p>Use o link abaixo para redefinir sua senha no SIGO. Ele expira em 1 hora.</p><p><a href="${link}">Redefinir minha senha</a></p>`
    });
    await logAction(req, 'PASSWORD_RESET_REQUEST', `Redefinicao de senha solicitada para o usuario ID ${user.id} (${email})`, null);
  }

  apiOk(res, {
    message: 'Se o e-mail estiver cadastrado, as instrucoes de recuperacao de senha serao enviadas em instantes.'
  });
}));

authRouter.post('/redefinir', asyncRoute(async (req, res) => {
  const token = cleanText(req.body.token);
  const senha = String(req.body.senha || '');
  const confirmarSenha = String(req.body.confirmar_senha || req.body.confirmarSenha || senha);

  if (!token) return apiFail(res, 'Token invalido.');
  if (senha.length < 4) return apiFail(res, 'A senha deve conter no minimo 4 caracteres.');
  if (senha !== confirmarSenha) return apiFail(res, 'As senhas nao coincidem.');

  const { data: user, error } = await supabase
    .from('usuarios')
    .select('id,email')
    .eq('token_recuperacao', token)
    .gt('expiracao_token', new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!user) return apiFail(res, 'O token de recuperacao e invalido ou ja expirou.', 400);

  const { error: updateError } = await supabase
    .from('usuarios')
    .update({
      senha_hash: await hashPassword(senha),
      token_recuperacao: null,
      expiracao_token: null
    })
    .eq('id', user.id);

  if (updateError) throw updateError;
  await logAction(req, 'PASSWORD_RESET_SUCCESS', `Senha redefinida com sucesso para o usuario ID ${user.id} (${user.email})`, null);
  apiOk(res, { message: 'Senha alterada com sucesso! Voce ja pode fazer login.' });
}));

authRouter.post('/solicitar-acesso', asyncRoute(async (req, res) => {
  const nome = cleanText(req.body.nome);
  const email = normalizeEmail(req.body.email);
  const senha = String(req.body.senha || '');
  const confirmarSenha = String(req.body.confirmar_senha || req.body.confirmarSenha || '');
  const perfilId = Number(req.body.perfil_id || req.body.perfilId || 0);
  const isDespachante = toBool(req.body.is_despachante);
  const transportadoraId = req.body.transportadora_id ? Number(req.body.transportadora_id) : null;
  const justificativa = cleanText(req.body.justificativa);

  if (!nome) return apiFail(res, 'O nome e obrigatorio.');
  if (!isValidEmail(email)) return apiFail(res, 'Por favor, informe um e-mail valido.');
  if (senha.length < 4) return apiFail(res, 'A senha deve conter no minimo 4 caracteres.');
  if (senha !== confirmarSenha) return apiFail(res, 'As senhas nao coincidem.');
  if (!perfilId || perfilId === 1) return apiFail(res, 'Selecione um perfil desejado.');
  if (isDespachante && !transportadoraId) return apiFail(res, 'Selecione a transportadora vinculada.');
  if (!justificativa) return apiFail(res, 'Informe a justificativa do acesso.');

  const existing = await getUserByEmail(email);
  if (existing) return apiFail(res, 'Este e-mail ja esta cadastrado no sistema.');

  const { data: pending, error: pendingError } = await supabase
    .from('solicitacoes_acesso')
    .select('id')
    .eq('email', email)
    .eq('status', 'Pendente')
    .maybeSingle();

  if (pendingError) throw pendingError;
  if (pending) return apiFail(res, 'Ja existe uma solicitacao de acesso pendente para este e-mail.');

  const { error } = await supabase.from('solicitacoes_acesso').insert({
    nome,
    email,
    senha_hash: await hashPassword(senha),
    perfil_solicitado_id: perfilId,
    is_despachante: isDespachante,
    transportadora_id: transportadoraId,
    justificativa
  });

  if (error) throw error;
  await logAction(req, 'ACCESS_REQUEST', `Nova solicitacao de acesso criada por: ${nome} (${email})`, null);
  apiOk(res, { message: 'Sua solicitacao foi enviada! O administrador analisara seu acesso.' });
}));

app.use('/api/auth', authRouter);

const meRouter = express.Router();
meRouter.use(requireAuth);

meRouter.get('/', asyncRoute(async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) return apiFail(res, 'Usuario nao encontrado.', 404);
  apiOk(res, { data: userPayload(user, req.user.permissions || []) });
}));

meRouter.post('/senha', asyncRoute(async (req, res) => {
  const senhaAtual = String(req.body.senha_atual || '');
  const novaSenha = String(req.body.nova_senha || '');
  if (!senhaAtual || !novaSenha) return apiFail(res, 'Todos os campos de senha sao obrigatorios.');
  if (novaSenha.length < 4) return apiFail(res, 'A nova senha deve possuir pelo menos 4 caracteres.');

  const user = await getUserById(req.user.id);
  if (!user) return apiFail(res, 'Usuario nao encontrado.', 404);

  const valid = await verifyPassword(senhaAtual, user.senha_hash);
  if (!valid) return apiFail(res, 'A senha atual informada esta incorreta.');

  const { error } = await supabase.from('usuarios').update({ senha_hash: await hashPassword(novaSenha) }).eq('id', req.user.id);
  if (error) throw error;
  await logAction(req, 'PASSWORD_CHANGE', 'O proprio usuario alterou sua senha de acesso.');
  apiOk(res, { message: 'Senha alterada com sucesso!' });
}));

meRouter.post('/foto', upload.single('foto'), asyncRoute(async (req, res) => {
  if (!req.file) return apiFail(res, 'Nenhuma foto enviada ou ocorreu um erro no upload.');
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(req.file.mimetype)) {
    return apiFail(res, 'Formato de imagem invalido. Use PNG, JPG, WEBP ou GIF.');
  }

  const fotoUrl = await uploadFileToSupabase(req.file, `usuarios/${req.user.id}`);
  const { error } = await supabase.from('usuarios').update({ foto_url: fotoUrl }).eq('id', req.user.id);
  if (error) throw error;
  await logAction(req, 'PHOTO_CHANGE', 'O proprio usuario atualizou sua foto de perfil.');
  apiOk(res, { message: 'Foto de perfil atualizada com sucesso!', caminho: fotoUrl, foto_url: fotoUrl });
}));

meRouter.delete('/foto', asyncRoute(async (req, res) => {
  const { error } = await supabase.from('usuarios').update({ foto_url: null }).eq('id', req.user.id);
  if (error) throw error;
  await logAction(req, 'PHOTO_REMOVE', 'O proprio usuario removeu sua foto de perfil.');
  apiOk(res, { message: 'Foto de perfil removida com sucesso!' });
}));

app.use('/api/me', meRouter);

const usuariosRouter = express.Router();
usuariosRouter.use(requireAuth);

usuariosRouter.get('/', requirePermission('cadastrar_usuarios'), asyncRoute(async (_req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id,nome,email,ativo,perfil_id,is_despachante,transportadora_id,foto_url,created_at,perfil:perfis(id,nome),transportadora:transportadoras(id,nome_fantasia)')
    .order('nome');
  if (error) throw error;
  apiOk(res, { data: (data || []).map(normalizeUsuario) });
}));

usuariosRouter.post('/', requirePermission('cadastrar_usuarios'), asyncRoute(async (req, res) => {
  const nome = cleanText(req.body.nome);
  const email = normalizeEmail(req.body.email);
  const senha = String(req.body.senha || '');
  const perfilId = Number(req.body.perfil_id || 0);

  if (!nome) return apiFail(res, 'O nome do usuario e obrigatorio.');
  if (!isValidEmail(email)) return apiFail(res, 'E-mail invalido.');
  if (senha.length < 4) return apiFail(res, 'A senha deve possuir pelo menos 4 caracteres.');
  if (!perfilId) return apiFail(res, 'Selecione um perfil valido.');
  if (await getUserByEmail(email)) return apiFail(res, 'Este e-mail ja esta cadastrado.');

  const { data, error } = await supabase
    .from('usuarios')
    .insert({
      nome,
      email,
      senha_hash: await hashPassword(senha),
      perfil_id: perfilId,
      ativo: req.body.ativo == null ? true : toBool(req.body.ativo),
      is_despachante: toBool(req.body.is_despachante),
      transportadora_id: req.body.transportadora_id ? Number(req.body.transportadora_id) : null
    })
    .select('id')
    .single();

  if (error) throw error;
  await logAction(req, 'USER_CREATE', `Criou o usuario ID ${data.id}: ${nome} (${email})`);
  apiOk(res, { message: 'Usuario cadastrado com sucesso!', id: data.id });
}));

usuariosRouter.put('/:id', requirePermission('cadastrar_usuarios'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const nome = cleanText(req.body.nome);
  const email = normalizeEmail(req.body.email);
  const senha = String(req.body.senha || '');
  const perfilId = Number(req.body.perfil_id || 0);

  if (!id) return apiFail(res, 'ID de usuario invalido.');
  if (!nome) return apiFail(res, 'O nome do usuario e obrigatorio.');
  if (!isValidEmail(email)) return apiFail(res, 'E-mail invalido.');
  if (!perfilId) return apiFail(res, 'Selecione um perfil valido.');
  if (senha && senha.length < 4) return apiFail(res, 'Se informada, a nova senha deve possuir pelo menos 4 caracteres.');

  const existing = await getUserByEmail(email);
  if (existing && Number(existing.id) !== id) return apiFail(res, 'Este e-mail ja esta em uso por outro usuario.');

  const update = {
    nome,
    email,
    perfil_id: perfilId,
    ativo: req.body.ativo == null ? true : toBool(req.body.ativo),
    is_despachante: toBool(req.body.is_despachante),
    transportadora_id: req.body.transportadora_id ? Number(req.body.transportadora_id) : null
  };
  if (senha) update.senha_hash = await hashPassword(senha);

  const { error } = await supabase.from('usuarios').update(update).eq('id', id);
  if (error) throw error;
  await logAction(req, 'USER_UPDATE', `Atualizou o usuario ID ${id}: ${nome} (${email})`);
  apiOk(res, { message: 'Usuario atualizado com sucesso!' });
}));

usuariosRouter.delete('/:id', requirePermission('cadastrar_usuarios'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return apiFail(res, 'ID de usuario invalido.');
  if (id === 1) return apiFail(res, 'O administrador padrao do sistema nao pode ser excluido.');

  const { data: user, error: fetchError } = await supabase.from('usuarios').select('nome,email').eq('id', id).maybeSingle();
  if (fetchError) throw fetchError;
  if (!user) return apiFail(res, 'Usuario nao encontrado.', 404);

  const { error } = await supabase.from('usuarios').delete().eq('id', id);
  if (error) throw error;
  await logAction(req, 'USER_DELETE', `Excluiu o usuario: ${user.nome} (${user.email})`);
  apiOk(res, { message: 'Usuario excluido com sucesso!' });
}));

app.use('/api/usuarios', usuariosRouter);

const perfisRouter = express.Router();
perfisRouter.use(requireAuth);

perfisRouter.get('/', asyncRoute(async (_req, res) => {
  const { data, error } = await supabase.from('perfis').select('*').order('id');
  if (error) throw error;
  apiOk(res, { data });
}));

perfisRouter.get('/:id/permissoes', asyncRoute(async (req, res) => {
  const perfilId = Number(req.params.id);
  if (!perfilId) return apiFail(res, 'Perfil invalido.');

  const [{ data: ativas, error: activeError }, { data: todas, error: allError }] = await Promise.all([
    supabase.from('perfil_permissoes').select('permissao_id').eq('perfil_id', perfilId),
    supabase.from('permissoes').select('*').order('categoria').order('nome')
  ]);

  if (activeError) throw activeError;
  if (allError) throw allError;
  apiOk(res, { ativas: (ativas || []).map((item) => item.permissao_id), todas: todas || [] });
}));

perfisRouter.post('/', requirePermission('cadastrar_perfis'), asyncRoute(async (req, res) => {
  const nome = cleanText(req.body.nome);
  const descricao = cleanText(req.body.descricao);
  if (!nome) return apiFail(res, 'O nome do perfil e obrigatorio.');

  const { data, error } = await supabase.from('perfis').insert({ nome, descricao }).select('id').single();
  if (error) {
    if (error.code === '23505') return apiFail(res, 'Ja existe um perfil cadastrado com este nome.');
    throw error;
  }
  await logAction(req, 'PROFILE_CREATE', `Criou o perfil ID ${data.id}: ${nome}`);
  apiOk(res, { message: 'Perfil cadastrado com sucesso!', id: data.id });
}));

perfisRouter.put('/:id', requirePermission('cadastrar_perfis'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const nome = cleanText(req.body.nome);
  const descricao = cleanText(req.body.descricao);

  if (!id) return apiFail(res, 'ID do perfil invalido.');
  if (id === 1) return apiFail(res, "O perfil 'Administrador' padrao nao pode ser renomeado ou alterado.");
  if (!nome) return apiFail(res, 'O nome do perfil e obrigatorio.');

  const { error } = await supabase.from('perfis').update({ nome, descricao }).eq('id', id);
  if (error) {
    if (error.code === '23505') return apiFail(res, 'Ja existe outro perfil com este nome.');
    throw error;
  }
  await logAction(req, 'PROFILE_UPDATE', `Atualizou o perfil ID ${id}: ${nome}`);
  apiOk(res, { message: 'Perfil atualizado com sucesso!' });
}));

perfisRouter.delete('/:id', requirePermission('cadastrar_perfis'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if ([1, 2, 3].includes(id)) return apiFail(res, 'Os perfis padrao do sistema nao podem ser excluidos.');

  const { data: vinculado, error: linkedError } = await supabase.from('usuarios').select('id').eq('perfil_id', id).limit(1);
  if (linkedError) throw linkedError;
  if (vinculado?.length) return apiFail(res, 'Nao e possivel excluir este perfil, pois ha usuarios associados a ele.');

  const { data: perfil } = await supabase.from('perfis').select('nome').eq('id', id).maybeSingle();
  const { error } = await supabase.from('perfis').delete().eq('id', id);
  if (error) throw error;
  await logAction(req, 'PROFILE_DELETE', `Excluiu o perfil: ${perfil?.nome || id}`);
  apiOk(res, { message: 'Perfil excluido com sucesso!' });
}));

perfisRouter.put('/:id/permissoes', requirePermission('permissao_perfis'), asyncRoute(async (req, res) => {
  const perfilId = Number(req.params.id);
  const permissaoIds = Array.isArray(req.body.permissao_ids) ? req.body.permissao_ids.map(Number).filter(Boolean) : [];

  if (!perfilId) return apiFail(res, 'Perfil invalido.');
  if (perfilId === 1) return apiFail(res, "As permissoes do perfil 'Administrador' nao podem ser alteradas.");

  const { error: deleteError } = await supabase.from('perfil_permissoes').delete().eq('perfil_id', perfilId);
  if (deleteError) throw deleteError;

  if (permissaoIds.length) {
    const { error: insertError } = await supabase.from('perfil_permissoes').insert(
      permissaoIds.map((permissao_id) => ({ perfil_id: perfilId, permissao_id }))
    );
    if (insertError) throw insertError;
  }

  const { data: perfil } = await supabase.from('perfis').select('nome').eq('id', perfilId).maybeSingle();
  await logAction(req, 'PERMISSIONS_UPDATE', `Permissoes do perfil '${perfil?.nome || perfilId}' atualizadas.`);
  apiOk(res, { message: 'Permissoes atualizadas com sucesso!' });
}));

app.use('/api/perfis', perfisRouter);

const transportadorasRouter = express.Router();
transportadorasRouter.use(requireAuth);

transportadorasRouter.get('/', asyncRoute(async (_req, res) => {
  const { data, error } = await supabase.from('transportadoras').select('*').order('nome_fantasia');
  if (error) throw error;
  apiOk(res, { data });
}));

transportadorasRouter.post('/', requirePermission('cadastrar_transportadoras'), asyncRoute(async (req, res) => {
  const payload = {
    nome_fantasia: cleanText(req.body.nome_fantasia),
    razao_social: cleanText(req.body.razao_social) || null,
    cnpj: cleanText(req.body.cnpj) || null,
    email: normalizeEmail(req.body.email) || null,
    telefone: cleanText(req.body.telefone) || null,
    ativo: req.body.ativo == null ? true : toBool(req.body.ativo)
  };

  if (!payload.nome_fantasia) return apiFail(res, 'O nome fantasia e obrigatorio.');
  if (payload.email && !isValidEmail(payload.email)) return apiFail(res, 'Por favor, informe um e-mail valido para a transportadora.');

  const { data, error } = await supabase.from('transportadoras').insert(payload).select('id').single();
  if (error) {
    if (error.code === '23505') return apiFail(res, 'Esta transportadora ja esta cadastrada.');
    throw error;
  }
  await logAction(req, 'CARRIER_CREATE', `Cadastrou a transportadora ID ${data.id}: ${payload.nome_fantasia}${payload.cnpj ? ` (CNPJ: ${payload.cnpj})` : ''}`);
  apiOk(res, { message: 'Transportadora cadastrada com sucesso!', id: data.id });
}));

transportadorasRouter.put('/:id', requirePermission('cadastrar_transportadoras'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const payload = {
    nome_fantasia: cleanText(req.body.nome_fantasia),
    razao_social: cleanText(req.body.razao_social) || null,
    cnpj: cleanText(req.body.cnpj) || null,
    email: normalizeEmail(req.body.email) || null,
    telefone: cleanText(req.body.telefone) || null,
    ativo: req.body.ativo == null ? true : toBool(req.body.ativo)
  };

  if (!id) return apiFail(res, 'ID de transportadora invalido.');
  if (!payload.nome_fantasia) return apiFail(res, 'O nome fantasia e obrigatorio.');
  if (payload.email && !isValidEmail(payload.email)) return apiFail(res, 'Por favor, informe um e-mail valido.');

  const { error } = await supabase.from('transportadoras').update(payload).eq('id', id);
  if (error) {
    if (error.code === '23505') return apiFail(res, 'Este CNPJ ja esta cadastrado em outra transportadora.');
    throw error;
  }
  await logAction(req, 'CARRIER_UPDATE', `Atualizou a transportadora ID ${id}: ${payload.nome_fantasia}${payload.cnpj ? ` (CNPJ: ${payload.cnpj})` : ''}`);
  apiOk(res, { message: 'Transportadora atualizada com sucesso!' });
}));

transportadorasRouter.delete('/:id', requirePermission('cadastrar_transportadoras'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return apiFail(res, 'ID de transportadora invalido.');

  const { data: carrier } = await supabase.from('transportadoras').select('nome_fantasia,cnpj').eq('id', id).maybeSingle();
  if (!carrier) return apiFail(res, 'Transportadora nao encontrada.', 404);

  const { error } = await supabase.from('transportadoras').delete().eq('id', id);
  if (error) throw error;
  await logAction(req, 'CARRIER_DELETE', `Excluiu a transportadora: ${carrier.nome_fantasia}${carrier.cnpj ? ` (CNPJ: ${carrier.cnpj})` : ''}`);
  apiOk(res, { message: 'Transportadora excluida com sucesso!' });
}));

app.use('/api/transportadoras', transportadorasRouter);

const solicitacoesRouter = express.Router();
solicitacoesRouter.use(requireAuth, requireAdmin);

solicitacoesRouter.get('/', asyncRoute(async (_req, res) => {
  const { data, error } = await supabase
    .from('solicitacoes_acesso')
    .select('id,nome,email,perfil_solicitado_id,is_despachante,transportadora_id,justificativa,status,created_at,perfil:perfis(nome),transportadora:transportadoras(nome_fantasia)')
    .eq('status', 'Pendente')
    .order('created_at', { ascending: false });

  if (error) throw error;
  apiOk(res, {
    data: (data || []).map((item) => ({
      ...item,
      perfil_nome: item.perfil?.nome,
      transportadora_nome: item.transportadora?.nome_fantasia
    }))
  });
}));

solicitacoesRouter.post('/:id/aprovar', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return apiFail(res, 'ID da solicitacao invalido.');

  const { data: solicitacao, error: reqError } = await supabase
    .from('solicitacoes_acesso')
    .select('*')
    .eq('id', id)
    .eq('status', 'Pendente')
    .maybeSingle();

  if (reqError) throw reqError;
  if (!solicitacao) return apiFail(res, 'Solicitacao de acesso nao encontrada ou ja processada.', 404);

  const existing = await getUserByEmail(solicitacao.email);
  if (!existing) {
    const { error: insertError } = await supabase.from('usuarios').insert({
      nome: solicitacao.nome,
      email: solicitacao.email,
      senha_hash: solicitacao.senha_hash,
      perfil_id: solicitacao.perfil_solicitado_id,
      ativo: true,
      is_despachante: solicitacao.is_despachante,
      transportadora_id: solicitacao.transportadora_id
    });
    if (insertError) throw insertError;
  }

  const { error: updateError } = await supabase
    .from('solicitacoes_acesso')
    .update({ status: 'Aprovada' })
    .eq('id', id);
  if (updateError) throw updateError;

  await logAction(req, 'ACCESS_APPROVED', `Aprovado acesso para o usuario: ${solicitacao.nome} (${solicitacao.email}) no perfil ID ${solicitacao.perfil_solicitado_id}`);
  apiOk(res, {
    message: existing
      ? 'A solicitacao foi concluida (e-mail ja estava registrado no sistema).'
      : 'Solicitacao aprovada e usuario criado com sucesso!'
  });
}));

solicitacoesRouter.post('/:id/rejeitar', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return apiFail(res, 'ID da solicitacao invalido.');

  const { data: solicitacao, error: reqError } = await supabase
    .from('solicitacoes_acesso')
    .select('*')
    .eq('id', id)
    .eq('status', 'Pendente')
    .maybeSingle();

  if (reqError) throw reqError;
  if (!solicitacao) return apiFail(res, 'Solicitacao de acesso nao encontrada ou ja processada.', 404);

  const { error } = await supabase.from('solicitacoes_acesso').update({ status: 'Rejeitada' }).eq('id', id);
  if (error) throw error;

  await logAction(req, 'ACCESS_REJECTED', `Rejeitado acesso para o usuario: ${solicitacao.nome} (${solicitacao.email})`);
  apiOk(res, { message: 'Solicitacao de acesso rejeitada com sucesso.' });
}));

app.use('/api/solicitacoes', solicitacoesRouter);

const configuracoesRouter = express.Router();
configuracoesRouter.use(requireAuth);

configuracoesRouter.get('/', asyncRoute(async (_req, res) => {
  apiOk(res, { horario_corte: await getHorarioCorte() });
}));

configuracoesRouter.post('/', requirePermission('cadastrar_perfis'), asyncRoute(async (req, res) => {
  const horario = cleanText(req.body.horario_corte || '18:00');
  if (!/^(?:2[0-3]|[01][0-9]):[0-5][0-9]$/.test(horario)) {
    return apiFail(res, 'Por favor, informe um horario valido no formato HH:MM (ex: 18:00).');
  }

  const { error } = await supabase
    .from('configuracoes')
    .upsert({ chave: 'horario_corte', valor: horario, updated_at: new Date().toISOString() }, { onConflict: 'chave' });

  if (error) throw error;
  await logAction(req, 'CONFIG_UPDATE', `Horario limite de alteracoes atualizado para: ${horario}`);
  apiOk(res, { message: 'Configuracoes de horario salvas com sucesso!', horario_corte: horario });
}));

app.use('/api/configuracoes', configuracoesRouter);

const logsRouter = express.Router();
logsRouter.use(requireAuth, requirePermission('visualizar_logs'));

logsRouter.get('/', asyncRoute(async (req, res) => {
  const busca = cleanText(req.query.busca || '');
  const limite = Math.min(Number(req.query.limite || 50), 200);
  const pagina = Math.max(Number(req.query.pagina || 1), 1);
  const offset = (pagina - 1) * limite;

  let query = supabase
    .from('logs')
    .select('*, usuario:usuarios(nome,email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limite - 1);

  if (busca) {
    const escaped = busca.replace(/[%(),]/g, '');
    query = query.or(`acao.ilike.%${escaped}%,descricao.ilike.%${escaped}%,ip_address.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  apiOk(res, {
    data: (data || []).map((item) => ({
      ...item,
      usuario_nome: item.usuario?.nome,
      usuario_email: item.usuario?.email
    })),
    total: count || 0,
    pagina,
    limite,
    total_paginas: Math.ceil((count || 0) / limite)
  });
}));

app.use('/api/logs', logsRouter);

const romaneiosRouter = express.Router();
romaneiosRouter.use(requireAuth);

romaneiosRouter.get('/', asyncRoute(async (req, res) => {
  const tipo = req.query.tipo === 'historico' ? 'historico' : 'ativos';
  const today = todayISO();

  let query = supabase
    .from('romaneios')
    .select('*, usuario:usuarios(nome), transportadora:transportadoras(nome_fantasia)')
    .order('created_at', { ascending: false });

  query = tipo === 'ativos' ? query.eq('data_romaneio', today) : query.lt('data_romaneio', today);

  if (req.user.is_despachante && req.user.transportadora_id) {
    query = query.eq('transportadora_id', req.user.transportadora_id);
  }

  const { data, error } = await query;
  if (error) throw error;
  apiOk(res, { data: (data || []).map(normalizeRomaneio) });
}));

romaneiosRouter.get('/auditoria', requireAdmin, asyncRoute(async (_req, res) => {
  const { data, error } = await supabase
    .from('romaneio_logs')
    .select('*, usuario:usuarios(nome), romaneio:romaneios(gaiola,vaga,transportadora:transportadoras(nome_fantasia))')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  apiOk(res, {
    data: (data || []).map((item) => ({
      ...item,
      usuario_nome: item.usuario?.nome,
      gaiola: item.romaneio?.gaiola,
      vaga: item.romaneio?.vaga,
      transportadora_nome: item.romaneio?.transportadora?.nome_fantasia
    }))
  });
}));

romaneiosRouter.post('/upload', upload.single('csv_file'), asyncRoute(async (req, res) => {
  if (req.user.is_despachante && !req.user.transportadora_id) {
    return apiFail(res, 'Seu usuario despachante nao possui nenhuma transportadora atrelada. Contate o administrador.');
  }

  if (!req.file) return apiFail(res, 'Erro ao fazer upload do arquivo. Selecione um arquivo CSV valido.');

  let transportadoraId = req.user.transportadora_id;
  if (!req.user.is_despachante && !transportadoraId) {
    transportadoraId = await primeiraTransportadoraId();
    if (!transportadoraId) return apiFail(res, 'Cadastre pelo menos uma Transportadora no sistema antes de importar Romaneios.');
  }

  const content = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
  const rows = parse(content, { skip_empty_lines: true, relax_column_count: true, trim: true });
  const dataRows = rows.slice(1);

  const payload = dataRows
    .filter((row) => row.length >= 5)
    .map((row) => ({
      usuario_id: req.user.id,
      transportadora_id: transportadoraId,
      onda: cleanText(row[0]),
      vaga: cleanText(row[1]),
      gaiola: cleanText(row[2]),
      regiao: cleanText(row[3]),
      bairros_devolucao: cleanText(row[4]) || null,
      veiculo: cleanText(row[5]) || null,
      paradas: Number.parseInt(row[6], 10) || 0,
      data_romaneio: todayISO()
    }))
    .filter((row) => row.onda && row.vaga && row.gaiola && row.regiao);

  if (!payload.length) return apiFail(res, 'Arquivo CSV vazio ou sem registros validos.');

  const { error } = await supabase.from('romaneios').insert(payload);
  if (error) throw error;
  await logAction(req, 'ROMANEIO_UPLOAD', `Importou um romaneio CSV contendo ${payload.length} registros.`);
  apiOk(res, { message: `Importacao concluida com sucesso! ${payload.length} romaneios cadastrados.` });
}));

romaneiosRouter.put('/:id', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const romaneio = await getRomaneioForUser(id, req.user);
  const placa = cleanText(req.body.placa).toUpperCase() || null;
  const rota = cleanText(req.body.rota) || null;
  const horarioCorte = await getHorarioCorte();
  const foraDoHorario = isAfterCutoff(horarioCorte);
  const alteracoes = [];

  if ((romaneio.placa || '') !== (placa || '')) {
    await logRomaneioChange({ romaneioId: id, usuarioId: req.user.id, campo: 'placa', anterior: romaneio.placa, novo: placa, foraDoHorario });
    alteracoes.push(`Placa de '${romaneio.placa || ''}' para '${placa || ''}'`);
  }
  if ((romaneio.rota || '') !== (rota || '')) {
    await logRomaneioChange({ romaneioId: id, usuarioId: req.user.id, campo: 'rota', anterior: romaneio.rota, novo: rota, foraDoHorario });
    alteracoes.push(`Rota de '${romaneio.rota || ''}' para '${rota || ''}'`);
  }

  const { error } = await supabase.from('romaneios').update({ placa, rota }).eq('id', id);
  if (error) throw error;

  if (alteracoes.length) {
    let desc = `Alterou dados do romaneio (Gaiola: ${romaneio.gaiola}, Vaga: ${romaneio.vaga}): ${alteracoes.join(', ')}`;
    if (foraDoHorario) desc += ` [ATENCAO: Realizado apos horario limite de ${horarioCorte}]`;
    await logAction(req, 'ROMANEIO_UPDATE', desc);
  }

  apiOk(res, { message: 'Romaneio atualizado com sucesso!', fora_do_horario: foraDoHorario });
}));

romaneiosRouter.put('/:id/geral', asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const romaneio = await getRomaneioForUser(id, req.user);
  const horarioCorte = await getHorarioCorte();
  const foraDoHorario = isAfterCutoff(horarioCorte);

  const update = {
    onda: cleanText(req.body.onda),
    vaga: cleanText(req.body.vaga),
    gaiola: cleanText(req.body.gaiola),
    regiao: cleanText(req.body.regiao),
    bairros_devolucao: cleanText(req.body.bairros_devolucao) || null,
    veiculo: cleanText(req.body.veiculo) || null,
    paradas: Number.parseInt(req.body.paradas, 10) || 0,
    placa: cleanText(req.body.placa).toUpperCase() || null,
    rota: cleanText(req.body.rota) || null,
    transportadora_id: req.user.is_despachante
      ? romaneio.transportadora_id
      : Number(req.body.transportadora_id || romaneio.transportadora_id)
  };

  if (!update.onda || !update.vaga || !update.gaiola || !update.regiao) {
    return apiFail(res, 'Campos obrigatorios (Onda, Vaga, Gaiola e Regiao) devem ser preenchidos.');
  }

  const campos = ['onda', 'vaga', 'gaiola', 'regiao', 'bairros_devolucao', 'veiculo', 'paradas', 'placa', 'rota', 'transportadora_id'];
  const alteracoes = [];

  for (const campo of campos) {
    const anterior = romaneio[campo] == null ? '' : String(romaneio[campo]);
    const novo = update[campo] == null ? '' : String(update[campo]);
    if (anterior !== novo) {
      await logRomaneioChange({ romaneioId: id, usuarioId: req.user.id, campo, anterior: romaneio[campo], novo: update[campo], foraDoHorario });
      alteracoes.push(`${campo} de '${anterior}' para '${novo}'`);
    }
  }

  const { error } = await supabase.from('romaneios').update(update).eq('id', id);
  if (error) throw error;

  if (alteracoes.length) {
    let desc = `Editou romaneio geral (Gaiola: ${update.gaiola}, Vaga: ${update.vaga}): ${alteracoes.join(', ')}`;
    if (foraDoHorario) desc += ` [ATENCAO: Realizado apos horario limite de ${horarioCorte}]`;
    await logAction(req, 'ROMANEIO_UPDATE_GERAL', desc);
  }

  apiOk(res, { message: 'Romaneio editado e atualizado com sucesso!', fora_do_horario: foraDoHorario });
}));

romaneiosRouter.delete('/', asyncRoute(async (req, res) => {
  let ids = req.body.ids || [];
  if (!Array.isArray(ids)) ids = [ids];
  ids = ids.map(Number).filter(Boolean);
  if (!ids.length) return apiFail(res, 'Identificadores de romaneio nao informados.');

  if (req.user.is_despachante && req.user.transportadora_id) {
    const { data, error } = await supabase
      .from('romaneios')
      .select('id,transportadora_id')
      .in('id', ids);
    if (error) throw error;
    if ((data || []).some((item) => Number(item.transportadora_id) !== Number(req.user.transportadora_id))) {
      return apiFail(res, 'Acesso negado. Voce tentou excluir romaneios de outras transportadoras.');
    }
  }

  const { data, error } = await supabase.from('romaneios').delete().in('id', ids).select('id');
  if (error) throw error;
  const deletedCount = data?.length || 0;
  await logAction(req, 'ROMANEIO_DELETE', `Excluiu ${deletedCount} romaneio(s) do sistema (IDs: ${ids.join(', ')}).`);
  apiOk(res, { message: `${deletedCount} romaneio(s) excluido(s) com sucesso!` });
}));

app.use('/api/romaneios', romaneiosRouter);

const docasRouter = express.Router();

docasRouter.get('/status', asyncRoute(async (_req, res) => {
  const [{ data: docas, error: docasError }, { data: ativas, error: ativasError }, { data: filas, error: filasError }] = await Promise.all([
    supabase.from('docas').select('*').eq('ativa', true).order('id'),
    supabase
      .from('doca_operacoes')
      .select('*')
      .in('status', ['aguardando_doca', 'na_fila', 'carregando'])
      .eq('posicao_fila', 0)
      .order('created_at', { ascending: false }),
    supabase
      .from('doca_operacoes')
      .select('doca_id,placa,transportadora_nome,onda,rota,posicao_fila')
      .eq('status', 'na_fila')
      .gt('posicao_fila', 0)
      .order('doca_id')
      .order('posicao_fila')
  ]);

  if (docasError) throw docasError;
  if (ativasError) throw ativasError;
  if (filasError) throw filasError;

  const operacaoPorDoca = new Map();
  for (const op of ativas || []) {
    if (!operacaoPorDoca.has(op.doca_id)) operacaoPorDoca.set(op.doca_id, op);
  }

  const filasPorDoca = new Map();
  for (const fila of filas || []) {
    const list = filasPorDoca.get(fila.doca_id) || [];
    list.push(fila);
    filasPorDoca.set(fila.doca_id, list);
  }

  const now = new Date();
  const data = (docas || []).map((doca) => {
    const op = operacaoPorDoca.get(doca.id);
    return {
      doca_id: doca.id,
      doca_nome: doca.nome,
      op_id: op?.id || null,
      placa: op?.placa || null,
      transportadora_nome: op?.transportadora_nome || null,
      onda: op?.onda || null,
      rota: op?.rota || null,
      regiao: op?.regiao || null,
      status: op?.status || null,
      posicao_fila: op?.posicao_fila || 0,
      entrada_cd_at: op?.entrada_cd_at || null,
      carregando_at: op?.carregando_at || null,
      min_carregando: minutesBetween(op?.carregando_at, now),
      min_no_cd: minutesBetween(op?.entrada_cd_at, now),
      fila: filasPorDoca.get(doca.id) || []
    };
  });

  apiOk(res, { data, timestamp: new Date().toISOString() });
}));

docasRouter.get('/', asyncRoute(async (_req, res) => {
  const { data, error } = await supabase.from('docas').select('*').eq('ativa', true).order('id');
  if (error) throw error;

  const { data: ocupadas, error: ocupError } = await supabase
    .from('doca_operacoes')
    .select('doca_id')
    .in('status', ['aguardando_doca', 'na_fila', 'carregando'])
    .eq('posicao_fila', 0);
  if (ocupError) throw ocupError;

  const occupied = new Set((ocupadas || []).map((item) => item.doca_id));
  apiOk(res, { data: (data || []).map((doca) => ({ ...doca, ocupada: occupied.has(doca.id) ? 1 : 0 })) });
}));

docasRouter.get('/historico', requireAuth, asyncRoute(async (_req, res) => {
  const { data, error } = await supabase
    .from('doca_operacoes')
    .select('*, doca:docas(nome)')
    .eq('status', 'concluido')
    .order('saida_cd_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  apiOk(res, { data: (data || []).map((item) => ({ ...item, doca_nome: item.doca?.nome })) });
}));

docasRouter.post('/porteiro-entrada', asyncRoute(async (req, res) => {
  const placa = cleanText(req.body.placa).toUpperCase();
  if (!placa) return apiFail(res, 'Placa obrigatoria.');

  const { data: ativa, error: ativaError } = await supabase
    .from('doca_operacoes')
    .select('id')
    .eq('placa', placa)
    .in('status', ['aguardando_doca', 'na_fila', 'carregando'])
    .limit(1);
  if (ativaError) throw ativaError;
  if (ativa?.length) return apiFail(res, `Placa ${placa} ja possui check-in ativo. Verifique se e um checkout.`);

  const { data: romaneio, error: romError } = await supabase
    .from('romaneios')
    .select('id,onda,rota,regiao,bairros_devolucao,transportadora_id,transportadora:transportadoras(nome_fantasia)')
    .eq('placa', placa)
    .eq('data_romaneio', todayISO())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (romError) throw romError;

  const { data: op, error } = await supabase
    .from('doca_operacoes')
    .insert({
      placa,
      romaneio_id: romaneio?.id || null,
      transportadora_nome: romaneio?.transportadora?.nome_fantasia || null,
      onda: romaneio?.onda || null,
      rota: romaneio?.rota || null,
      regiao: romaneio?.regiao || null,
      bairros_devolucao: romaneio?.bairros_devolucao || null,
      status: 'aguardando_doca',
      posicao_fila: 0,
      entrada_cd_at: new Date().toISOString(),
      criado_por: req.user?.id || null
    })
    .select('id')
    .single();
  if (error) throw error;

  apiOk(res, {
    message: `Check-in de entrada realizado! Placa: ${placa}`,
    op_id: op.id,
    tem_romaneio: Boolean(romaneio),
    dados: romaneio || null
  });
}));

docasRouter.post('/selecionar-doca', optionalAuth, asyncRoute(async (req, res) => {
  const placa = cleanText(req.body.placa).toUpperCase();
  const docaId = Number(req.body.doca_id || 0);
  const forcar = toBool(req.body.forcar);
  if (!placa || !docaId) return apiFail(res, 'Placa e Doca obrigatorios.');

  const { data: op, error: opError } = await supabase
    .from('doca_operacoes')
    .select('id')
    .eq('placa', placa)
    .in('status', ['aguardando_doca', 'na_fila'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (opError) throw opError;
  if (!op) return apiFail(res, 'Operacao nao encontrada para esta placa.');

  const { data: ocupante, error: ocupError } = await supabase
    .from('doca_operacoes')
    .select('id,placa')
    .eq('doca_id', docaId)
    .in('status', ['aguardando_doca', 'na_fila', 'carregando'])
    .eq('posicao_fila', 0)
    .limit(1)
    .maybeSingle();
  if (ocupError) throw ocupError;

  if (ocupante && !forcar) {
    return apiFail(res, `Doca ocupada pelo veiculo ${ocupante.placa}. Deseja colocar na fila ou selecionar outra doca?`, 409, {
      doca_ocupada: true,
      op_id: op.id
    });
  }

  if (ocupante) {
    const { data: fila, error: filaError } = await supabase
      .from('doca_operacoes')
      .select('posicao_fila')
      .eq('doca_id', docaId)
      .eq('status', 'na_fila')
      .order('posicao_fila', { ascending: false })
      .limit(1);
    if (filaError) throw filaError;
    const posicao = ((fila || [])[0]?.posicao_fila || 0) + 1;

    const { error } = await supabase
      .from('doca_operacoes')
      .update({ doca_id: docaId, status: 'na_fila', posicao_fila: posicao })
      .eq('id', op.id);
    if (error) throw error;

    return apiOk(res, {
      na_fila: true,
      posicao,
      message: `Veiculo ${placa} colocado na fila (posicao ${posicao}) da doca.`
    });
  }

  const { error } = await supabase
    .from('doca_operacoes')
    .update({ doca_id: docaId, status: 'aguardando_doca', posicao_fila: 0 })
    .eq('id', op.id);
  if (error) throw error;

  apiOk(res, {
    na_fila: false,
    message: `Veiculo ${placa} direcionado para a doca. Aguardando motorista escanear QR da doca.`
  });
}));

docasRouter.post('/motorista-checkin-doca', asyncRoute(async (req, res) => {
  const placa = cleanText(req.body.placa).toUpperCase();
  const docaId = Number(req.body.doca_id || 0);
  if (!placa || !docaId) return apiFail(res, 'Dados insuficientes.');

  const { data: op, error: opError } = await supabase
    .from('doca_operacoes')
    .select('id,status')
    .eq('placa', placa)
    .eq('doca_id', docaId)
    .in('status', ['aguardando_doca', 'na_fila'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (opError) throw opError;
  if (!op) return apiFail(res, 'Nenhuma operacao ativa encontrada para esta placa nesta doca.');
  if (op.status === 'na_fila') return apiFail(res, 'Voce esta na fila. Aguarde sua vez.', 409, { na_fila: true });

  const { error } = await supabase
    .from('doca_operacoes')
    .update({ status: 'carregando', carregando_at: new Date().toISOString() })
    .eq('id', op.id);
  if (error) throw error;

  apiOk(res, { message: 'Carregamento iniciado! A doca foi liberada para voce.', op_id: op.id });
}));

docasRouter.post('/porteiro-saida', asyncRoute(async (req, res) => {
  const placa = cleanText(req.body.placa).toUpperCase();
  if (!placa) return apiFail(res, 'Placa obrigatoria.');

  const { data: op, error: opError } = await supabase
    .from('doca_operacoes')
    .select('id,entrada_cd_at,carregando_at,doca_id')
    .eq('placa', placa)
    .in('status', ['aguardando_doca', 'na_fila', 'carregando'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (opError) throw opError;
  if (!op) return apiFail(res, `Nenhuma operacao ativa para a placa ${placa}.`);

  const now = new Date();
  const tempoCd = minutesBetween(op.entrada_cd_at, now);
  const tempoCarga = minutesBetween(op.carregando_at, now);

  const { error } = await supabase
    .from('doca_operacoes')
    .update({
      status: 'concluido',
      saida_cd_at: now.toISOString(),
      tempo_total_min: tempoCd,
      tempo_carga_min: tempoCarga
    })
    .eq('id', op.id);
  if (error) throw error;

  if (op.doca_id) {
    const { data: proximo, error: proxError } = await supabase
      .from('doca_operacoes')
      .select('id')
      .eq('doca_id', op.doca_id)
      .eq('status', 'na_fila')
      .order('posicao_fila')
      .limit(1)
      .maybeSingle();
    if (proxError) throw proxError;
    if (proximo) {
      const { error: advanceError } = await supabase
        .from('doca_operacoes')
        .update({ status: 'aguardando_doca', posicao_fila: 0 })
        .eq('id', proximo.id);
      if (advanceError) throw advanceError;
    }
  }

  apiOk(res, {
    message: `Checkout realizado! Placa: ${placa}`,
    tempo_total_min: tempoCd,
    tempo_carga_min: tempoCarga
  });
}));

docasRouter.post('/importar-csv', requireAuth, upload.single('csv_docas'), asyncRoute(async (req, res) => {
  if (!req.file) return apiFail(res, 'Arquivo CSV nao enviado.');
  const rows = parse(req.file.buffer.toString('utf8').replace(/^\uFEFF/, ''), { skip_empty_lines: true, relax_column_count: true, trim: true });
  const nomes = rows
    .filter((row, index) => !(index === 0 && ['nome', 'doca'].includes(String(row[0] || '').toLowerCase())))
    .map((row) => cleanText(row[0]))
    .filter(Boolean);

  if (!nomes.length) return apiFail(res, 'Nenhuma doca encontrada no arquivo.');
  const { error } = await supabase.from('docas').upsert(nomes.map((nome) => ({ nome, ativa: true })), { onConflict: 'nome' });
  if (error) throw error;
  apiOk(res, { message: `${nomes.length} doca(s) importada(s).`, erros: [] });
}));

docasRouter.post('/verificar-qr', asyncRoute(async (req, res) => {
  const placa = cleanText(req.body.placa).toUpperCase();
  if (!placa) return apiFail(res, 'Placa nao informada.');

  const { data: op, error } = await supabase
    .from('doca_operacoes')
    .select('id,status,posicao_fila,entrada_cd_at,carregando_at,doca_id,doca:docas(nome)')
    .eq('placa', placa)
    .in('status', ['aguardando_doca', 'na_fila', 'carregando'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  apiOk(res, {
    placa,
    operacao: op ? { ...op, doca_nome: op.doca?.nome } : null,
    tem_operacao_ativa: Boolean(op)
  });
}));

app.use('/api/docas', docasRouter);

const motoristaRouter = express.Router();

motoristaRouter.get('/buscar-placa', asyncRoute(async (req, res) => {
  const placa = cleanText(req.query.placa).toUpperCase();
  if (!placa) return apiFail(res, 'Placa nao informada.');

  const [{ data: romaneio, error: romError }, { data: operacao, error: opError }] = await Promise.all([
    supabase
      .from('romaneios')
      .select('id,onda,vaga,gaiola,regiao,bairros_devolucao,veiculo,placa,rota,paradas,transportadora:transportadoras(nome_fantasia)')
      .eq('placa', placa)
      .eq('data_romaneio', todayISO())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('doca_operacoes')
      .select('id,status,posicao_fila,doca_id,entrada_cd_at,carregando_at,doca:docas(nome)')
      .eq('placa', placa)
      .in('status', ['aguardando_doca', 'na_fila', 'carregando'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (romError) throw romError;
  if (opError) throw opError;
  if (!romaneio && !operacao) return apiFail(res, `Nenhum romaneio ativo encontrado para a placa ${placa}.`, 404);

  apiOk(res, {
    placa,
    romaneio: romaneio ? { ...romaneio, transportadora_nome: romaneio.transportadora?.nome_fantasia } : null,
    operacao: operacao ? { ...operacao, doca_nome: operacao.doca?.nome } : null
  });
}));

motoristaRouter.get('/status-placa', asyncRoute(async (req, res) => {
  const placa = cleanText(req.query.placa).toUpperCase();
  if (!placa) return apiFail(res, 'Placa nao informada.');

  const { data, error } = await supabase
    .from('doca_operacoes')
    .select('id,status,posicao_fila,doca_id,entrada_cd_at,carregando_at,saida_cd_at,doca:docas(nome)')
    .eq('placa', placa)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  apiOk(res, { placa, operacao: data ? { ...data, doca_nome: data.doca?.nome } : null });
}));

motoristaRouter.post('/reporte', upload.fields([
  { name: 'foto1', maxCount: 1 },
  { name: 'foto2', maxCount: 1 },
  { name: 'foto3', maxCount: 1 }
]), asyncRoute(async (req, res) => {
  const placa = cleanText(req.body.placa).toUpperCase();
  const romaneioId = req.body.romaneio_id ? Number(req.body.romaneio_id) : null;
  const observacao = cleanText(req.body.observacao);
  if (!placa) return apiFail(res, 'Placa obrigatoria.');
  if (!observacao) return apiFail(res, 'Observacao obrigatoria.');

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const urls = {};
  for (let i = 1; i <= 3; i += 1) {
    const file = req.files?.[`foto${i}`]?.[0];
    if (file) {
      if (!allowed.includes(file.mimetype)) return apiFail(res, `Foto ${i} tem formato invalido.`);
      urls[`foto${i}_url`] = await uploadFileToSupabase(file, `reportes/${placa}`);
      urls[`foto${i}_mime`] = file.mimetype;
    }
  }

  const { error } = await supabase.from('motorista_reportes').insert({
    romaneio_id: romaneioId,
    placa,
    observacao,
    ...urls
  });
  if (error) throw error;
  apiOk(res, { message: 'Reporte enviado com sucesso!' });
}));

motoristaRouter.get('/reportes', asyncRoute(async (req, res) => {
  const romaneioId = req.query.romaneio_id ? Number(req.query.romaneio_id) : null;
  const placa = cleanText(req.query.placa).toUpperCase();
  if (!romaneioId && !placa) return apiFail(res, 'Informe romaneio_id ou placa.');

  let query = supabase.from('motorista_reportes').select('*').order('created_at', { ascending: false });
  query = romaneioId ? query.eq('romaneio_id', romaneioId) : query.eq('placa', placa);

  const { data, error } = await query;
  if (error) throw error;
  apiOk(res, { data });
}));

motoristaRouter.post('/reportes/lido', asyncRoute(async (req, res) => {
  const romaneioId = req.body.romaneio_id ? Number(req.body.romaneio_id) : null;
  const placa = cleanText(req.body.placa).toUpperCase();
  if (!romaneioId && !placa) return apiFail(res, 'Dados insuficientes.');

  let query = supabase.from('motorista_reportes').update({ lido: true });
  query = romaneioId ? query.eq('romaneio_id', romaneioId) : query.eq('placa', placa);

  const { error } = await query;
  if (error) throw error;
  apiOk(res, { message: 'Marcado como lido.' });
}));

motoristaRouter.get('/pendentes', asyncRoute(async (_req, res) => {
  const { data, error } = await supabase
    .from('motorista_reportes')
    .select('romaneio_id,placa')
    .eq('lido', false);
  if (error) throw error;

  const grouped = new Map();
  for (const item of data || []) {
    const key = `${item.romaneio_id || ''}:${item.placa}`;
    const current = grouped.get(key) || { romaneio_id: item.romaneio_id, placa: item.placa, total: 0 };
    current.total += 1;
    grouped.set(key, current);
  }

  apiOk(res, { data: [...grouped.values()] });
}));

app.use('/api/motorista', motoristaRouter);

app.get('/api/health', (_req, res) => {
  apiOk(res, { service: 'sigo-server', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  apiFail(res, 'Rota nao encontrada.', 404);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  apiFail(res, err.message || 'Erro interno no servidor.', err.status || 500);
});

export default app;
