import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '', vloga: 'uporabnik' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(form.username, form.password, form.vloga);
      await router.push(user.vloga === 'administrator' ? '/admin/shipping' : '/menu');
    } catch (err) {
      setError(err.response?.data?.error || 'Prijava ni uspela.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h1>Prijava</h1>
      <form onSubmit={submit}>
        <div className="form-group">
          <label htmlFor="username">Uporabniško ime</label>
          <input id="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        </div>
        <div className="form-group">
          <label htmlFor="password">Geslo</label>
          <input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </div>
        <div className="form-group">
          <label htmlFor="vloga">Prijava kot</label>
          <select id="vloga" value={form.vloga} onChange={(e) => setForm({ ...form, vloga: e.target.value })}>
            <option value="uporabnik">Uporabnik</option>
            <option value="administrator">Administrator</option>
          </select>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={submitting}>{submitting ? 'Prijavljanje ...' : 'Prijava'}</button>
      </form>
    </div>
  );
}
