import { useState, useEffect, useCallback } from 'react'
import { api, session } from './api'

const today = () => new Date().toISOString().slice(0, 10)

function Table({ rows }) {
  if (!rows?.length) return <p className="muted">No records found.</p>
  const cols = Object.keys(rows[0]).filter(k => typeof rows[0][k] !== 'object' || rows[0][k] === null)
  return (
    <div className="scroll">
      <table>
        <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.id ?? i}>{cols.map(c => <td key={c}>{String(r[c] ?? '')}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function useRefs() {
  const [bases, setBases] = useState([])
  const [types, setTypes] = useState([])
  useEffect(() => {
    api('/api/bases').then(setBases).catch(() => {})
    api('/api/equipment-types').then(setTypes).catch(() => {})
  }, [])
  return { bases, types }
}

function Select({ label, value, onChange, options, all = 'All' }) {
  return (
    <label>{label}
      <select value={value} onChange={e => onChange(e.target.value)}>
        {all !== null && <option value="">{all}</option>}
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  )
}

function Filters({ f, setF, refs, user }) {
  const set = k => v => setF({ ...f, [k]: v })
  return (
    <div className="filters">
      <label>From<input type="date" value={f.from} onChange={e => set('from')(e.target.value)} /></label>
      <label>To<input type="date" value={f.to} onChange={e => set('to')(e.target.value)} /></label>
      {user.role === 'ADMIN' && <Select label="Base" value={f.baseId} onChange={set('baseId')} options={refs.bases} />}
      <Select label="Equipment" value={f.equipmentTypeId} onChange={set('equipmentTypeId')} options={refs.types} />
    </div>
  )
}

function Login({ onLogin }) {
  const [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState('')
  const submit = async e => {
    e.preventDefault()
    try { onLogin(await api('/api/auth/login', { method: 'POST', body: { username: u, password: p } })) }
    catch (x) { setErr('Invalid username or password') }
  }
  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>MAMS</h1>
        <p className="muted">Military Asset Management System</p>
        <input placeholder="Username" value={u} onChange={e => setU(e.target.value)} />
        <input placeholder="Password" type="password" value={p} onChange={e => setP(e.target.value)} />
        {err && <div className="error">{err}</div>}
        <button>Sign in</button>
      </form>
    </div>
  )
}

function Dashboard({ user, refs }) {
  const [f, setF] = useState({ from: '', to: '', baseId: '', equipmentTypeId: '' })
  const [d, setD] = useState(null), [err, setErr] = useState(''), [open, setOpen] = useState(false)
  const [detail, setDetail] = useState({})
  useEffect(() => {
    setErr('')
    api('/api/dashboard', { params: f }).then(setD).catch(e => setErr(e.message))
  }, [f])
  const showNet = async () => {
    setOpen(true)
    const get = p => api(p, { params: f }).catch(() => [])
    setDetail({ purchases: await get('/api/purchases'), transfers: await get('/api/transfers') })
  }
  const cards = d ? [
    ['Opening Balance', d.openingBalance], ['Closing Balance', d.closingBalance],
    ['Net Movement', d.netMovement, showNet], ['Assigned', d.assigned], ['Expended', d.expended],
  ] : []
  return (
    <>
      <h2>Dashboard</h2>
      <Filters f={f} setF={setF} refs={refs} user={user} />
      {err && <div className="error">{err}</div>}
      <div className="grid">
        {cards.map(([t, v, click]) => (
          <div key={t} className={'card stat' + (click ? ' click' : '')} onClick={click}>
            <span className="muted">{t}</span><strong>{v}</strong>{click && <small>Click for details</small>}
          </div>
        ))}
      </div>
      {open && d && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal card" onClick={e => e.stopPropagation()}>
            <h3>Net Movement</h3>
            <div className="grid">
              <div className="card stat"><span className="muted">Purchases</span><strong>{d.purchases}</strong></div>
              <div className="card stat"><span className="muted">Transfer In</span><strong>{d.transferIn}</strong></div>
              <div className="card stat"><span className="muted">Transfer Out</span><strong>{d.transferOut}</strong></div>
            </div>
            <h4>Purchases</h4><Table rows={detail.purchases} />
            <h4>Transfers</h4><Table rows={detail.transfers} />
            <button onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  )
}

/* Generic list + form page. fields: text/number inputs or 'type' / 'base' selects. */
function RecordPage({ title, path, fields, user, refs, filterable = true }) {
  const [f, setF] = useState({ from: '', to: '', baseId: '', equipmentTypeId: '' })
  const [rows, setRows] = useState([]), [form, setForm] = useState({}), [msg, setMsg] = useState(null)
  const needsBase = ['/api/purchases', '/api/expenditures', '/api/assignments'].includes(path)
  const load = useCallback(() => api(path, { params: f }).then(setRows).catch(e => setMsg({ bad: true, t: e.message })), [path, f])
  useEffect(() => { load() }, [load])
  const submit = async e => {
    e.preventDefault(); setMsg(null)
    const body = { ...form }
    fields.forEach(x => { if (x.kind === 'number' || x.kind === 'type' || x.kind === 'base') body[x.name] = Number(body[x.name]) })
    if (needsBase) {
      body.baseId = user.role === 'ADMIN' ? Number(form.baseId) : user.baseId
    }
    try { await api(path, { method: 'POST', body }); setMsg({ t: 'Saved.' }); setForm({}); load() }
    catch (x) { setMsg({ bad: true, t: x.message }) }
  }
  const opts = k => (k === 'type' ? refs.types : refs.bases.filter(b => b.id !== user.baseId))
  return (
    <>
      <h2>{title}</h2>
      <form className="card formrow" onSubmit={submit}>
        {user.role === 'ADMIN' && needsBase &&
          <Select label="Base" all="Select…" value={form.baseId || ''} onChange={v => setForm({ ...form, baseId: v })} options={refs.bases} />}
        {fields.map(x => x.kind === 'type' || x.kind === 'base'
          ? <Select key={x.name} label={x.label} all="Select…" value={form[x.name] || ''} onChange={v => setForm({ ...form, [x.name]: v })} options={opts(x.kind)} />
          : <label key={x.name}>{x.label}
              <input type={x.kind === 'number' ? 'number' : 'text'} min="1" value={form[x.name] || ''} onChange={e => setForm({ ...form, [x.name]: e.target.value })} />
            </label>)}
        <button>Save</button>
      </form>
      {msg && <div className={msg.bad ? 'error' : 'ok'}>{msg.t}</div>}
      {filterable && <Filters f={f} setF={setF} refs={refs} user={user} />}
      <div className="card"><Table rows={rows} /></div>
    </>
  )
}

const T = { name: 'equipmentTypeId', label: 'Equipment', kind: 'type' }
const Q = { name: 'quantity', label: 'Quantity', kind: 'number' }

function Audit() {
  const [rows, setRows] = useState([]), [err, setErr] = useState('')
  useEffect(() => { api('/api/audit-logs', { params: { size: 100 } }).then(setRows).catch(e => setErr(e.message)) }, [])
  return <><h2>Audit Log</h2>{err && <div className="error">{err}</div>}<div className="card"><Table rows={rows} /></div></>
}

export default function App() {
  const [user, setUser] = useState(session.user)
  const [page, setPage] = useState(null), [menu, setMenu] = useState(false)
  const refs = useRefs()
  if (!user) return <Login onLogin={u => { session.set(u); setUser(u) }} />

  const all = {
    dashboard: 'Dashboard', purchases: 'Purchases', transfers: 'Transfers',
    assignments: 'Assignments', expenditures: 'Expenditures', audit: 'Audit Log',
  }
  const allowed = {
    ADMIN: Object.keys(all),
    BASE_COMMANDER: ['dashboard', 'purchases', 'transfers', 'assignments', 'expenditures'],
    LOGISTICS_OFFICER: ['purchases', 'transfers'],
  }[user.role] || ['purchases']
  const current = allowed.includes(page) ? page : allowed[0]

  const views = {
    dashboard: <Dashboard user={user} refs={refs} />,
    purchases: <RecordPage title="Purchases" path="/api/purchases" fields={[T, Q, { name: 'supplier', label: 'Supplier' }]} user={user} refs={refs} />,
    transfers: <RecordPage title="Transfers" path="/api/transfers" fields={[{ name: 'toBaseId', label: 'To base', kind: 'base' }, T, Q]} user={user} refs={refs} />,
    assignments: <RecordPage title="Assignments" path="/api/assignments" fields={[T, Q, { name: 'assignedTo', label: 'Assigned to (personnel)' }]} user={user} refs={refs} />,
    expenditures: <RecordPage title="Expenditures" path="/api/expenditures" fields={[T, Q, { name: 'reason', label: 'Reason' }]} user={user} refs={refs} />,
    audit: <Audit />,
  }

  return (
    <div className="app">
      <header>
        <button className="burger" onClick={() => setMenu(!menu)}>☰</button>
        <b>MAMS</b>
        <span className="who">{user.fullName} · {user.role.replace('_', ' ')}{user.baseName ? ' · ' + user.baseName : ''}</span>
        <button className="ghost" onClick={() => { session.clear(); setUser(null) }}>Log out</button>
      </header>
      <div className="body">
        <nav className={menu ? 'open' : ''}>
          {allowed.map(k => (
            <a key={k} className={k === current ? 'active' : ''} onClick={() => { setPage(k); setMenu(false) }}>{all[k]}</a>
          ))}
        </nav>
        <main key={current}>{views[current]}</main>
      </div>
    </div>
  )
}
