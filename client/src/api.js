const API_URL = import.meta.env.VITE_API_URL || '';

export function getToken() {
  return localStorage.getItem('sigo_token');
}

export function setSession(token, user) {
  if (token) localStorage.setItem('sigo_token', token);
  if (user) localStorage.setItem('sigo_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('sigo_token');
  localStorage.removeItem('sigo_user');
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('sigo_user') || 'null');
  } catch {
    return null;
  }
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  const isForm = options.body instanceof FormData;

  if (!isForm && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body: isForm || typeof options.body === 'string' ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || 'Erro ao processar a solicitacao.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(`${value}T00:00:00`));
}
