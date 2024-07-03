const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  language: { type: String, required: true },
  dialect: { type: String, default: 'default' },
  location: { type: String, default: 'unknown' }
});

const Settings = mongoose.model('Settings', settingsSchema);
module.exports = Settings;
