import axios from 'axios';
import toast from 'react-hot-toast';

let initialized = false;

/**
 * Registrira globalni axios interceptor, ki ujame VSAK 401 odgovor
 * (neveljaven ali potekel JWT žeton) iz katerekoli mikrostoritve in
 * ga izpiše kot toast sporočilo. Ker vse strani uporabljajo isti
 * uvoženi `axios` modul, se interceptor uporabi za vse klice v aplikaciji.
 *
 * onUnauthorized: callback, ki ga pokličemo, da odjavimo uporabnika
 * in ga preusmerimo na /login (nastavljeno iz AuthContext + router).
 */
export function setupAxiosInterceptors(onUnauthorized) {
  if (initialized) return;
  initialized = true;

  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error.response?.status;

      if (status === 401) {
        const serverMessage = error.response?.data?.error || '';
        let toastMessage = 'Vaša seja ni veljavna. Prijavite se znova.';

        if (serverMessage.toLowerCase().includes('potekel')) {
          toastMessage = 'Vaša seja je potekla. Prijavite se znova.';
        } else if (serverMessage.toLowerCase().includes('preklican')) {
          toastMessage = 'Seja je bila preklicana (odjava iz vseh naprav). Prijavite se znova.';
        } else if (serverMessage.toLowerCase().includes('manjkajoč')) {
          toastMessage = 'Za to dejanje se morate prijaviti.';
        }

        toast.error(toastMessage);

        if (onUnauthorized) onUnauthorized();
      }

      return Promise.reject(error);
    }
  );
}