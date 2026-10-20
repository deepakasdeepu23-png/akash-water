import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api, rupees } from '../api.js';
import { Bottle, Field } from './ui.jsx';

function Header({ site, points, back, showPoints = true }) {
  return (
    <div className="topbar">
      <button className="btn sm" onClick={back}>← Back</button>
      <div className="title">
        <h2>{site.settings.brand_name}</h2>
        <small>{site.settings.brand_sub}</small>
      </div>
      {showPoints ? <div className="points">{points} Pts</div> : <span style={{ width: 52 }} />}
    </div>
  );
}

/* ---------------- Home ---------------- */
export function Home({ site, go }) {
  const s = site.settings;
  return (
    <>
      <div className="topbar">
        <button className="btn sm" onClick={() => go('owner')}>🔐 Owner Portal</button>
      </div>
      <div className="hero">
        <div className="logo">{s.logo_emoji}</div>
        <h1>{s.brand_name}</h1>
        <p>{s.brand_sub}</p>
      </div>
      <div className="card promo">
        <div>
          <h2>{s.tagline_title}</h2>
          <p>{s.tagline_text}</p>
        </div>
        <Bottle />
      </div>
      <p className="quote">{s.quote}</p>
      <button className="btn primary big" onClick={() => go('order')} disabled={site.products.length === 0}>
        {s.cta_text}
      </button>
      {site.products.length === 0 && <p className="center muted small">Ordering is paused. Call {s.support_phone}.</p>}
    </>
  );
}

/* ---------------- Order ---------------- */
export function OrderScreen({ site, points, totals, cart, changeQty, go }) {
  const sections = [];
  for (const p of site.products) {
    let sec = sections.find((x) => x.name === p.section);
    if (!sec) { sec = { name: p.section, items: [] }; sections.push(sec); }
    sec.items.push(p);
  }
  return (
    <>
      <Header site={site} points={points} back={() => go('home')} />
      {sections.map((sec) => (
        <div key={sec.name} className="stack">
          <h3>{sec.name}</h3>
          {sec.items.map((p) => (
            <div key={p.id} className="card pack">
              <div>
                <h4>{p.name}</h4>
                <span className="price">{rupees(p.price)}</span>
              </div>
              <div className="stepper">
                <button aria-label={`Remove one ${p.name}`} onClick={() => changeQty(p.id, -1)}>−</button>
                <b>{cart[p.id] || 0}</b>
                <button className="plus" aria-label={`Add one ${p.name}`} onClick={() => changeQty(p.id, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>
      ))}
      <div className="total">
        <span className="muted tiny">Total ({totals.cans} {totals.cans === 1 ? 'can' : 'cans'})</span>
        <strong>{rupees(totals.subtotal)}</strong>
      </div>
      <p className="center muted tiny">{site.settings.order_note}</p>
      <button className="btn primary big" disabled={totals.cans === 0} onClick={() => go('address')}>Next →</button>
    </>
  );
}

/* ---------------- Address ---------------- */
export function AddressScreen({ site, points, customer, onSave, go }) {
  const [editing, setEditing] = useState(!customer);
  const [form, setForm] = useState({ name: '', address: '', phone: '', pincode: '', ...(customer || {}) });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = () => {
    const phone = form.phone.replace(/\D/g, '').slice(-10);
    if (form.name.trim().length < 2) return setError('Enter your full name.');
    if (form.address.trim().length < 5) return setError('Enter your street address.');
    if (!/^[6-9]\d{9}$/.test(phone)) return setError('Enter a valid 10-digit mobile number.');
    if (!/^\d{6}$/.test(form.pincode.trim())) return setError('Enter a 6-digit pin code.');
    onSave({ name: form.name.trim(), address: form.address.trim(), phone, pincode: form.pincode.trim() });
    go('payment');
  };

  return (
    <>
      <Header site={site} points={points} back={() => go('order')} />
      <div>
        <h2 style={{ fontSize: 24 }}>Delivery address</h2>
        <p className="muted small" style={{ margin: '4px 0 0' }}>Saved on this device for your next order.</p>
      </div>

      {!editing && customer ? (
        <div className="card stack">
          <div>
            <h3 style={{ fontSize: 16 }}>{customer.name}</h3>
            <p className="muted small" style={{ margin: '4px 0' }}>{customer.address} - {customer.pincode}</p>
            <p className="accent small" style={{ margin: 0, fontWeight: 600 }}>{customer.phone}</p>
          </div>
          <div className="row">
            <button className="btn primary grow" onClick={() => go('payment')}>Use this address</button>
            <button className="btn" onClick={() => setEditing(true)}>Edit</button>
          </div>
        </div>
      ) : (
        <div className="card stack">
          <Field label="Full name"><input className="input" value={form.name} onChange={set('name')} autoComplete="name" /></Field>
          <Field label="Street address and landmark">
            <textarea className="input" rows={2} value={form.address} onChange={set('address')}
              placeholder="House or flat no, building, street, landmark" autoComplete="street-address" />
          </Field>
          <div className="grid2">
            <Field label="Mobile number">
              <input className="input" type="tel" inputMode="numeric" value={form.phone} onChange={set('phone')} autoComplete="tel" />
            </Field>
            <Field label="Pin code">
              <input className="input" inputMode="numeric" maxLength={6} value={form.pincode} onChange={set('pincode')} autoComplete="postal-code" />
            </Field>
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn primary big" onClick={save}>Save and continue</button>
        </div>
      )}
    </>
  );
}

/* ---------------- Payment ---------------- */
function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'));
    document.body.appendChild(s);
    return undefined;
  });
}

async function payWithRazorpay(res) {
  const { order, razorpay } = res;
  try {
    await loadRazorpay();
  } catch (e) {
    await api.cancelUnpaid(order.publicId).catch(() => {});
    throw e;
  }
  await new Promise((resolve, reject) => {
    let paid = false;
    const rzp = new window.Razorpay({
      key: razorpay.keyId,
      amount: razorpay.amount,
      currency: 'INR',
      name: razorpay.name,
      order_id: razorpay.orderId,
      prefill: razorpay.prefill,
      handler: async (r) => {
        paid = true;
        try {
          await api.verifyPayment(order.publicId, r);
          resolve();
        } catch {
          reject(new Error(`We could not confirm your payment. Please call us and quote order ${order.publicId}.`));
        }
      },
      modal: {
        ondismiss: async () => {
          if (paid) return;
          await api.cancelUnpaid(order.publicId).catch(() => {});
          reject(new Error('Payment was not completed and you have not been charged.'));
        },
      },
    });
    rzp.open();
  });
}

export function PaymentScreen({ site, points, totals, customer, usePoints, setUsePoints, go, onPlaced }) {
  const s = site.settings;
  const [mode, setMode] = useState(null); // 'UPI' | 'COD'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const methods = site.paymentMethods;
  const free = totals.amount === 0;
  const anyMethod = methods.UPI || methods.COD || methods.ONLINE;

  const upiLink = `upi://pay?${new URLSearchParams({
    pa: s.upi_id, pn: s.upi_name, am: totals.amount.toFixed(2), cu: 'INR',
  }).toString()}`;

  async function place(method) {
    setBusy(true);
    setError('');
    try {
      const res = await api.placeOrder({
        customer,
        items: totals.lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
        paymentMethod: method,
        usePoints,
      });
      if (res.razorpay) await payWithRazorpay(res);
      onPlaced(res.order);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header site={site} points={points} back={() => (mode ? setMode(null) : go('address'))} />

      {totals.canRedeem && (
        <div className="card gold row between">
          <div>
            <h3 className="amber">🎉 {totals.need} points reached</h3>
            <p className="tiny muted" style={{ margin: '2px 0 0' }}>Use them for {rupees(s.redeem_value)} off this order</p>
          </div>
          <button className="btn sm" onClick={() => { setUsePoints(!usePoints); setMode(null); }}>
            {usePoints ? 'Applied ✓' : 'Apply'}
          </button>
        </div>
      )}

      <div className="total">
        <span className="muted tiny">Total amount{totals.discount > 0 ? ` (${rupees(totals.discount)} off)` : ''}</span>
        <strong>{rupees(totals.amount)}</strong>
      </div>

      {error && <div className="error" role="alert">{error}</div>}

      {free && (
        <div className="card good stack center">
          <h3>Free order</h3>
          <p className="muted small" style={{ margin: 0 }}>You are using {totals.need} points. Nothing to pay.</p>
          <button className="btn primary big" disabled={busy} onClick={() => place('POINTS')}>
            {busy ? 'Placing order…' : 'Confirm free order'}
          </button>
        </div>
      )}

      {!free && !mode && (
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>Choose how you want to pay</p>
          {methods.UPI && (
            <button className="method" onClick={() => setMode('UPI')}>
              <span className="ico">📱</span>
              <span className="grow"><b>UPI</b><small>PhonePe, Google Pay, Paytm, QR</small></span>
            </button>
          )}
          {methods.ONLINE && (
            <button className="method" disabled={busy} onClick={() => place('ONLINE')}>
              <span className="ico">💳</span>
              <span className="grow"><b>{busy ? 'Opening payment…' : 'Card or netbanking'}</b><small>Secure online payment</small></span>
            </button>
          )}
          {methods.COD && (
            <button className="method" onClick={() => setMode('COD')}>
              <span className="ico">💵</span>
              <span className="grow"><b>Cash on delivery</b><small>Pay cash when the cans arrive</small></span>
            </button>
          )}
          {!anyMethod && <div className="error">Payments are paused. Call {s.support_phone} to order.</div>}
        </div>
      )}

      {!free && mode === 'UPI' && (
        <div className="card stack center">
          <span className="badge">UPI</span>
          <div className="qr"><QRCodeSVG value={upiLink} size={150} /></div>
          <p className="small" style={{ margin: 0 }}>Pay <b>{rupees(totals.amount)}</b> to <b>{s.upi_id}</b></p>
          <a className="btn primary" href={upiLink}>Open UPI app</a>
          <button className="btn big" disabled={busy} onClick={() => place('UPI')}>
            {busy ? 'Placing order…' : "I've paid - place order"}
          </button>
          <p className="muted tiny" style={{ margin: 0 }}>The owner checks the payment before delivery.</p>
        </div>
      )}

      {!free && mode === 'COD' && (
        <div className="card stack center">
          <span className="badge grey">Cash on delivery</span>
          <p className="muted small" style={{ margin: 0 }}>Keep {rupees(totals.amount)} ready when the cans arrive.</p>
          <button className="btn primary big" disabled={busy} onClick={() => place('COD')}>
            {busy ? 'Placing order…' : 'Confirm order'}
          </button>
        </div>
      )}
    </>
  );
}

/* ---------------- Done ---------------- */
export function DoneScreen({ site, order, go }) {
  const s = site.settings;
  const message = {
    UPI: 'The owner will confirm your UPI payment and deliver your cans.',
    COD: `Keep ${rupees(order.amount)} ready for the delivery person.`,
    ONLINE: 'Payment received. Your cans are on the way.',
    POINTS: 'Enjoy your free can!',
  }[order.method];
  return (
    <>
      <div className="hero"><div className="logo">✅</div></div>
      <div className="card stack center">
        <h2 style={{ fontSize: 20 }}>Order placed</h2>
        <p className="accent" style={{ margin: 0, fontWeight: 700 }}>#{order.publicId}</p>
        <p className="muted small" style={{ margin: 0 }}>
          {order.totalCans} {order.totalCans === 1 ? 'can' : 'cans'} • {rupees(order.amount)}
        </p>
        <p className="small" style={{ margin: 0 }}>{message}</p>
        <p className="amber small" style={{ margin: 0 }}>You earn +{order.pointsEarned} points when it is delivered.</p>
      </div>
      <button className="btn primary big" onClick={() => go('home')}>Back to home</button>
      <p className="center muted tiny">Questions? Call {s.support_phone}</p>
    </>
  );
}
