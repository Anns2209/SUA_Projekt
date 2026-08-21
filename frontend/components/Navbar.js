import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link href="/">🍽️ Gostilna</Link>
      </div>
      <div className="navbar-links">
        <Link href="/menu">Meni</Link>
        {user && <Link href="/cart">Košarica{count > 0 ? ` (${count})` : ''}</Link>}
        {user && <Link href="/orders">Moja naročila</Link>}
        {user?.vloga === 'administrator' && <Link href="/admin/shipping">Dostave (admin)</Link>}
        {user ? (
          <>
            <span className="navbar-user">Živjo, {user.ime}</span>
            <button onClick={logout} className="btn-link">
              Odjava
            </button>
          </>
        ) : (
          <>
            <Link href="/login">Prijava</Link>
            <Link href="/register">Registracija</Link>
          </>
        )}
      </div>
    </nav>
  );
}