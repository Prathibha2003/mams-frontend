const BASE = import.meta.env.VITE_API_URL || ''

export const session = {
  get user() { try { return JSON.parse(localStorage.getItem('user')) } catch { return null } },
  set(u) { localStorage.setItem('user', JSON.stringify(u)) },
  clear() { localStorage.removeItem('user') },
}

export async function api(path, { method = 'GET', body, params } = {}) {
  const q = params
    ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    : ''
  const u = session.user
  const res = await fetch(BASE + path + q, {
    method,
    headers: { 'Content-Type': 'application/json', ...(u ? { Authorization: 'Bearer ' + u.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && path !== '/api/auth/login' && u) { session.clear(); location.reload() }
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    throw new Error(data?.message || (res.status === 403 ? 'You do not have access to this.' : 'Request failed (' + res.status + ')'))
  }
  return data?.content ?? data
}
