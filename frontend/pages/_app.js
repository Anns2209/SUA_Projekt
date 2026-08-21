import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import Navbar from '../components/Navbar';
import AuthErrorHandler from '../components/AuthErrorHandler';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <CartProvider>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <AuthErrorHandler />
        <Navbar />
        <main className="container">
          <Component {...pageProps} />
        </main>
      </CartProvider>
    </AuthProvider>
  );
}