import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import { setupAxiosInterceptors } from '../lib/axiosInterceptor';

export default function AuthErrorHandler() {
  const { logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setupAxiosInterceptors(() => {
      logout();
      // Ne preusmerjaj, če je uporabnik že na /login ali /register
      if (router.pathname !== '/login' && router.pathname !== '/register') {
        router.push('/login');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}