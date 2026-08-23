import { useEffect, useState } from 'react';
import axios from 'axios';
import { STATISTICS_SERVICE_URL } from '../lib/api';

export default function Stats() {
  const [counts, setCounts] = useState([]);
  const [lastCalled, setLastCalled] = useState(null);
  const [mostCalled, setMostCalled] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    setError('');
    try {
      const [countsRes, lastRes, mostRes] = await Promise.allSettled([
        axios.get(`${STATISTICS_SERVICE_URL}/stats/counts`),
        axios.get(`${STATISTICS_SERVICE_URL}/stats/last-called`),
        axios.get(`${STATISTICS_SERVICE_URL}/stats/most-called`),
      ]);

      if (countsRes.status === 'fulfilled') setCounts(countsRes.value.data);
      if (lastRes.status === 'fulfilled') setLastCalled(lastRes.value.data);
      if (mostRes.status === 'fulfilled') setMostCalled(mostRes.value.data);

      if (countsRes.status === 'rejected') {
        setError(
          'Napaka pri nalaganju statistike. Statistics Service je morda ravno "zaspal" (Render brezplačni tier) — poskusi znova čez ~30 sekund.'
        );
      }
    } catch (err) {
      setError('Napaka pri povezavi s Statistics Service.');
    } finally {
      setLoading(false);
    }
  }

  const maxCount = counts.length > 0 ? Math.max(...counts.map((c) => c.count)) : 1;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Statistika API klicev</h1>
        <button className="secondary" onClick={loadStats}>
          Osveži
        </button>
      </div>
      <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>
        Prikazuje število klicev po posameznem endpointu Order Service (podatki iz Statistics
        Service, gostovan na Render, shranjeni v MongoDB Atlas).
      </p>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>Nalagam statistiko...</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            {mostCalled && (
              <div className="card" style={{ flex: 1, minWidth: 220 }}>
                <p style={{ opacity: 0.6, fontSize: '0.85rem', marginBottom: 4 }}>
                  Najpogosteje klican endpoint
                </p>
                <p style={{ fontSize: '1.3rem', fontWeight: 700 }}>{mostCalled.endpoint}</p>
                <p style={{ opacity: 0.7 }}>{mostCalled.count}× klican</p>
              </div>
            )}
            {lastCalled && (
              <div className="card" style={{ flex: 1, minWidth: 220 }}>
                <p style={{ opacity: 0.6, fontSize: '0.85rem', marginBottom: 4 }}>
                  Zadnje klican endpoint
                </p>
                <p style={{ fontSize: '1.3rem', fontWeight: 700 }}>{lastCalled.endpoint}</p>
                <p style={{ opacity: 0.7 }}>
                  {new Date(lastCalled.lastCalledAt).toLocaleString('sl-SI')}
                </p>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Število klicev po endpointu</h3>
            {counts.length === 0 ? (
              <p style={{ opacity: 0.6 }}>Ni še zabeleženih klicev.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {counts.map((c) => (
                  <div key={c.endpoint}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.9rem',
                        marginBottom: 4,
                      }}
                    >
                      <span>
                        <code>{c.endpoint}</code>
                      </span>
                      <span style={{ fontWeight: 600 }}>{c.count}</span>
                    </div>
                    <div style={{ background: '#eee', borderRadius: 6, height: 10 }}>
                      <div
                        style={{
                          width: `${(c.count / maxCount) * 100}%`,
                          background: '#7a3b2e',
                          height: '100%',
                          borderRadius: 6,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}