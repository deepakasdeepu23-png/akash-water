import { useCallback, useEffect, useState } from 'react';
import { admin, today } from '../api.js';

function PartnerCard({ partner, run, reload }) {
  const [log, setLog] = useState({ date: today(), cans: '', empty: '' });
  const [edit, setEdit] = useState(null); // { name, billingNote } while editing

  const addLog = async (e) => {
    e.preventDefault();
    const r = await run(() => admin.post(`/partners/${partner.id}/logs`, {
      date: log.date, cans: Number(log.cans), empty: Number(log.empty),
    }), 'Entry added');
    if (r) { setLog({ ...log, cans: '', empty: '' }); reload(); }
  };

  const saveEdit = async () => {
    const r = await run(() => admin.put(`/partners/${partner.id}`, edit), 'Saved');
    if (r) { setEdit(null); reload(); }
  };

  const totals = partner.logs.reduce((t, l) => ({ cans: t.cans + l.cans, empty: t.empty + l.empty }), { cans: 0, empty: 0 });

  return (
    <div className="card stack">
      {edit ? (
        <div className="stack">
          <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="Partner name" />
          <input className="input" value={edit.billingNote} placeholder="Billing note"
            onChange={(e) => setEdit({ ...edit, billingNote: e.target.value })} />
          <div className="row">
            <button className="btn sm primary" onClick={saveEdit}>Save</button>
            <button className="btn sm" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="row between">
          <div>
            <h3 className="accent">{partner.name}</h3>
            {partner.billingNote && <span className="badge grey">{partner.billingNote}</span>}
          </div>
          <div className="row">
            <button className="btn sm" onClick={() => setEdit({ name: partner.name, billingNote: partner.billingNote })}>Edit</button>
            <button className="btn sm danger" onClick={() => window.confirm(`Delete ${partner.name} and all its entries?`)
              && run(() => admin.del(`/partners/${partner.id}`), 'Partner deleted').then(reload)}>Delete</button>
          </div>
        </div>
      )}

      <form className="stack" onSubmit={addLog}>
        <input className="input" type="date" value={log.date} onChange={(e) => setLog({ ...log, date: e.target.value })} aria-label="Date" />
        <div className="grid2">
          <input className="input" type="number" min="0" placeholder="Cans supplied" value={log.cans}
            onChange={(e) => setLog({ ...log, cans: e.target.value })} />
          <input className="input" type="number" min="0" placeholder="Empty received" value={log.empty}
            onChange={(e) => setLog({ ...log, empty: e.target.value })} />
        </div>
        <button className="btn primary" disabled={log.cans === '' || log.empty === ''}>Add entry</button>
      </form>

      <table className="table">
        <thead><tr><th>Date</th><th>Cans</th><th>Empty</th><th /></tr></thead>
        <tbody>
          {partner.logs.length === 0 && <tr><td colSpan="4" className="muted center">No entries yet</td></tr>}
          {partner.logs.map((l) => (
            <tr key={l.id}>
              <td>{l.date}</td><td>{l.cans}</td><td>{l.empty}</td>
              <td><button className="btn sm danger" aria-label="Delete entry"
                onClick={() => run(() => admin.del(`/logs/${l.id}`), 'Entry deleted').then(reload)}>✕</button></td>
            </tr>
          ))}
        </tbody>
        {partner.logs.length > 0 && (
          <tfoot><tr><td><b>Total</b></td><td><b>{totals.cans}</b></td><td><b>{totals.empty}</b></td><td /></tr></tfoot>
        )}
      </table>
    </div>
  );
}

export default function OwnerPartners({ run }) {
  const [partners, setPartners] = useState([]);
  const [form, setForm] = useState({ name: '', billingNote: '' });

  const load = useCallback(async () => {
    const r = await run(() => admin.get('/partners'));
    if (r) setPartners(r);
  }, [run]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault();
    const r = await run(() => admin.post('/partners', form), 'Partner added');
    if (r) { setForm({ name: '', billingNote: '' }); load(); }
  };

  return (
    <div className="stack">
      <form className="card stack" onSubmit={add}>
        <h3>Add a tie-up (school, garage, company…)</h3>
        <div className="grid2">
          <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Billing note (optional)" value={form.billingNote}
            onChange={(e) => setForm({ ...form, billingNote: e.target.value })} />
        </div>
        <button className="btn primary" disabled={!form.name.trim()}>Add tie-up</button>
      </form>
      <div className="cols">
        {partners.map((p) => <PartnerCard key={p.id} partner={p} run={run} reload={load} />)}
      </div>
    </div>
  );
}
