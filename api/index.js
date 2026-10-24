const { handleApiRequest } = require('../backend/api');

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

module.exports = async (req, res) => {
  try {
    const handled = await handleApiRequest(req, res);
    if (!handled) {
      if (!res.headersSent) {
        res.writeHead(404, SECURITY_HEADERS);
      }
      res.end(JSON.stringify({ success: false, error: 'Endpoint Not Found' }));
    }
  } catch (err) {
    console.error('[VERCEL API ERROR]', err);
    if (!res.headersSent) {
      res.writeHead(500, SECURITY_HEADERS);
    }
    res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
  }
};
