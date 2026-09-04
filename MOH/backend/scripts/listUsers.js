require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');

async function listUsers() {
  try {
    await connectDB();
    const users = await User.find({}, 'username email role status createdAt lastLogin').lean();
    console.log(JSON.stringify(users, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error listing users:', err);
    process.exit(1);
  }
}

listUsers();
