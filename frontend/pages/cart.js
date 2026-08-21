import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { ORDER_SERVICE_URL, authHeader } from '../lib/api';

export default function Cart() {
  const { user, token } = useAuth();
  const { items, updateQty, removeItem, clearCart, total } = useCart();
  const router = useRouter();

  const [lokacija, setLokacija] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null); // { id, skupni_znesek }
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  if (!user) {
    return (
      <div className="card">
        <p>
          Za oddajo naročila se morate <Link href="/login">prijaviti</Link>.
        </p>
      </div>
    );
  }

  async function submitOrder(e) {
    e.preventDefault();
    setError('');
    if (items.length === 0) {
      setError('Košarica je prazna');
      return;
    }
    if (!lokacija.trim()) {
      setError('Vnesite lokacijo dostave');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(
        `${ORDER_SERVICE_URL}/order`,
        {
          lokacija_dostave: lokacija,
          items: items.map((i) => ({ dish_id: i.dish_id, kolicina: i.kolicina })),
        },
        { headers: authHeader(token) }
      );
      setCreatedOrder(res.data);
      clearCart();
    } catch (err) {
      setError(err.response?.data?.error || 'Napaka pri oddaji naročila');
    } finally {
      setLoading(false);
    }
  }

  async function payNow() {
    setPaying(true);
    setError('');
    try {
      await axios.post(
        `${ORDER_SERVICE_URL}/order/${createdOrder.id}/pay`,
        {},
        { headers: authHeader(token) }
      );
      setPaid(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Napaka pri plačilu');
    } finally {
      setPaying(false);
    }
  }

  // --- Stanje po uspešni oddaji naročila ---
  if (createdOrder) {
    return (
      <div className="card">
        <h1>Naročilo #{createdOrder.id} ustvarjeno</h1>
        <p>
          Skupni znesek: <strong>{Number(createdOrder.skupni_znesek).toFixed(2)} €</strong>
        </p>

        {!paid ? (
          <>
            <p>Naročilo je zabeleženo, plačajte za potrditev dostave.</p>
            {error && <p className="error">{error}</p>}
            <button className="primary" onClick={payNow} disabled={paying}>
              {paying ? 'Obdelujem plačilo...' : 'Plačaj zdaj'}
            </button>
          </>
        ) : (
          <>
            <p className="success">Plačilo uspešno! Vaše naročilo je poslano v pripravo.</p>
            <button className="primary" onClick={() => router.push('/orders')}>
              Poglej moja naročila
            </button>
          </>
        )}
      </div>
    );
  }

  // --- Prikaz košarice ---
  return (
    <div>
      <h1>Košarica</h1>

      {items.length === 0 ? (
        <div className="card">
          <p>
            Košarica je prazna. <Link href="/menu">Poglej meni</Link>
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            {items.map((item) => (
              <div
                key={item.dish_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid #eee',
                }}
              >
                <div>
                  <strong>{item.naziv}</strong>
                  <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                    {Number(item.cena).toFixed(2)} € / kos
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className="secondary"
                    onClick={() => updateQty(item.dish_id, item.kolicina - 1)}
                  >
                    −
                  </button>
                  <span>{item.kolicina}</span>
                  <button
                    className="secondary"
                    onClick={() => updateQty(item.dish_id, item.kolicina + 1)}
                  >
                    +
                  </button>
                  <button className="danger" onClick={() => removeItem(item.dish_id)}>
                    Odstrani
                  </button>
                </div>
              </div>
            ))}
            <p style={{ marginTop: 12, fontSize: '1.1rem', fontWeight: 700 }}>
              Skupaj: {total.toFixed(2)} €
            </p>
          </div>

          <form className="card" onSubmit={submitOrder}>
            <h3>Podatki za dostavo</h3>
            <div className="form-group">
              <label>Lokacija dostave</label>
              <input
                value={lokacija}
                onChange={(e) => setLokacija(e.target.value)}
                placeholder="npr. Maribor, Partizanska cesta 5"
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="primary" disabled={loading}>
              {loading ? 'Oddajam naročilo...' : 'Oddaj naročilo'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}