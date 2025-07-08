const mongoose = require('mongoose');

const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  currency: { type: String, default: 'eur' },
  requests: { type: Number, required: true },
  stripePriceId: { type: String },
  paypalPlanId: { type: String },
  isActive: { type: Boolean, default: true },
  features: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Plan', PlanSchema); 