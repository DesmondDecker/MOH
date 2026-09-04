const express = require('express');
const router = express.Router();
const { SIERRA_LEONE_PROVINCES } = require('../constants/sierraLeoneAdmin');
const { authenticate, blockUntilPasswordChanged } = require('../middleware/auth');

// Any authenticated role can read this — it's static administrative
// geography, not sensitive data, and several roles need it (MoH super
// admin for facility registration, facility admin for their own facility's
// district display). No role restriction beyond "is a logged-in user".
router.use(authenticate, blockUntilPasswordChanged);

// GET /api/reference/sierra-leone-admin — { "Eastern Province": ["Kailahun", ...], ... }
router.get('/sierra-leone-admin', (req, res) => {
  res.json(SIERRA_LEONE_PROVINCES);
});

module.exports = router;
