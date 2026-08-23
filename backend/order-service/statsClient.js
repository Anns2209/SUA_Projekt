// Poroča Statistics Service o vsakem klicanem endpointu.
// "Fire-and-forget": ne čakamo na odgovor in napaka pri poročanju
// NIKOLI ne sme podreti glavne poslovne logike Order Service.

const axios = require('axios');

const STATISTICS_SERVICE_URL = process.env.STATISTICS_SERVICE_URL || 'http://localhost:5006';

function reportStat(endpoint) {
  axios
    .post(
      `${STATISTICS_SERVICE_URL}/stats/update`,
      { klicanaStoritev: endpoint },
      { timeout: 3000 }
    )
    .catch((err) => {
      console.log(`[order-service] Napaka pri poročanju statistike: ${err.message}`);
    });
}

module.exports = { reportStat };