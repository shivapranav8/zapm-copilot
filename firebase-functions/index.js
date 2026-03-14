const { onRequest } = require('firebase-functions/v2/https');

// server.bundle.cjs is copied here by the predeploy hook in firebase.json
// Build it first with: npm run build (from project root)
const serverModule = require('./server.bundle.cjs');
const app = serverModule.default || serverModule;

exports.api = onRequest(
  {
    memory: '1GiB',
    timeoutSeconds: 300,
    region: 'us-central1',
    minInstances: 0,
  },
  app
);
