require('dotenv').config();
const http = require('http');

const createApp = require('./app');
const connectDB = require('./config/db');
const socketService = require('./services/socketService');

const app = createApp();
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const PORT = process.env.PORT || 5000;

// Express app is wrapped in a plain HTTP server so Socket.io can attach to
// the same port instead of needing a second listener/port to manage.
const httpServer = http.createServer(app);
socketService.init(httpServer, CORS_ORIGIN);

connectDB()
  .then(() => {
    httpServer.listen(PORT, () => console.log(`[server] Listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('[server] Failed to connect to database:', err.message);
    process.exit(1);
  });

module.exports = httpServer;
