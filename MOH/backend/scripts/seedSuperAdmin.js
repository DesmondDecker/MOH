/**
 * One-time bootstrap script: creates the initial MoH super admin account.
 * Run with: node scripts/seedSuperAdmin.js
 * Refuses to run if a super admin already exists — this is a bootstrap
 * step, not a way to mint extra super admins.
 */
require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const auditService = require('../services/auditService');

async function seed() {
  await connectDB();

  const existing = await User.findOne({ role: 'moh_super_admin' });
  if (existing) {
    console.log('[seed] A moh_super_admin already exists. Refusing to create another via this script.');
    console.log(`[seed] Existing super admin username: ${existing.username}`);
    process.exit(0);
  }

  const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('[seed] BOOTSTRAP_SUPER_ADMIN_EMAIL and BOOTSTRAP_SUPER_ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  const admin = new User({
    role: 'moh_super_admin',
    fullName: 'Ministry of Health Super Admin',
    email,
    username: 'moh.superadmin',
    mustChangePassword: true,
  });
  await admin.setPassword(password);
  await admin.save();

  await auditService.record({
    actorId: admin._id,
    actorRole: 'moh_super_admin',
    action: 'super_admin_bootstrapped',
    targetType: 'User',
    targetId: admin._id,
  });

  console.log('[seed] MoH super admin created.');
  console.log(`[seed] username: ${admin.username}`);
  console.log(`[seed] password: ${password} (change immediately on first login)`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
