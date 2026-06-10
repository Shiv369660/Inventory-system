const serverless = require('serverless-http');
const ejs = require('ejs'); // Force bundling of ejs
const app = require('../../server');

// Wrap Express app with serverless-http
const handler = serverless(app);

module.exports = { handler };
