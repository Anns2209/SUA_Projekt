import { useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { ORDER_SERVICE_URL, authHeader } from '../lib/api';

const STATUS_LABEL = {
  pending: 'Čaka na plačilo',
  paid: 'Plačano',
  delivered: 'Dostavljeno',
  preklicano: 'Preklicano',
};

export default function Orders() {
  const { user, token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [orderDetails, setOrderDetails] = useState({}); // { [id]: { items: [...] } }
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (user) loadOrders();
  }, [user]);

  async function loadOrders() {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${ORDER_SERVICE_URL}/orders`, { headers: authHeader(token) });
      setOrders(res.data);
    } catch (err) {
      setError('Napaka pri nalaganju naročil');
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand(orderId) {
    if (expandedId === orderId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(orderId);
    if (!orderDetails[orderId]) {
      try {
        const res = await axios.get(`${ORDER_SERVICE_URL}/orders/${orderId}`, {
          headers: authHeader(token),
        });
        setOrderDetails((prev) => ({ ...prev, [orderId]: res.data }));
      } catch (err) {
        // tiho spodleti - podrobnosti se preprosto ne prikažejo
      }
    }
  }

  async function payOrder(orderId) {
    setActionError('');
    try {
      await axios.post(`${ORDER_SERVICE_URL}/order/${orderId}/pay`, {}, { headers: authHeader(token) });
      loadOrders();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Napaka pri plačilu');
    }
  }

  async function cancelOrder(orderId) {
    if (!confirm('Ali res želite preklicati/izbrisati to naročilo?')) return;
    setActionError('');
    try {
      await axios.delete(`${ORDER_SERVICE_URL}/order/${orderId}`, { headers: authHeader(token) });
      loadOrders();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Napaka pri preklicu naročila');
    }
  }

  if (!user) {
    return (
      <div className="card">
        <p>
          Za pregled naročil se morate <Link href="/login">prijaviti</Link>.
        </p>
      </div>
    );
  }

  if (loading) return <p>Nalagam naročila...</p>;

  return (
    <div>
      <h1>Moja naročila</h1>
      {error && <p className="error">{error}</p>}
      {actionError && <p className="error">{actionError}</p>}

      {orders.length === 0 && (
        <div className="card">
          <p>
            Nimate še nobenega naročila. <Link href="/menu">Poglej meni</Link>
          </p>
        </div>
      )}

      {orders.map((order) => (
        <div key={order.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Naročilo #{order.id}</strong>{' '}
              <span className={`badge ${order.status}`}>
                {STATUS_LABEL[order.status] || order.status}
              </span>
            </div>
            <div style={{ fontWeight: 700 }}>{Number(order.skupni_znesek).toFixed(2)} €</div>
          </div>

          <p style={{ fontSize: '0.9rem', opacity: 0.75, marginTop: 6 }}>
            Dostava na: {order.lokacija_dostave}
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="secondary" onClick={() => toggleExpand(order.id)}>
              {expandedId === order.id ? 'Skrij podrobnosti' : 'Prikaži podrobnosti'}
            </button>
            {order.status === 'pending' && (
              <>
                <button className="primary" onClick={() => payOrder(order.id)}>
                  Plačaj
                </button>
                <button className="danger" onClick={() => cancelOrder(order.id)}>
                  Prekliči naročilo
                </button>
              </>
            )}
          </div>

          {expandedId === order.id && (
            <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10 }}>
              {(orderDetails[order.id]?.items || []).map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: 4 }}>
                  <span>
                    {item.naziv} × {item.kolicina}
                  </span>
                  <span>{(item.kolicina * Number(item.cena_na_enoto)).toFixed(2)} €</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}