// Login portal + role-based access control
const { useState, useEffect, createContext, useContext } = React;

// Role definitions with privilege matrices
const ROLES = {
  director: {
    label: 'Regional Director',
    badge: 'Director',
    color: 'oklch(50% 0.13 235)',
    privileges: {
      viewAllDistricts: true,
      viewFinancials: true,
      viewNRW: true,
      viewArrears: true,
      viewCustomers: true,
      editData: true,
      approveEntries: true,
      manageUsers: true,
      exportData: true,
    },
    districts: 'all'
  },
  manager: {
    label: 'District Manager',
    badge: 'District Mgr',
    color: 'oklch(55% 0.13 175)',
    privileges: {
      viewAllDistricts: false,
      viewFinancials: true,
      viewNRW: true,
      viewArrears: true,
      viewCustomers: true,
      editData: true,
      approveEntries: true,
      manageUsers: false,
      exportData: true,
    },
    districts: 'assigned'
  },
  officer: {
    label: 'Commercial Officer',
    badge: 'Officer',
    color: 'oklch(60% 0.13 70)',
    privileges: {
      viewAllDistricts: true,
      viewFinancials: false,
      viewNRW: false,
      viewArrears: false,
      viewCustomers: true,
      editData: true,
      approveEntries: false,
      manageUsers: false,
      exportData: false,
    },
    districts: 'all'
  },
  auditor: {
    label: 'Auditor / Viewer',
    badge: 'Read-only',
    color: 'oklch(55% 0.05 235)',
    privileges: {
      viewAllDistricts: true,
      viewFinancials: true,
      viewNRW: true,
      viewArrears: true,
      viewCustomers: true,
      editData: false,
      approveEntries: false,
      manageUsers: false,
      exportData: true,
    },
    districts: 'all'
  },
};

// Demo accounts (loaded from localStorage; seeded on first run)
const SEED_USERS = [
  { id: 'u1', email: 'director@gwl.gh',          name: 'Adwoa Mensah',     role: 'director', district: null,               password: 'demo' },
  { id: 'u2', email: 'ne.manager@gwl.gh',        name: 'Kwame Asante',     role: 'manager',  district: 'ACCRA NORTHEAST',    password: 'demo' },
  { id: 'u3', email: 'adenta.manager@gwl.gh',    name: 'Akosua Boateng',   role: 'manager',  district: 'ADENTA',             password: 'demo' },
  { id: 'u4', email: 'dodowa.manager@gwl.gh',    name: 'Yaw Owusu',        role: 'manager',  district: 'DODOWA',             password: 'demo' },
  { id: 'u5', email: 'agbogba.manager@gwl.gh',   name: 'Ama Darko',        role: 'manager',  district: 'AGBOGBA',            password: 'demo' },
  { id: 'u6', email: 'officer@gwl.gh',           name: 'Kojo Appiah',      role: 'officer',  district: null,                 password: 'demo' },
  { id: 'u7', email: 'audit@gwl.gh',             name: 'Esi Tetteh',       role: 'auditor',  district: null,                 password: 'demo' },
];

function loadUsers() {
  const stored = window.__Store.get('users', null);
  if (stored && stored.length) return stored;
  window.__Store.set('users', SEED_USERS);   // auto-seed if the store is empty
  return SEED_USERS;
}
function saveUsers(users) { window.__Store.set('users', users); }

const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [users, setUsers] = useState(loadUsers);
  const [session, setSession] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('gwl_session') || 'null'); }
    catch { return null; }
  });

  const login = (email, password) => {
    const u = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!u) return { error: 'Invalid email or password.' };
    const s = { userId: u.id, loginAt: new Date().toISOString() };
    sessionStorage.setItem('gwl_session', JSON.stringify(s));
    setSession(s);
    return { ok: true };
  };
  const logout = () => { sessionStorage.removeItem('gwl_session'); setSession(null); };

  const updateUsers = (next) => { setUsers(next); saveUsers(next); };

  const currentUser = session ? users.find(u => u.id === session.userId) : null;
  const role = currentUser ? ROLES[currentUser.role] : null;

  const can = (priv) => !!(role && role.privileges[priv]);
  const visibleDistricts = (allDistricts) => {
    if (!currentUser) return [];
    if (role.districts === 'all') return allDistricts;
    return allDistricts.filter(d => d === currentUser.district);
  };

  return (
    <AuthContext.Provider value={{ users, currentUser, role, login, logout, can, visibleDistricts, updateUsers, ROLES }}>
      {children}
    </AuthContext.Provider>
  );
}

const useAuth = () => useContext(AuthContext);

// ---------- LOGIN SCREEN ----------
function LoginScreen() {
  const { login, users } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [showDemos, setShowDemos] = useState(false);

  const submit = (e) => {
    e && e.preventDefault();
    const r = login(email, password);
    if (r.error) setErr(r.error);
  };

  const quickLogin = (u) => { setEmail(u.email); setPassword(u.password); setTimeout(() => login(u.email, u.password), 50); };

  return (
    <div className="login-root">
      <div className="login-left">
        <div className="login-brand">
          <div className="brand-mark">
            <svg viewBox="0 0 40 40" width="32" height="32"><path d="M20 4 C12 14, 8 20, 8 26 a12 12 0 0 0 24 0 c0-6 -4-12 -12-22z" fill="currentColor"/></svg>
            <div>
              <div className="brand-title">Accra North Region</div>
              <div className="brand-sub">Commercial Performance Portal</div>
            </div>
          </div>
        </div>
        <div className="login-hero">
          <div className="hero-eyebrow">REGIONAL COMMAND CENTRE</div>
          <h1 className="hero-title">Monitor billing, collection &amp; non-revenue water across all districts.</h1>
          <p className="hero-body">Real-time KPIs for Accra Northeast, Adenta, Dodowa &amp; Agbogba. Track performance against the 2026 commercial targets, log monthly returns and act on arrears before they age.</p>
          <div className="hero-stats">
            <div><div className="hs-num">72,429</div><div className="hs-lbl">Active customers</div></div>
            <div><div className="hs-num">GHS 46.3M</div><div className="hs-lbl">Q1 26 billing</div></div>
            <div><div className="hs-num">41.1<span style={{fontSize:14}}>%</span></div><div className="hs-lbl">Q1 26 NRW</div></div>
          </div>
        </div>
        <div className="login-foot">v2.4 · Commercial Services Division · Accra North</div>
      </div>

      <div className="login-right">
        <form className="login-card" onSubmit={submit}>
          <div className="lc-eyebrow">SIGN IN</div>
          <h2 className="lc-title">Welcome back.</h2>
          <p className="lc-sub">Access is granted by role. Contact the Regional Director to request elevated privileges.</p>

          <label className="field">
            <span>Work email</span>
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} placeholder="name@gwl.gh" autoFocus required />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setErr(''); }} placeholder="••••••" required />
          </label>

          {err && <div className="login-err">{err}</div>}

          <button type="submit" className="login-btn">Sign in →</button>

          <div className="demo-section">
            <button type="button" className="demo-toggle" onClick={() => setShowDemos(!showDemos)}>
              {showDemos ? '▾' : '▸'} Demo accounts (4 privilege tiers)
            </button>
            {showDemos && (
              <div className="demo-grid">
                {users.slice(0, 7).map(u => (
                  <button type="button" key={u.id} className="demo-row" onClick={() => quickLogin(u)}>
                    <div className="dr-badge" style={{ background: ROLES[u.role].color }}>{ROLES[u.role].badge}</div>
                    <div className="dr-info">
                      <div className="dr-name">{u.name}</div>
                      <div className="dr-mail">{u.email} {u.district && <span className="dr-dist">· {u.district}</span>}</div>
                    </div>
                  </button>
                ))}
                <div className="demo-hint">All demo passwords: <code>demo</code></div>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

Object.assign(window, { AuthProvider, AuthContext, useAuth, LoginScreen, ROLES });
