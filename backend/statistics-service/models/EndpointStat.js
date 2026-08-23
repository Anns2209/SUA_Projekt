const mongoose = require('mongoose');

const endpointStatSchema = new mongoose.Schema({
  endpoint: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  lastCalledAt: { type: Date, default: null },
});

module.exports = mongoose.model('EndpointStat', endpointStatSchema);