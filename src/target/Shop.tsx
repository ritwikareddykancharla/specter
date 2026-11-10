import { useEffect, useState, type FormEvent } from 'react';
import { bug } from './bugs';

interface Product {
  id: string;
  name: string;
  price: number;
  icon: string;
  blurb: string;
}

const PRODUCTS: Product[] = [
  { id: 'toad', name: 'Toad Tonic', price: 4.5, icon: '🐸', blurb: 'Croak-free mornings, guaranteed.' },
  { id: 'bat', name: 'Bat Wing Brew', price: 7.25, icon: '🦇', blurb: 'See in the dark. Hear everything.' },
  { id: 'moon', name: 'Moonlight Elixir', price: 12, icon: '🌕', blurb: 'Bottled on the last full moon.' },
  { id: 'pepper', name: 'Ghost Pepper Draught', price: 3.75, icon: '🌶️', blurb: 'Spicy enough to wake the dead.' },
];

const money = (n: number) => `$${n.toFixed(2)}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const CODES: Record<string, number> = { BOO10: 0.1 };

export function Shop() {
  const [, rerender] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState(0);
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.ready = '1';
    // Specter's sabotage panel flips bugs live; re-render so render-time bugs show at once.
    const onSabotage = () => rerender((n) => n + 1);
    window.addEventListener('specter-sabotage', onSabotage);
    window.addEventListener('storage', onSabotage);
    return () => {
      window.removeEventListener('specter-sabotage', onSabotage);
      window.removeEventListener('storage', onSabotage);
    };
  }, []);

  // Simulated search API.
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(() => {
      setResults(PRODUCTS.filter((p) => p.name.toLowerCase().includes(q) || p.blurb.toLowerCase().includes(q)));
      setSearching(false);
    }, bug('slow-search') ? 2000 : 150);
    return () => window.clearTimeout(t);
  }, [query]);

  function add(id: string) {
    const times = bug('double-add') ? 2 : 1;
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + times }));
    setPlaced(false);
    if (bug('crash')) {
      window.setTimeout(() => {
        const promo = (window as unknown as { promo?: { banner: { title: string } } }).promo;
        document.title = (promo as { banner: { title: string } }).banner.title;
      }, 120);
    }
  }

  function remove(id: string) {
    setCart((c) => {
      const next = { ...c };
      if ((next[id] ?? 0) > 1) next[id] = (next[id] as number) - 1;
      else delete next[id];
      return next;
    });
  }

  const lines = PRODUCTS.filter((p) => cart[p.id]).map((p) => ({ p, qty: cart[p.id] as number, total: round2(p.price * (cart[p.id] as number)) }));
  const count = lines.reduce((n, l) => n + l.qty, 0);
  let subtotal = 0;
  for (let i = bug('subtotal-skip') ? 1 : 0; i < lines.length; i++) subtotal += (lines[i] as { total: number }).total;
  subtotal = round2(subtotal);
  const total = round2(subtotal * (1 - discount) * (bug('double-discount') && discount ? 1 - discount : 1));

  function applyCode(e: FormEvent) {
    e.preventDefault();
    const rate = CODES[code.trim().toUpperCase()];
    if (rate === undefined) {
      setCodeMsg(`Unknown code “${code.trim()}”.`);
      return;
    }
    setDiscount(rate);
    setCodeMsg(`${Math.round(rate * 100)}% off applied.`);
  }

  function checkout(e: FormEvent) {
    e.preventDefault();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!valid && !bug('skip-validation')) {
      setEmailError(true);
      setPlaced(false);
      return;
    }
    setEmailError(false);
    setPlaced(count > 0);
  }

  return (
    <div className="shop">
      <header className="shop-top">
        <h1>
          <span aria-hidden="true">🧪</span> Cauldron &amp; Co.
        </h1>
        <span className="cart-pill">
          Cart (<span id="cart-count">{count}</span>)
        </span>
      </header>

      <form className="shop-search" onSubmit={(e) => e.preventDefault()} role="search">
        <label htmlFor="search">Search potions</label>
        <input id="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="toad, moon, spicy…" autoComplete="off" />
        {searching && <span className="spinner">brewing…</span>}
      </form>
      {results.length > 0 && (
        <ul className="results">
          {results.map((p) => (
            <li key={p.id} className="result">
              {p.icon} {p.name} · {money(p.price)}
            </li>
          ))}
        </ul>
      )}

      <ul className="products">
        {PRODUCTS.map((p) => (
          <li key={p.id} className="product">
            <span className="icon" aria-hidden="true">
              {p.icon}
            </span>
            <strong>{p.name}</strong>
            <small>{p.blurb}</small>
            <span className="price">{money(p.price)}</span>
            <button type="button" data-add={p.id} onClick={() => add(p.id)}>
              Add to cart
            </button>
          </li>
        ))}
      </ul>

      <section className="cart" aria-labelledby="cart-title">
        <h2 id="cart-title">Your cauldron</h2>
        {lines.length === 0 ? (
          <p className="empty">Empty. Add a potion.</p>
        ) : (
          <ul className="lines">
            {lines.map((l) => (
              <li key={l.p.id}>
                <span>
                  {l.p.icon} {l.p.name} × {l.qty}
                </span>
                <span className="line-price">{money(l.total)}</span>
                <button type="button" className="remove" onClick={() => remove(l.p.id)} aria-label={`Remove one ${l.p.name}`}>
                  −
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="sum">
          Subtotal <span id="cart-subtotal">{money(subtotal)}</span>
        </p>
        <form className="code" onSubmit={applyCode}>
          <label htmlFor="code">Discount code</label>
          <input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BOO10" />
          <button type="submit" id="apply">
            Apply
          </button>
        </form>
        <p id="code-msg" className="code-msg">
          {codeMsg}
        </p>
        <p className="sum total">
          Total <span id="cart-total">{money(total)}</span>
        </p>
        <form className="checkout" onSubmit={checkout} noValidate>
          <label htmlFor="email">Email for the receipt</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@crypt.com" />
          <button type="submit" id="checkout">
            Checkout
          </button>
        </form>
        {emailError && (
          <p id="email-error" className="error" role="alert">
            That email doesn't look right.
          </p>
        )}
        {placed && (
          <p id="order-placed" className="placed" role="status">
            🎉 Order placed! Your potions are on their way by bat.
          </p>
        )}
      </section>
    </div>
  );
}
