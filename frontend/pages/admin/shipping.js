import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { SHIPPING_SERVICE_URL, authHeader } from '../../lib/api';

const STATUS_LABEL = {
  cakajoca: 'Čaka na dostavo',
  v_dostavi: 'V dostavi',
  dostavljeno: 'Dostavljeno',
};

export default function AdminShipping() {
  const { user, token } = useAuth();

  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newOrderId, setNewOrderId] = useState('');
  const [assignInputs, setAssignInputs] = useState({}); // { [shipmentId]: 'ime zaposlenega' }

  useEffect(() => {
    if (user?.vloga === 'administrator') loadShipments();
  }, [user]);

  async function loadShipments() {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${SHIPPING_SERVICE_URL}/shipping`, { headers: authHeader(token) });
      setShipments(res.data);
    } catch (err) {
      setError('Napaka pri nalaganju pošiljk');
    } finally {
      setLoading(false);
    }
  }

  async function createShipment(e) {
    e.preventDefault();
    setError('');
    if (!newOrderId) return;
    try {
      await axios.post(
        `${SHIPPING_SERVICE_URL}/shipping`,
        { order_id: parseInt(newOrderId, 10) },
        { headers: authHeader(token) }
      );
      setNewOrderId('');
      loadShipments();
    } catch (err) {
      setError(err.response?.data?.error || 'Napaka pri ustvarjanju pošiljke');
    }
  }

  async function assignEmployee(shipmentId) {
    const zaposleni = assignInputs[shipmentId];
    if (!zaposleni) return;
    try {
      await axios.post(
        `${SHIPPING_SERVICE_URL}/shipping/${shipmentId}/assign`,
        { zaposleni },
        { headers: authHeader(token) }
      );
      loadShipments();
    } catch (err) {
      setError(err.response?.data?.error || 'Napaka pri dodeljevanju');
    }
  }

  async function updateStatus(shipmentId, status) {
    try {
      await axios.put(
        `${SHIPPING_SERVICE_URL}/shipping/${shipmentId}/status`,
        { status },
        { headers: authHeader(token) }
      );
      loadShipments();
    } catch (err) {
      setError(err.response?.data?.error || 'Napaka pri spremembi statusa');
    }
  }

  async function deleteShipment(shipmentId) {
    if (!confirm('Izbriši ta zapis o dostavi?')) return;
    try {
      await axios.delete(`${SHIPPING_SERVICE_URL}/shipping/${shipmentId}`, {
        headers: authHeader(token),
      });
      loadShipments();
    } catch (err) {
      setError(err.response?.data?.error || 'Napaka pri brisanju');
    }
  }

  async function archiveDelivered() {
    if (!confirm('Arhiviraj (izbriši) vse dostavljene pošiljke?')) return;
    try {
      const res = await axios.delete(`${SHIPPING_SERVICE_URL}/shipping/archive`, {
        headers: authHeader(token),
      });
      alert(res.data.message);
      loadShipments();
    } catch (err) {
      setError(err.response?.data?.error || 'Napaka pri arhiviranju');
    }
  }

  if (!user) {
    return <p className="error">Za dostop se morate prijaviti.</p>;
  }
  if (user.vloga !== 'administrator') {
    return <p className="error">Ta stran je na voljo samo administratorjem/zaposlenim.</p>;
  }

  return (
    <div>
      <h1>Nadzorna plošča: Dostave</h1>
      {error && <p className="error">{error}</p>}

      <form className="card" onSubmit={createShipment}>
        <h3>Ustvari zapis o dostavi za plačano naročilo</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="ID naročila (npr. 3)"
            value={newOrderId}
            onChange={(e) => setNewOrderId(e.target.value)}
          />
          <button className="primary" type="submit">
            Ustvari
          </button>
        </div>
        <p style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: 6 }}>
          Naročilo mora imeti status "plačano" (preveri v /orders ali pri uporabniku).
        </p>
      </form>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="secondary" onClick={archiveDelivered}>
          Arhiviraj vse dostavljene
        </button>
      </div>

      {loading ? (
        <p>Nalagam pošiljke...</p>
      ) : shipments.length === 0 ? (
        <div className="card">
          <p>Trenutno ni aktivnih pošiljk.</p>
        </div>
      ) : (
        shipments.map((s) => (
          <div key={s.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Pošiljka #{s.id}</strong> (naročilo #{s.order_id}){' '}
                <span className={`badge ${s.status}`}>{STATUS_LABEL[s.status] || s.status}</span>
              </div>
              <button className="danger" onClick={() => deleteShipment(s.id)}>
                Izbriši
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', opacity: 0.8, marginTop: 6 }}>
              Dostava na: {s.lokacija_dostave}
            </p>
            {s.dodeljen_zaposlenemu && (
              <p style={{ fontSize: '0.9rem' }}>Dodeljeno: {s.dodeljen_zaposlenemu}</p>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
              <input
                placeholder="Ime zaposlenega"
                style={{ maxWidth: 160 }}
                value={assignInputs[s.id] || ''}
                onChange={(e) => setAssignInputs({ ...assignInputs, [s.id]: e.target.value })}
              />
              <button className="secondary" onClick={() => assignEmployee(s.id)}>
                Dodeli
              </button>

              {s.status === 'cakajoca' && (
                <button className="primary" onClick={() => updateStatus(s.id, 'v_dostavi')}>
                  Označi "V dostavi"
                </button>
              )}
              {s.status === 'v_dostavi' && (
                <button className="primary" onClick={() => updateStatus(s.id, 'dostavljeno')}>
                  Označi "Dostavljeno"
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}