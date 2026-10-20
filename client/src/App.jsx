import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { AddressScreen, DoneScreen, Home, OrderScreen, PaymentScreen } from './components/Storefront.jsx';
import Owner from './components/Owner.jsx';

const loadCustomer = () => {
  try { return JSON.parse(localStorage.getItem('akash_customer')) || null; } catch { return null; }
};

export default function App() {
  const [site, setSite] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [screen, setScreen] = useState('home');
  const [cart, setCart] = useState({});           // { productId: qty }
  const [customer, setCustomer] = useState(loadCustomer);
  const [points, setPoints] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  const [placed, setPlaced] = useState(null);

  const loadSite = useCallback(() => {
    setLoadError('');
    return api.site().then((s) => {
      setSite(s);
      const valid = new Set(s.products.map((p) => p.id));
      setCart((c) => {
        const next = {};
        for (const [id, q] of Object.entries(c)) if (valid.has(Number(id))) next[id] = q;
        if (Object.keys(next).length) return next;
        return s.products[0] ? { [s.products[0].id]: 1 } : {};
      });
    }).catch((e) => setLoadError(e.message));
  }, []);

  useEffect(() => { loadSite(); }, [loadSite]);

  useEffect(() => {
    if (!site) return;
    document.documentElement.style.setProperty('--accent', site.settings.accent_color);
    document.title = `${site.settings.brand_name} ${site.settings.brand_sub}`;
  }, [site]);

  const refreshPoints = useCallback((phone) => {
    if (!phone) return;
    api.points(phone).then((r) => setPoints(r.points)).catch(() => {});
  }, []);
  useEffect(() => { refreshPoints(customer?.phone); }, [customer?.phone, refreshPoints]);

  const totals = useMemo(() => {
    if (!site) return { lines: [], subtotal: 0, cans: 0, discount: 0, amount: 0, canRedeem: false, need: 0 };
    const lines = site.products.filter((p) => cart[p.id]).map((p) => ({ product: p, qty: cart[p.id] }));
    const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
    const cans = lines.reduce((s, l) => s + l.product.cans * l.qty, 0);
    const need = Number(site.settings.redeem_points);
    const canRedeem = need > 0 && points >= need;
    const discount = usePoints && canRedeem ? Math.min(Number(site.settings.redeem_value), subtotal) : 0;
    return { lines, subtotal, cans, discount, amount: subtotal - discount, canRedeem, need };
  }, [site, cart, points, usePoints]);

  const changeQty = (id, delta) =>
    setCart((c) => {
      const q = Math.max(0, Math.min(500, (c[id] || 0) + delta));
      const next = { ...c };
      if (q === 0) delete next[id]; else next[id] = q;
      return next;
    });

  const saveCustomer = (c) => {
    setCustomer(c);
    try { localStorage.setItem('akash_customer', JSON.stringify(c)); } catch { /* storage blocked */ }
  };

  const onPlaced = (order) => {
    setPlaced(order);
    setUsePoints(false);
    setCart({});
    loadSite();
    refreshPoints(customer?.phone);
    setScreen('done');
  };

  if (loadError) {
    return (
      <div className="app"><div className="center-note">
        <p>{loadError}</p>
        <button className="btn primary" onClick={loadSite}>Try again</button>
      </div></div>
    );
  }
  if (!site) return <div className="app"><div className="center-note">Loading…</div></div>;

  const common = { site, points };
  return (
    <div className="app">
      <div className={`shell ${screen === 'owner' ? 'wide' : ''}`}>
        {screen === 'home' && <Home {...common} go={setScreen} />}
        {screen === 'order' && <OrderScreen {...common} totals={totals} changeQty={changeQty} cart={cart} go={setScreen} />}
        {screen === 'address' && <AddressScreen {...common} customer={customer} onSave={saveCustomer} go={setScreen} />}
        {screen === 'payment' && (
          <PaymentScreen {...common} totals={totals} customer={customer} usePoints={usePoints}
            setUsePoints={setUsePoints} go={setScreen} onPlaced={onPlaced} />
        )}
        {screen === 'done' && placed && <DoneScreen {...common} order={placed} go={setScreen} />}
        {screen === 'owner' && <Owner onExit={() => { loadSite(); setScreen('home'); }} />}
        {screen !== 'owner' && <p className="footer">{site.settings.footer_text}</p>}
      </div>
    </div>
  );
}
