require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Conversation = require('./Conversation');
const User = require('./User');
const Message = require('./Message');
const Settings = require('./Settings'); // Import Settings model

const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
  console.error('MONGO_URI is not defined in the environment variables.');
  process.exit(1);
}

async function cleanDatabase() {
  await mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    // Remove all documents from all collections
    await Promise.all([
      Conversation.deleteMany({}),
      User.deleteMany({}),
      Message.deleteMany({}),
      Settings.deleteMany({}) // Clear the Settings collection
    ]);

    console.log('All collections cleaned successfully.');
  } catch (error) {
    console.error('Error cleaning database:', error);
  } finally {
    await mongoose.disconnect();
  }
}

cleanDatabase();
