import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';

const initial = { ime: '', priimek: '', email: '', username: '', password: '' };

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(form);
      await router.push('/login');
    } catch (err) {
      setError(err.response?.data?.error || 'Registracija ni uspela.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h1>Registracija</h1>
      <form onSubmit={submit}>
        {[
          ['ime', 'Ime', 'text'], ['priimek', 'Priimek', 'text'], ['email', 'E-pošta', 'email'],
          ['username', 'Uporabniško ime', 'text'], ['password', 'Geslo', 'password'],
        ].map(([name, label, type]) => (
          <div className="form-group" key={name}>
            <label htmlFor={name}>{label}</label>
            <input id={name} type={type} value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} required />
          </div>
        ))}
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={submitting}>{submitting ? 'Registriranje ...' : 'Ustvari račun'}</button>
      </form>
    </div>
  );
}
