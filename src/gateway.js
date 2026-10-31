require('dotenv').config();
const express = require('express');
const pinoHttp = require('pino-http');
const { v4: uuidv4 } = require('uuid');
const http = require('http');



const logger = require('./utils/logger');
const apiRoutes = require('./api/routes');
// We will build the Socket.io logic in the next commit
const { initSocket } = require('./sockets/realtime'); 

const app = express();
const server = http.createServer(app);

// 1. Ingress Telemetry: Inject Correlation ID immediately
app.use(pinoHttp({
  logger,
  genReqId: function (req, res) {
    // If a microservice upstream sent an ID, use it. Otherwise, create a new one.
    const id = req.headers['x-correlation-id'] || uuidv4();
    res.setHeader('X-Correlation-ID', id);
    return id;
  }
}));

// 2. Body parsing
app.use(express.json());

// 3. API Routing
app.use('/api', apiRoutes);

// 4. Initialize Real-Time Sockets (Commented out until next step)
initSocket(server);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  logger.info(`API Gateway ingress listening on port ${PORT}`);
});