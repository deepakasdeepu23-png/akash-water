import { useCallback, useEffect, useState } from 'react';
import { admin, rupees } from '../api.js';

const monthName = (period) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long' });
};

// Profit or loss, coloured, never shows a minus sign on its own
function Result({ value }) {
  if (value === 0) return <span className="muted">{rupees(0)}</span>;
  return (
    <b className={value > 0 ? 'green' : 'red'}>
      {rupees(Math.abs(value))} {value > 0 ? 'profit' : 'loss'}
    </b>
  );
}

function savedState(row) {
  if (!row.saved) return { text: 'Not saved', cls: 'grey' };
  const same = row.saved.revenue === row.revenue && row.saved.expenses === row.expenses;
  return same ? { text: 'Saved', cls: 'green' } : { text: 'Changed since saved', cls: 'amber' };
}

function Breakdown({ detail }) {
  return (
    <div className="card stack">
      <div className="row between">
        <h3 className="accent">
          {detail.type === 'year' ? detail.period : `${monthName(detail.period)} ${detail.period.slice(0, 4)}`}
        </h3>
        <Result value={detail.profit} />
      </div>
      <div className="grid4">
        <div className="item"><span className="muted tiny">Paid revenue</span><b className="accent">{rupees(detail.revenue)}</b></div>
        <div className="item"><span className="muted tiny">Expenses</span><b className="red">{rupees(detail.expenses)}</b></div>
        <div className="item"><span className="muted tiny">Credit still due</span><b className="amber">{rupees(detail.creditDue)}</b></div>
        <div className="item"><span className="muted tiny">Cans delivered</span><b>{detail.cans}</b></div>
      </div>
      <h3>Expenses by category</h3>
      {detail.byCategory.length === 0 && <p className="muted small">No expenses in this period.</p>}
      <table className="table">
        <tbody>
          {detail.byCategory.map((c) => (
            <tr key={c.category}>
              <td>{c.category}</td>
              <td>{rupees(c.amount)}</td>
              <td className="muted tiny">{detail.expenses ? Math.round((c.amount / detail.expenses) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {detail.saved && (
        <p className="muted tiny" style={{ margin: 0 }}>
          Saved report: {rupees(detail.saved.revenue)} revenue, {rupees(detail.saved.expenses)} expenses, saved {detail.saved.savedAt}.
        </p>
      )}
    </div>
  );
}

export default function OwnerReports({ run }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [years, setYears] = useState([]);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    const [m, y] = await Promise.all([
      run(() => admin.get(`/reports/monthly?year=${year}`)),
      run(() => admin.get('/reports/yearly')),
    ]);
    if (m) setData(m);
    if (y) setYears(y);
  }, [run, year]);
  useEffect(() => { setDetail(null); load(); }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (type, period) => {
    const d = await run(() => admin.get(`/reports/detail?type=${type}&period=${period}`));
    if (d) setDetail(d);
  };

  const save = async (type, period) => {
    const label = type === 'year' ? `${period} report` : `${monthName(period)} ${period.slice(0, 4)} report`;
    const r = await run(() => admin.post('/reports/save', { type, period }), `${label} saved`);
    if (r) { load(); if (detail?.period === period) open(type, period); }
  };

  if (!data) return <p className="muted center">Loading…</p>;
  const t = data.total;
  const ys = savedState({ ...t, saved: t.saved });

  return (
    <div className="stack">
      <div className="row between">
        <div className="row">
          <button className="btn sm" aria-label="Previous year" onClick={() => setYear(year - 1)}>←</button>
          <h2 style={{ fontSize: 20 }}>{data.year}</h2>
          <button className="btn sm" aria-label="Next year" onClick={() => setYear(year + 1)}>→</button>
        </div>
        <div className="row">
          <span className={`badge ${ys.cls}`}>Year: {ys.text}</span>
          <button className="btn sm primary" onClick={() => save('year', data.year)}>Save {data.year} report</button>
        </div>
      </div>

      <div className="grid4">
        <div className="card stat"><div className="l">Paid revenue</div><div className="n accent">{rupees(t.revenue)}</div></div>
        <div className="card stat"><div className="l">Expenses</div><div className="n red">{rupees(t.expenses)}</div></div>
        <div className="card stat"><div className="l">{t.profit < 0 ? 'Loss' : 'Profit'}</div>
          <div className={`n ${t.profit < 0 ? 'red' : 'green'}`}>{rupees(Math.abs(t.profit))}</div></div>
        <div className="card stat"><div className="l">Credit still due</div><div className="n amber">{rupees(t.creditDue)}</div></div>
      </div>

      <div className="card stack">
        <h3>Month by month</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 560 }}>
            <thead>
              <tr><th>Month</th><th>Revenue</th><th>Expenses</th><th>Result</th><th>Report</th><th /></tr>
            </thead>
            <tbody>
              {data.months.map((m) => {
                const active = m.revenue || m.expenses || m.creditDue;
                const st = savedState(m);
                return (
                  <tr key={m.period} style={{ opacity: active ? 1 : 0.45 }}>
                    <td>
                      <button className="btn sm" onClick={() => open('month', m.period)}>{monthName(m.period)}</button>
                    </td>
                    <td style={{ textAlign: 'left' }}>{rupees(m.revenue)}</td>
                    <td style={{ textAlign: 'left' }}>{rupees(m.expenses)}</td>
                    <td style={{ textAlign: 'left' }}><Result value={m.profit} /></td>
                    <td style={{ textAlign: 'left' }}>{active ? <span className={`badge ${st.cls}`}>{st.text}</span> : ''}</td>
                    <td>{active ? <button className="btn sm" onClick={() => save('month', m.period)}>Save</button> : ''}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td><b>Total {data.year}</b></td>
                <td style={{ textAlign: 'left' }}><b>{rupees(t.revenue)}</b></td>
                <td style={{ textAlign: 'left' }}><b>{rupees(t.expenses)}</b></td>
                <td style={{ textAlign: 'left' }}><Result value={t.profit} /></td>
                <td /><td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="muted tiny" style={{ margin: 0 }}>
          Revenue counts paid orders only. Credit orders count once you mark them paid. Cancelled orders are left out.
          Tap a month for its expense breakdown. "Save" records that month in the database.
        </p>
      </div>

      {detail && (
        <div className="stack">
          <Breakdown detail={detail} />
          <div className="row">
            <button className="btn sm" onClick={() => setDetail(null)}>Close</button>
          </div>
        </div>
      )}

      <div className="card stack">
        <h3>All years</h3>
        <table className="table">
          <thead><tr><th>Year</th><th>Revenue</th><th>Expenses</th><th>Result</th><th /></tr></thead>
          <tbody>
            {years.length === 0 && <tr><td colSpan="5" className="muted center">No data yet</td></tr>}
            {years.map((y) => (
              <tr key={y.year}>
                <td><button className="btn sm" onClick={() => { setYear(Number(y.year)); open('year', y.year); }}>{y.year}</button></td>
                <td style={{ textAlign: 'left' }}>{rupees(y.revenue)}</td>
                <td style={{ textAlign: 'left' }}>{rupees(y.expenses)}</td>
                <td style={{ textAlign: 'left' }}><Result value={y.profit} /></td>
                <td>{y.saved ? <span className="badge green">Saved</span> : <span className="badge grey">Not saved</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
