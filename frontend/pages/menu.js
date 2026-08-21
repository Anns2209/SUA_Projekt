import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { MENU_SERVICE_URL, authHeader } from '../lib/api';

export default function Menu() {
  const { user, token } = useAuth();
  const { addItem } = useCart();

  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [dishDetails, setDishDetails] = useState({}); // { [id]: { comments: [...] } }
  const [commentText, setCommentText] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDish, setNewDish] = useState({ naziv: '', opis: '', cena: '', kategorija: '' });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadMenu();
  }, []);

  async function loadMenu() {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${MENU_SERVICE_URL}/menu`);
      setDishes(res.data);
    } catch (err) {
      setError('Napaka pri nalaganju menija. Preveri, da Static Menu Service teče.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand(dishId) {
    if (expandedId === dishId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(dishId);
    if (!dishDetails[dishId]) {
      try {
        const res = await axios.get(`${MENU_SERVICE_URL}/menu/${dishId}`);
        setDishDetails((prev) => ({ ...prev, [dishId]: res.data }));
      } catch (err) {
        // tiho spodleti - komentarji se preprosto ne prikažejo
      }
    }
  }

  async function submitComment(dishId) {
    if (!commentText.trim()) return;
    try {
      await axios.post(
        `${MENU_SERVICE_URL}/menu/${dishId}/comment`,
        { besedilo: commentText },
        { headers: authHeader(token) }
      );
      setCommentText('');
      const res = await axios.get(`${MENU_SERVICE_URL}/menu/${dishId}`);
      setDishDetails((prev) => ({ ...prev, [dishId]: res.data }));
    } catch (err) {
      alert(err.response?.data?.error || 'Napaka pri dodajanju komentarja');
    }
  }

  async function submitNewDish(e) {
    e.preventDefault();
    setFormError('');
    if (!newDish.naziv || !newDish.cena) {
      setFormError('Naziv in cena sta obvezna');
      return;
    }
    try {
      await axios.post(
        `${MENU_SERVICE_URL}/menu`,
        { ...newDish, cena: parseFloat(newDish.cena) },
        { headers: authHeader(token) }
      );
      setNewDish({ naziv: '', opis: '', cena: '', kategorija: '' });
      setShowAddForm(false);
      loadMenu();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Napaka pri dodajanju jedi');
    }
  }

  async function deleteDish(dishId) {
    if (!confirm('Ali res želite izbrisati to jed?')) return;
    try {
      await axios.delete(`${MENU_SERVICE_URL}/menu/${dishId}`, { headers: authHeader(token) });
      loadMenu();
    } catch (err) {
      alert(err.response?.data?.error || 'Napaka pri brisanju jedi');
    }
  }

  if (loading) return <p>Nalagam meni...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Naš meni</h1>
        {user?.vloga === 'administrator' && (
          <button className="secondary" onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? 'Prekliči' : '+ Dodaj jed'}
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {showAddForm && (
        <form className="card" onSubmit={submitNewDish}>
          <h3>Nova jed</h3>
          <div className="form-group">
            <label>Naziv</label>
            <input
              value={newDish.naziv}
              onChange={(e) => setNewDish({ ...newDish, naziv: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Opis</label>
            <textarea
              value={newDish.opis}
              onChange={(e) => setNewDish({ ...newDish, opis: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Cena (€)</label>
            <input
              type="number"
              step="0.01"
              value={newDish.cena}
              onChange={(e) => setNewDish({ ...newDish, cena: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Kategorija</label>
            <input
              value={newDish.kategorija}
              onChange={(e) => setNewDish({ ...newDish, kategorija: e.target.value })}
              placeholder="npr. pizza, testenine, sladica"
            />
          </div>
          {formError && <p className="error">{formError}</p>}
          <button type="submit" className="primary">
            Shrani jed
          </button>
        </form>
      )}

      <div className="dish-grid">
        {dishes.map((dish) => (
          <div key={dish.id} className="card">
            <h3>{dish.naziv}</h3>
            {dish.kategorija && <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>{dish.kategorija}</p>}
            <p>{dish.opis}</p>
            <p style={{ fontWeight: 700 }}>{Number(dish.cena).toFixed(2)} €</p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {user && (
                <button className="primary" onClick={() => addItem(dish, 1)}>
                  Dodaj v košarico
                </button>
              )}
              <button className="secondary" onClick={() => toggleExpand(dish.id)}>
                {expandedId === dish.id ? 'Skrij komentarje' : 'Prikaži komentarje'}
              </button>
              {user?.vloga === 'administrator' && (
                <button className="danger" onClick={() => deleteDish(dish.id)}>
                  Izbriši
                </button>
              )}
            </div>

            {expandedId === dish.id && (
              <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 10 }}>
                {(dishDetails[dish.id]?.comments || []).length === 0 && (
                  <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Ni še komentarjev.</p>
                )}
                {(dishDetails[dish.id]?.comments || []).map((c) => (
                  <div key={c.id} style={{ marginBottom: 6, fontSize: '0.9rem' }}>
                    <strong>{c.username}:</strong> {c.besedilo}
                  </div>
                ))}
                {user ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input
                      placeholder="Dodaj komentar..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                    />
                    <button className="secondary" onClick={() => submitComment(dish.id)}>
                      Pošlji
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                    Za komentiranje se morate prijaviti.
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}