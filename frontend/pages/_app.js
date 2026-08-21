import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import Navbar from '../components/Navbar';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <CartProvider>
        <Navbar />
        <main className="container">
          <Component {...pageProps} />
        </main>
      </CartProvider>
    </AuthProvider>
  );
}