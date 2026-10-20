import { useCallback, useEffect, useState } from 'react';
import { admin, rupees } from '../api.js';
import { Field, TextInput } from './ui.jsx';

function ProductRow({ product, run, reload }) {
  const [p, setP] = useState(product);
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const save = async () => {
    const r = await run(() => admin.put(`/products/${p.id}`, {
      ...p, cans: Number(p.cans), price: Number(p.price), sortOrder: Number(p.sortOrder),
    }), 'Pack saved');
    if (r) reload();
  };
  return (
    <div className="item">
      <div className="grid2">
        <Field label="Pack name"><input className="input" value={p.name} onChange={set('name')} /></Field>
        <Field label="Heading on order page"><input className="input" value={p.section} onChange={set('section')} /></Field>
      </div>
      <div className="grid4">
        <Field label="Cans in pack"><input className="input" type="number" min="1" value={p.cans} onChange={set('cans')} /></Field>
        <Field label="Price (₹)"><input className="input" type="number" min="0" step="0.01" value={p.price} onChange={set('price')} /></Field>
        <Field label="Position"><input className="input" type="number" min="0" value={p.sortOrder} onChange={set('sortOrder')} /></Field>
        <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}>
          <input type="checkbox" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} /> Visible
        </label>
      </div>
      <div className="actions">
        <button className="btn sm primary" onClick={save}>Save pack</button>
        <button className="btn sm danger" onClick={() => window.confirm(`Delete ${product.name}?`)
          && run(() => admin.del(`/products/${product.id}`), 'Pack deleted').then(reload)}>Delete</button>
        <span className="muted tiny" style={{ alignSelf: 'center' }}>{rupees(product.price)} per pack</span>
      </div>
    </div>
  );
}

export default function OwnerEditor({ run, notify }) {
  const [s, setS] = useState(null);
  const [products, setProducts] = useState([]);
  const [newPack, setNewPack] = useState({ name: '', cans: 1, price: '', section: 'Order', sortOrder: 10 });
  const [pass, setPass] = useState({ current: '', next: '' });

  const load = useCallback(async () => {
    const [settings, prods] = await Promise.all([run(() => admin.get('/settings')), run(() => admin.get('/products'))]);
    if (settings) setS(settings);
    if (prods) setProducts(prods);
  }, [run]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return <p className="muted center">Loading…</p>;
  const set = (k) => (v) => setS((x) => ({ ...x, [k]: v }));
  const flag = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.checked ? '1' : '0' }));

  const saveSettings = async () => {
    const r = await run(() => admin.put('/settings', s), 'Website saved');
    if (r) setS(r);
  };
  const addPack = async (e) => {
    e.preventDefault();
    const r = await run(() => admin.post('/products', {
      ...newPack, cans: Number(newPack.cans), price: Number(newPack.price), sortOrder: Number(newPack.sortOrder),
    }), 'Pack added');
    if (r) { setNewPack({ name: '', cans: 1, price: '', section: 'Order', sortOrder: 10 }); load(); }
  };
  const changePass = async (e) => {
    e.preventDefault();
    const r = await run(() => admin.post('/passcode', pass), 'Passcode changed');
    if (r) setPass({ current: '', next: '' });
  };

  return (
    <div className="stack">
      <div className="cols">
        <div className="card stack">
          <h3 className="accent">Front page</h3>
          <div className="grid2">
            <TextInput label="Brand name" value={s.brand_name} onChange={set('brand_name')} />
            <TextInput label="Logo emoji" value={s.logo_emoji} onChange={set('logo_emoji')} maxLength={8} />
          </div>
          <TextInput label="Line under the name" value={s.brand_sub} onChange={set('brand_sub')} />
          <TextInput label="Card heading" value={s.tagline_title} onChange={set('tagline_title')} />
          <Field label="Card text">
            <textarea className="input" value={s.tagline_text} onChange={(e) => set('tagline_text')(e.target.value)} />
          </Field>
          <TextInput label="Quote" value={s.quote} onChange={set('quote')} />
          <TextInput label="Order button text" value={s.cta_text} onChange={set('cta_text')} />
          <TextInput label="Note on order page" value={s.order_note} onChange={set('order_note')} />
          <TextInput label="Footer text" value={s.footer_text} onChange={set('footer_text')} />
          <Field label="Accent colour">
            <input className="input color" type="color" value={s.accent_color} onChange={(e) => set('accent_color')(e.target.value)} />
          </Field>
        </div>

        <div className="stack">
          <div className="card stack">
            <h3 className="accent">Payments</h3>
            <label className="check"><input type="checkbox" checked={s.pay_upi === '1'} onChange={flag('pay_upi')} /> UPI (QR and app link)</label>
            <label className="check"><input type="checkbox" checked={s.pay_cod === '1'} onChange={flag('pay_cod')} /> Cash on delivery</label>
            <label className="check"><input type="checkbox" checked={s.pay_online === '1'} onChange={flag('pay_online')} /> Card / netbanking (Razorpay)</label>
            <p className="muted tiny" style={{ margin: 0 }}>
              Card payments also need RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env.
            </p>
            <div className="grid2">
              <TextInput label="UPI ID" value={s.upi_id} onChange={set('upi_id')} placeholder="name@bank" />
              <TextInput label="Name shown on payment" value={s.upi_name} onChange={set('upi_name')} />
            </div>
            <TextInput label="Support phone" value={s.support_phone} onChange={set('support_phone')} />
          </div>

          <div className="card stack">
            <h3 className="accent">Loyalty points</h3>
            <div className="grid4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <TextInput label="Points per can" type="number" min="0" value={s.points_per_can} onChange={set('points_per_can')} />
              <TextInput label="Points to redeem" type="number" min="0" value={s.redeem_points} onChange={set('redeem_points')} />
              <TextInput label="Discount (₹)" type="number" min="0" value={s.redeem_value} onChange={set('redeem_value')} />
            </div>
            <p className="muted tiny" style={{ margin: 0 }}>Points are added when an order is marked delivered.</p>
          </div>
        </div>
      </div>

      <button className="btn primary big" onClick={saveSettings}>Save website changes</button>

      <div className="card stack">
        <h3 className="accent">Packs and prices</h3>
        {products.map((p) => <ProductRow key={`${p.id}-${p.name}-${p.price}-${p.cans}-${p.section}-${p.sortOrder}-${p.active}`} product={p} run={run} reload={load} />)}
        <form className="item" onSubmit={addPack}>
          <b className="small">Add a pack</b>
          <div className="grid2">
            <input className="input" placeholder="Name (for example, 5 CAN)" value={newPack.name} onChange={(e) => setNewPack({ ...newPack, name: e.target.value })} />
            <input className="input" placeholder="Heading" value={newPack.section} onChange={(e) => setNewPack({ ...newPack, section: e.target.value })} />
          </div>
          <div className="grid2">
            <input className="input" type="number" min="1" placeholder="Cans" value={newPack.cans} onChange={(e) => setNewPack({ ...newPack, cans: e.target.value })} />
            <input className="input" type="number" min="0" step="0.01" placeholder="Price (₹)" value={newPack.price} onChange={(e) => setNewPack({ ...newPack, price: e.target.value })} />
          </div>
          <button className="btn primary" disabled={!newPack.name.trim() || newPack.price === ''}>Add pack</button>
        </form>
      </div>

      <form className="card stack" onSubmit={changePass}>
        <h3 className="accent">Owner passcode</h3>
        <div className="grid2">
          <TextInput label="Current passcode" type="password" value={pass.current} onChange={(v) => setPass({ ...pass, current: v })} autoComplete="current-password" />
          <TextInput label="New passcode (6+ characters)" type="password" value={pass.next} onChange={(v) => setPass({ ...pass, next: v })} autoComplete="new-password" />
        </div>
        <button className="btn" disabled={!pass.current || pass.next.length < 6}>Change passcode</button>
      </form>
    </div>
  );
}
