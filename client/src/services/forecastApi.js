import { api } from '../api.js';

function queryString(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const forecastApi = {
  listPlanos(filters) {
    return api(`/api/forecast/planos${queryString(filters)}`);
  },
  getPlano(id) {
    return api(`/api/forecast/planos/${id}`);
  },
  createPlano(body) {
    return api('/api/forecast/planos', { method: 'POST', body });
  },
  updatePlano(id, body) {
    return api(`/api/forecast/planos/${id}`, { method: 'PUT', body });
  },
  deletePlano(id) {
    return api(`/api/forecast/planos/${id}`, { method: 'DELETE' });
  },
  importar(body) {
    return api('/api/forecast/importar', { method: 'POST', body });
  },
  previsao(body) {
    return api('/api/forecast/previsao', { method: 'POST', body });
  },
  dashboard(filters) {
    return api(`/api/forecast/dashboard${queryString(filters)}`);
  },
  historico(filters) {
    return api(`/api/forecast/historico${queryString(filters)}`);
  },
  simulador(body) {
    return api('/api/forecast/simulador', { method: 'POST', body });
  }
};

export function formatNumber(value, digits = 0) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(number);
}

export function riskClass(status) {
  if (status === 'Risco Alto') return 'high';
  if (status === 'Equilibrado') return 'balanced';
  if (status === 'Sobra de Capacidade') return 'ok';
  return 'neutral';
}

export function calculateLocalForecast({ total_planejado, volume_previsto, produtividade_media, abs_percentual, abs_pessoas }) {
  const total = Number(total_planejado || 0);
  const volume = Number(volume_previsto || 0);
  const produtividade = Number(produtividade_media || 0);
  const abs = abs_pessoas !== '' && abs_pessoas !== null && abs_pessoas !== undefined
    ? Number(abs_pessoas || 0)
    : total * (Number(abs_percentual || 0) / 100);
  const pessoas = Math.max(total - abs, 0);
  const capacidade = pessoas * produtividade;
  const necessidade = produtividade > 0 ? volume / produtividade : 0;
  const gap = pessoas - necessidade;
  return {
    pessoas_disponiveis: round(pessoas),
    capacidade_prevista: round(capacidade),
    necessidade_pessoas: round(necessidade),
    gap: round(gap),
    status_risco: gap < 0 ? 'Risco Alto' : gap === 0 ? 'Equilibrado' : 'Sobra de Capacidade'
  };
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
