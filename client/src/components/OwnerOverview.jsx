import { useCallback, useEffect, useState } from 'react';
import { admin, rupees } from '../api.js';

const METHOD = { UPI: 'UPI', COD: 'Cash on delivery', ONLINE: 'Online', POINTS: 'Points', CASH: 'Cash', CREDIT: 'Credit' };
const payBadge = { Paid: 'green', Pending: 'amber', Credit: 'red' };

function Stat({ icon, label, value, cls }) {
  return (
    <div className="card stat">
      <div>{icon}</div>
      <div className={`n ${cls || ''}`}>{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

export default function OwnerOverview({ run }) {
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [manual, setManual] = useState({ name: '', phone: '', productId: '', qty: 1, method: 'CASH' });

  const load = useCallback(async () => {
    const [s, o, p] = await Promise.all([
      run(() => admin.get('/dashboard')),
      run(() => admin.get('/orders')),
      run(() => admin.get('/products')),
    ]);
    if (s) setStats(s);
    if (o) setOrders(o);
    if (p) {
      const active = p.filter((x) => x.active);
      setProducts(active);
      setManual((m) => ({ ...m, productId: m.productId || active[0]?.id || '' }));
    }
  }, [run]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, text) => {
    const r = await run(fn, text);
    if (r) load();
  };

  const addManual = async (e) => {
    e.preventDefault();
    const r = await run(() => admin.post('/orders', {
      name: manual.name, phone: manual.phone, productId: Number(manual.productId),
      qty: Number(manual.qty), method: manual.method,
    }), 'Order added');
    if (r) { setManual((m) => ({ ...m, name: '', phone: '', qty: 1 })); load(); }
  };

  const pendingEmpty = orders.filter((o) => o.status === 'Delivered' && o.cans > o.emptyReturned);

  return (
    <>
      <div className="grid4">
        <Stat icon="🚚" label="Delivered today" value={`${stats?.cansToday ?? 0} cans`} />
        <Stat icon="₹" label="Paid today" value={rupees(stats?.revenueToday ?? 0)} cls="accent" />
        <Stat icon="🔄" label="Empty cans pending" value={`${stats?.emptyPending ?? 0} cans`} cls="amber" />
        <Stat icon="⭐" label="Customers with free can" value={stats?.freeDue ?? 0} cls="green" />
      </div>

      <div className="cols">
        <div className="stack">
          <div className="card stack">
            <h3 className="amber">Empty cans to collect</h3>
            <div className="list">
              {pendingEmpty.length === 0 && <p className="muted small center">No empty cans pending.</p>}
              {pendingEmpty.map((o) => (
                <div className="item" key={o.id}>
                  <div className="top">
                    <div><b>{o.name}</b><div className="muted tiny">Order #{o.publicId}</div></div>
                    <span className="amber">{o.cans - o.emptyReturned} pending</span>
                  </div>
                  <div className="actions">
                    {o.phone && <a className="btn sm" href={`tel:${o.phone}`}>📞 Call {o.phone}</a>}
                    <button className="btn sm good"
                      onClick={() => window.confirm('Received the empty cans from this customer?')
                        && act(() => admin.post(`/orders/${o.id}/empty-received`), 'Marked received')}>
                      Received ✓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form className="card stack" onSubmit={addManual}>
            <h3 className="accent">Add phone order</h3>
            <div className="grid2">
              <input className="input" placeholder="Customer name" value={manual.name}
                onChange={(e) => setManual({ ...manual, name: e.target.value })} />
              <input className="input" placeholder="Phone (optional)" inputMode="numeric" value={manual.phone}
                onChange={(e) => setManual({ ...manual, phone: e.target.value })} />
            </div>
            <div className="grid2">
              <select className="input" value={manual.productId} onChange={(e) => setManual({ ...manual, productId: e.target.value })}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} - {rupees(p.price)}</option>)}
              </select>
              <input className="input" type="number" min="1" max="500" value={manual.qty}
                onChange={(e) => setManual({ ...manual, qty: e.target.value })} aria-label="Quantity" />
            </div>
            <div className="grid2">
              <select className="input" value={manual.method} onChange={(e) => setManual({ ...manual, method: e.target.value })}>
                <option value="CASH">Cash paid</option>
                <option value="UPI">UPI paid</option>
                <option value="CREDIT">Credit / due</option>
              </select>
              <button className="btn primary" disabled={!products.length}>Add order</button>
            </div>
          </form>
        </div>

        <div className="card stack">
          <div className="row between">
            <h3>Recent orders</h3>
            <span className="muted tiny">{stats?.pendingOrders ?? 0} awaiting delivery</span>
          </div>
          <div className="list">
            {orders.length === 0 && <p className="muted small center">No orders yet.</p>}
            {orders.map((o) => (
              <div className="item" key={o.id}>
                <div className="top">
                  <div>
                    <b className="accent">#{o.publicId}</b>
                    <div>{o.cans} cans • {o.name}</div>
                    <div className="muted tiny">{METHOD[o.method]} • {o.createdAt.slice(0, 16)}</div>
                    {o.phone && <div className="muted tiny">📞 {o.phone}</div>}
                    {o.address && <div className="muted tiny">{o.address} - {o.pincode}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <b>{rupees(o.amount)}</b>
                    <div><span className={`badge ${payBadge[o.paymentStatus]}`}>{o.paymentStatus}</span></div>
                    <div style={{ marginTop: 4 }}>
                      <span className={`badge ${o.status === 'Delivered' ? 'green' : o.status === 'Cancelled' ? 'grey' : ''}`}>{o.status}</span>
                    </div>
                  </div>
                </div>
                <div className="actions">
                  {o.status === 'Pending' && (
                    <button className="btn sm primary" onClick={() => act(() => admin.post(`/orders/${o.id}/deliver`), 'Marked delivered')}>
                      Confirm delivery
                    </button>
                  )}
                  {o.paymentStatus === 'Pending' && o.status !== 'Cancelled' && (
                    <button className="btn sm good" onClick={() => act(() => admin.post(`/orders/${o.id}/mark-paid`), 'Marked paid')}>
                      Payment received
                    </button>
                  )}
                  {o.status === 'Pending' && (
                    <button className="btn sm" onClick={() => window.confirm('Cancel this order?')
                      && act(() => admin.post(`/orders/${o.id}/cancel`), 'Order cancelled')}>
                      Cancel
                    </button>
                  )}
                  <button className="btn sm danger" onClick={() => window.confirm('Delete this order for good?')
                    && act(() => admin.del(`/orders/${o.id}`), 'Order deleted')}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
