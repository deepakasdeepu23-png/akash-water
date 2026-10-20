import { useState } from 'react';
import { admin, ownerToken } from '../api.js';
import { Toast, useToast } from './ui.jsx';
import OwnerOverview from './OwnerOverview.jsx';
import OwnerPartners from './OwnerPartners.jsx';
import OwnerExpenses from './OwnerExpenses.jsx';
import OwnerReports from './OwnerReports.jsx';
import OwnerEditor from './OwnerEditor.jsx';

const TABS = [
  ['overview', 'Overview'],
  ['partners', 'Tie-ups'],
  ['expenses', 'Expenses'],
  ['reports', 'Profit & loss'],
  ['editor', 'Site editor'],
];

function Login({ onDone, onExit }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token } = await admin.login(passcode);
      ownerToken.set(token);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell" style={{ margin: '0 auto' }}>
      <div className="topbar"><button className="btn sm" onClick={onExit}>← Back</button></div>
      <form className="card stack" onSubmit={submit}>
        <h2 style={{ fontSize: 20 }}>Owner login</h2>
        <label className="field">
          <span>Passcode</span>
          <input className="input" type="password" autoFocus autoComplete="current-password"
            value={passcode} onChange={(e) => setPasscode(e.target.value)} />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary big" disabled={busy || !passcode}>{busy ? 'Checking…' : 'Log in'}</button>
      </form>
    </div>
  );
}

export default function Owner({ onExit }) {
  const [loggedIn, setLoggedIn] = useState(Boolean(ownerToken.get()));
  const [tab, setTab] = useState('overview');
  const [toast, notify] = useToast();

  const logout = () => { ownerToken.clear(); setLoggedIn(false); };

  // Any child can call this; an expired login sends the owner back to the login form
  const run = async (fn, successText) => {
    try {
      const result = await fn();
      if (successText) notify(successText);
      return result;
    } catch (err) {
      if (err.status === 401) { logout(); return undefined; }
      notify(err.message, true);
      return undefined;
    }
  };

  if (!loggedIn) return <Login onDone={() => setLoggedIn(true)} onExit={onExit} />;

  const props = { run, notify };
  return (
    <>
      <div className="topbar">
        <button className="btn sm" onClick={onExit}>← Exit</button>
        <h2 style={{ fontSize: 16 }}>Akash owner</h2>
        <button className="btn sm" onClick={logout}>Log out</button>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <OwnerOverview {...props} />}
      {tab === 'partners' && <OwnerPartners {...props} />}
      {tab === 'expenses' && <OwnerExpenses {...props} />}
      {tab === 'reports' && <OwnerReports {...props} />}
      {tab === 'editor' && <OwnerEditor {...props} />}
      <Toast toast={toast} />
    </>
  );
}
