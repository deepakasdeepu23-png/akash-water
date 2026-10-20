import { useCallback, useEffect, useState } from 'react';
import { admin, rupees, today } from '../api.js';

const CATEGORIES = ['Petrol', 'Food', 'Maintenance', 'Salary', 'Rent', 'Electricity', 'Can purchase', 'Other'];

export default function OwnerExpenses({ run }) {
  const [month, setMonth] = useState(today().slice(0, 7)); // '' = latest entries from every month
  const [data, setData] = useState({ items: [], total: 0, byCategory: [] });
  const [form, setForm] = useState({ category: 'Petrol', amount: '', note: '', date: today() });

  const load = useCallback(async () => {
    const r = await run(() => admin.get(`/expenses${month ? `?month=${month}` : ''}`));
    if (r) setData(r);
  }, [run, month]);
  useEffect(() => { load(); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault();
    const r = await run(() => admin.post('/expenses', form), 'Expense saved');
    if (r) { setForm({ ...form, amount: '', note: '' }); load(); }
  };

  return (
    <div className="cols">
      <form className="card stack" onSubmit={add}>
        <h3 className="accent">Add business expense</h3>
        <div className="grid2">
          <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="Category">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="input" type="number" min="0" step="0.01" placeholder="Amount (₹)" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div className="grid2">
          <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Date" />
          <input className="input" placeholder="Note (for example, bike petrol)" value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <button className="btn primary" disabled={!form.amount}>Save expense</button>
      </form>

      <div className="card stack">
        <div className="row between">
          <h3>Expenses</h3>
          <input className="input" type="month" style={{ width: 'auto' }} value={month}
            onChange={(e) => setMonth(e.target.value)} aria-label="Month" />
        </div>
        <div className="row between">
          <span className="muted small">{month ? 'Total for this month' : 'Total of latest entries'}</span>
          <b className="red">{rupees(data.total)}</b>
        </div>
        {data.byCategory.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {data.byCategory.map((c) => (
              <span key={c.category} className="badge grey">{c.category} {rupees(c.amount)}</span>
            ))}
          </div>
        )}
        <div className="list">
          {data.items.length === 0 && <p className="muted small center">No expenses {month ? 'this month' : 'saved yet'}.</p>}
          {data.items.map((x) => (
            <div className="item" key={x.id}>
              <div className="top">
                <div><b className="red">{x.category}</b><div className="muted tiny">{x.note || 'No note'} • {x.date}</div></div>
                <div style={{ textAlign: 'right' }}>
                  <b>{rupees(x.amount)}</b>
                  <div><button className="btn sm danger" style={{ marginTop: 4 }}
                    onClick={() => window.confirm('Delete this expense?')
                      && run(() => admin.del(`/expenses/${x.id}`), 'Expense deleted').then(load)}>Delete</button></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
