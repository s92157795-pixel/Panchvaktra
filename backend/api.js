const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  verifyPassword,
  updatePassword,
  verifyRecoveryKey,
  resetPasswordWithRecoveryKey,
  getLoginAttemptStatus,
  recordFailedLogin,
  resetLoginAttempts,
  createSession,
  destroySession,
  extractToken,
  isAuthenticated
} = require('./auth');

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
const DATA_FILE = isServerless
  ? path.join('/tmp', 'panchvaktra-submissions.json')
  : path.join(__dirname, '..', 'data', 'submissions.json');

// Helper to determine client IP for rate limiting
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// Ensure data file and directory exist safely
function ensureDataFile() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {}
    }
    if (!fs.existsSync(DATA_FILE)) {
      try {
        fs.writeFileSync(DATA_FILE, '[]', 'utf8');
      } catch (e) {}
    }
  } catch (err) {
    // Non-fatal on serverless read-only filesystem
  }
}

let inMemorySubmissions = null;

// Read submissions safely with fallback
async function readSubmissions() {
  if (inMemorySubmissions !== null) return inMemorySubmissions;
  ensureDataFile();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = await fs.promises.readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw || '[]');
      inMemorySubmissions = parsed;
      return parsed;
    }
  } catch (err) {
    console.warn('[BACKEND WARN] Error reading submissions file:', err.message);
  }
  inMemorySubmissions = [];
  return inMemorySubmissions;
}

// Write submissions safely (atomic write via temp file with memory fallback)
async function writeSubmissions(data) {
  inMemorySubmissions = data;
  ensureDataFile();
  try {
    const tmpFile = `${DATA_FILE}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.promises.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tmpFile, DATA_FILE);
  } catch (err) {
    console.warn('[BACKEND WARN] Disk write failed (serverless/readonly), retained safely in memory:', err.message);
  }
}

// Parse JSON request body with size limit (max 1MB)
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    const MAX_SIZE = 1024 * 1024; // 1 MB
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > MAX_SIZE) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Helper to send JSON responses with CORS and Security headers
function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...extraHeaders
  };
  res.writeHead(statusCode, headers);
  res.end(body);
}

// Simple email validation
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.length <= 150;
}

// Sanitize string with maximum length protection
function cleanStr(str, maxLen = 5000) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}

/**
 * Main API request dispatcher
 * Returns true if the request was handled, false otherwise
 */
async function handleApiRequest(req, res) {
  // Support direct local requests as well as Vercel/proxy rewrites
  const rawUrl =
    req.headers['x-vercel-original-path'] ||
    req.headers['x-matched-path'] ||
    req.headers['x-forwarded-uri'] ||
    req.url;

  const urlObj = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`);
  let pathname = urlObj.pathname;
  const method = req.method.toUpperCase();

  // If Vercel passed target path via query string
  if (pathname === '/api' || pathname === '/api/') {
    const queryPath = urlObj.searchParams.get('path');
    if (queryPath) {
      pathname = queryPath.startsWith('/') ? queryPath : `/${queryPath}`;
    }
  }

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return true;
  }

  // Root /api endpoint returns healthy service status
  if (pathname === '/api' || pathname === '/api/') {
    sendJson(res, 200, {
      success: true,
      service: 'Panchvaktra Backend Service',
      status: 'healthy',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
    return true;
  }

  // Only handle paths starting with /api/
  if (!pathname.startsWith('/api/')) {
    return false;
  }

  try {
    // ----------------------------------------------------
    // AUTHENTICATION ENDPOINTS
    // ----------------------------------------------------

    // 0. Check Login Rate Limit Status: GET /api/auth/login-status
    if (pathname === '/api/auth/login-status' && method === 'GET') {
      const clientIp = getClientIp(req);
      const status = getLoginAttemptStatus(clientIp);
      sendJson(res, 200, { success: true, ...status });
      return true;
    }

    // 1. Owner Login: POST /api/auth/login (Enforces 3 attempts limit, no persistent cookie)
    if (pathname === '/api/auth/login' && method === 'POST') {
      const clientIp = getClientIp(req);
      const attemptStatus = getLoginAttemptStatus(clientIp);

      if (!attemptStatus.allowed) {
        console.warn(`[SECURITY] Blocked login attempt from locked IP ${clientIp}`);
        sendJson(res, 429, {
          success: false,
          locked: true,
          remainingTries: 0,
          lockoutRemainingSecs: attemptStatus.lockoutRemainingSecs,
          error: `Account temporarily locked due to 3 failed attempts. Please wait ${attemptStatus.lockoutRemainingSecs}s or use Forgot Password to reset.`
        });
        return true;
      }

      const body = await parseBody(req);
      const password = cleanStr(body.password);

      if (!password) {
        sendJson(res, 400, { success: false, error: 'Password is required' });
        return true;
      }

      if (!verifyPassword(password)) {
        const failRecord = recordFailedLogin(clientIp);
        console.warn(`[SECURITY] Failed owner login attempt from ${clientIp}. Remaining tries: ${failRecord.remainingTries}`);
        
        if (failRecord.locked) {
          sendJson(res, 429, {
            success: false,
            locked: true,
            remainingTries: 0,
            lockoutRemainingSecs: failRecord.lockoutRemainingSecs,
            error: 'Maximum 3 attempts reached. Admin panel locked for 5 minutes. Use Forgot Password to reset.'
          });
        } else {
          sendJson(res, 401, {
            success: false,
            locked: false,
            remainingTries: failRecord.remainingTries,
            error: `Invalid owner password. ${failRecord.remainingTries} attempt${failRecord.remainingTries === 1 ? '' : 's'} remaining.`
          });
        }
        return true;
      }

      // Successful password verification
      resetLoginAttempts(clientIp);
      const token = createSession();
      console.log(`[SECURITY] Owner successfully authenticated from ${clientIp}`);
      sendJson(res, 200, {
        success: true,
        message: 'Owner authenticated successfully',
        token
      });
      return true;
    }

    // 2. Owner Logout: POST /api/auth/logout
    if (pathname === '/api/auth/logout' && method === 'POST') {
      const token = extractToken(req);
      destroySession(token);
      sendJson(res, 200, { success: true, message: 'Logged out successfully' });
      return true;
    }

    // 3. Check Auth Status: GET /api/auth/check (In-memory token verification)
    if (pathname === '/api/auth/check' && method === 'GET') {
      const auth = isAuthenticated(req);
      sendJson(res, 200, { success: true, authenticated: auth });
      return true;
    }

    // 4. Forgot / Reset Password: POST /api/auth/forgot-password
    if (pathname === '/api/auth/forgot-password' && method === 'POST') {
      const clientIp = getClientIp(req);
      const body = await parseBody(req);
      const recoveryKey = cleanStr(body.recoveryKey);
      const newPassword = cleanStr(body.newPassword);

      if (!recoveryKey) {
        sendJson(res, 400, { success: false, error: 'Master Recovery Key is required.' });
        return true;
      }
      if (!newPassword || newPassword.length < 8) {
        sendJson(res, 400, { success: false, error: 'New password must be at least 8 characters long.' });
        return true;
      }

      const result = resetPasswordWithRecoveryKey(recoveryKey, newPassword, clientIp);
      if (!result.success) {
        console.warn(`[SECURITY] Failed password recovery attempt from ${clientIp}`);
        sendJson(res, 400, result);
        return true;
      }

      console.log(`[SECURITY] Owner password successfully reset via Master Recovery Key from ${clientIp}`);
      sendJson(res, 200, result);
      return true;
    }

    // 5. Change Password (Authenticated): POST /api/auth/change-password
    if (pathname === '/api/auth/change-password' && method === 'POST') {
      if (!isAuthenticated(req)) {
        sendJson(res, 401, { success: false, error: 'Unauthorized: Owner access required' });
        return true;
      }

      const body = await parseBody(req);
      const currentPassword = cleanStr(body.currentPassword);
      const newPassword = cleanStr(body.newPassword);

      if (!verifyPassword(currentPassword)) {
        sendJson(res, 400, { success: false, error: 'Current password does not match' });
        return true;
      }
      if (!newPassword || newPassword.length < 8) {
        sendJson(res, 400, { success: false, error: 'New password must be at least 8 characters' });
        return true;
      }

      updatePassword(newPassword);
      const newToken = createSession();
      console.log(`[SECURITY] Owner password was changed successfully`);
      sendJson(res, 200, {
        success: true,
        message: 'Password updated successfully',
        token: newToken
      });
      return true;
    }

    // ----------------------------------------------------
    // PUBLIC INTAKE ENDPOINTS (Visitors can submit, cannot read)
    // ----------------------------------------------------

    // 5. Health check: GET /api/health (Strictly technical info, no personal data)
    if (pathname === '/api/health' && method === 'GET') {
      sendJson(res, 200, {
        success: true,
        service: 'Panchvaktra Backend Service',
        status: 'healthy',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      });
      return true;
    }

    // 6. NGO Inquiry & Contact intake: POST /api/inquiry or POST /api/contact
    if ((pathname === '/api/inquiry' || pathname === '/api/contact') && method === 'POST') {
      const body = await parseBody(req);

      // Honeypot spam protection
      if (body.website || body.bot_check) {
        console.warn(`[SECURITY] Bot submission trapped by honeypot from ${req.socket.remoteAddress}`);
        sendJson(res, 200, { success: true, message: 'Inquiry received' });
        return true;
      }

      const name = cleanStr(body.name);
      const email = cleanStr(body.email);
      const phone = cleanStr(body.phone);
      const inquiryType = cleanStr(body.inquiryType) || cleanStr(body.type) || 'General Inquiry';
      const organization = cleanStr(body.organization);
      const subject = cleanStr(body.subject) || 'General Inquiry';
      const message = cleanStr(body.message);
      const consent = body.consent === true || body.consent === 'true' || body.consent === 'on' || body.consent === 1;

      // Server-side validation
      if (!name || name.length < 2) {
        sendJson(res, 400, { success: false, error: 'Full name is required (minimum 2 characters)' });
        return true;
      }
      if (!isValidEmail(email)) {
        sendJson(res, 400, { success: false, error: 'A valid email address is required' });
        return true;
      }
      if (phone && !/^[\d\s+\-().]{7,25}$/.test(phone)) {
        sendJson(res, 400, { success: false, error: 'Please enter a valid phone number (e.g. +91 98765 43210) or leave blank' });
        return true;
      }
      if (!subject || subject.length < 3) {
        sendJson(res, 400, { success: false, error: 'Subject is required (minimum 3 characters)' });
        return true;
      }
      if (!message || message.length < 8) {
        sendJson(res, 400, { success: false, error: 'Message must be at least 8 characters long' });
        return true;
      }
      if (pathname === '/api/inquiry' && !consent) {
        sendJson(res, 400, { success: false, error: 'Please accept the privacy consent to submit your inquiry' });
        return true;
      }

      const submission = {
        id: `inq_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        type: 'inquiry',
        name,
        email,
        phone,
        inquiryType,
        organization,
        subject,
        message,
        consent: true,
        status: 'new',
        createdAt: new Date().toISOString()
      };

      const items = await readSubmissions();
      items.unshift(submission);
      await writeSubmissions(items);

      console.log(`[BACKEND] New inquiry received: [${inquiryType}] from ${name} (${email})`);
      sendJson(res, 201, {
        success: true,
        message: 'Thank You for Reaching Out! Your inquiry has been received. Our team will review your message and get back to you as soon as possible.',
        id: submission.id
      });
      return true;
    }

    // 7. Volunteer signup: POST /api/volunteer
    if (pathname === '/api/volunteer' && method === 'POST') {
      const body = await parseBody(req);
      const name = cleanStr(body.name);
      const email = cleanStr(body.email);
      const phone = cleanStr(body.phone);
      const interest = cleanStr(body.interest) || 'General Support';
      const availability = cleanStr(body.availability) || 'Flexible';
      const message = cleanStr(body.message);

      if (!name) {
        sendJson(res, 400, { success: false, error: 'Name is required' });
        return true;
      }
      if (!isValidEmail(email)) {
        sendJson(res, 400, { success: false, error: 'A valid email address is required' });
        return true;
      }

      const submission = {
        id: `vol_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        type: 'volunteer',
        name,
        email,
        phone,
        interest,
        availability,
        message,
        status: 'new',
        createdAt: new Date().toISOString()
      };

      const items = await readSubmissions();
      items.unshift(submission);
      await writeSubmissions(items);

      console.log(`[BACKEND] New volunteer application received`);
      sendJson(res, 201, {
        success: true,
        message: 'Thank you for stepping forward to volunteer! Panchvaktra Foundation coordinators will reach out shortly.',
        id: submission.id
      });
      return true;
    }

    // 8. Donation pledge: POST /api/donate
    if (pathname === '/api/donate' && method === 'POST') {
      const body = await parseBody(req);
      const name = cleanStr(body.name);
      const email = cleanStr(body.email);
      const phone = cleanStr(body.phone);
      const amount = cleanStr(body.amount) || 'Custom';
      const cause = cleanStr(body.cause) || 'Child Education & Shelter';
      const message = cleanStr(body.message);

      if (!name) {
        sendJson(res, 400, { success: false, error: 'Name is required' });
        return true;
      }
      if (!isValidEmail(email)) {
        sendJson(res, 400, { success: false, error: 'A valid email address is required' });
        return true;
      }

      const submission = {
        id: `don_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        type: 'donation',
        name,
        email,
        phone,
        amount,
        cause,
        message,
        status: 'new',
        createdAt: new Date().toISOString()
      };

      const items = await readSubmissions();
      items.unshift(submission);
      await writeSubmissions(items);

      console.log(`[BACKEND] New donation pledge received`);
      sendJson(res, 201, {
        success: true,
        message: 'Thank you for your generous support pledge! We will share formal acknowledgement & contribution details.',
        id: submission.id
      });
      return true;
    }

    // 9. Newsletter subscription: POST /api/newsletter
    if (pathname === '/api/newsletter' && method === 'POST') {
      const body = await parseBody(req);
      const email = cleanStr(body.email);

      if (!isValidEmail(email)) {
        sendJson(res, 400, { success: false, error: 'Please provide a valid email address' });
        return true;
      }

      const items = await readSubmissions();
      const existing = items.find(i => i.type === 'newsletter' && i.email.toLowerCase() === email.toLowerCase());
      if (existing) {
        sendJson(res, 200, {
          success: true,
          message: 'You are already subscribed to Panchvaktra Foundation updates.'
        });
        return true;
      }

      const submission = {
        id: `sub_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        type: 'newsletter',
        email,
        status: 'active',
        createdAt: new Date().toISOString()
      };

      items.unshift(submission);
      await writeSubmissions(items);

      sendJson(res, 201, {
        success: true,
        message: 'Subscribed successfully to Panchvaktra Foundation updates!',
        id: submission.id
      });
      return true;
    }

    // ----------------------------------------------------
    // PROTECTED OWNER-ONLY ENDPOINTS (Strictly Locked)
    // ----------------------------------------------------

    // Gatekeeper: All endpoints below this check require owner authentication
    if (!isAuthenticated(req)) {
      sendJson(res, 401, {
        success: false,
        error: 'Unauthorized: Personal data is protected. Owner login required.'
      });
      return true;
    }

    // 10. Statistics: GET /api/stats (Protected)
    if (pathname === '/api/stats' && method === 'GET') {
      const items = await readSubmissions();
      const stats = {
        total: items.length,
        contacts: items.filter(i => i.type === 'contact').length,
        volunteers: items.filter(i => i.type === 'volunteer').length,
        donations: items.filter(i => i.type === 'donation').length,
        newsletter: items.filter(i => i.type === 'newsletter').length,
        statusNew: items.filter(i => i.status === 'new').length,
        statusContacted: items.filter(i => i.status === 'contacted').length
      };
      sendJson(res, 200, { success: true, stats });
      return true;
    }

    // 11. Get submissions: GET /api/submissions (Protected)
    if (pathname === '/api/submissions' && method === 'GET') {
      const items = await readSubmissions();
      const typeFilter = urlObj.searchParams.get('type');
      const statusFilter = urlObj.searchParams.get('status');
      const search = (urlObj.searchParams.get('search') || '').toLowerCase();

      let filtered = items;
      if (typeFilter && typeFilter !== 'all') {
        filtered = filtered.filter(i => i.type === typeFilter);
      }
      if (statusFilter && statusFilter !== 'all') {
        filtered = filtered.filter(i => i.status === statusFilter);
      }
      if (search) {
        filtered = filtered.filter(i => {
          return (
            (i.name && i.name.toLowerCase().includes(search)) ||
            (i.email && i.email.toLowerCase().includes(search)) ||
            (i.message && i.message.toLowerCase().includes(search)) ||
            (i.subject && i.subject.toLowerCase().includes(search)) ||
            (i.cause && i.cause.toLowerCase().includes(search)) ||
            (i.interest && i.interest.toLowerCase().includes(search))
          );
        });
      }

      sendJson(res, 200, {
        success: true,
        total: filtered.length,
        submissions: filtered
      });
      return true;
    }

    // 12. Update submission status: PATCH /api/submissions/:id (Protected)
    if (pathname.startsWith('/api/submissions/') && method === 'PATCH') {
      const id = pathname.replace('/api/submissions/', '').trim();
      const body = await parseBody(req);
      const items = await readSubmissions();
      const target = items.find(i => i.id === id);

      if (!target) {
        sendJson(res, 404, { success: false, error: 'Submission not found' });
        return true;
      }

      if (body.status) {
        target.status = cleanStr(body.status);
      }
      if (body.notes !== undefined) {
        target.notes = cleanStr(body.notes);
      }
      target.updatedAt = new Date().toISOString();

      await writeSubmissions(items);
      sendJson(res, 200, { success: true, submission: target });
      return true;
    }

    // 13. Delete submission: DELETE /api/submissions/:id (Protected)
    if (pathname.startsWith('/api/submissions/') && method === 'DELETE') {
      const id = pathname.replace('/api/submissions/', '').trim();
      const items = await readSubmissions();
      const filtered = items.filter(i => i.id !== id);

      if (filtered.length === items.length) {
        sendJson(res, 404, { success: false, error: 'Submission not found' });
        return true;
      }

      await writeSubmissions(filtered);
      sendJson(res, 200, { success: true, message: 'Submission deleted successfully' });
      return true;
    }

    // 14. Export to CSV: GET /api/export (Protected)
    if (pathname === '/api/export' && method === 'GET') {
      const items = await readSubmissions();
      const headers = ['ID', 'Type', 'Inquiry Type', 'Organization', 'Name', 'Email', 'Phone', 'Subject/Interest/Cause', 'Message/Notes', 'Status', 'Date'];
      const rows = items.map(i => [
        `"${i.id || ''}"`,
        `"${i.type || ''}"`,
        `"${(i.inquiryType || '').replace(/"/g, '""')}"`,
        `"${(i.organization || '').replace(/"/g, '""')}"`,
        `"${(i.name || '').replace(/"/g, '""')}"`,
        `"${(i.email || '').replace(/"/g, '""')}"`,
        `"${(i.phone || '').replace(/"/g, '""')}"`,
        `"${(i.subject || i.interest || i.cause || '').replace(/"/g, '""')}"`,
        `"${(i.message || i.notes || '').replace(/"/g, '""')}"`,
        `"${i.status || ''}"`,
        `"${i.createdAt || ''}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="panchvaktra-submissions.csv"',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(csvContent);
      return true;
    }

    // Unknown API endpoint
    sendJson(res, 404, { success: false, error: 'Endpoint not found' });
    return true;

  } catch (err) {
    console.error('[BACKEND ERROR]', err);
    sendJson(res, 500, { success: false, error: err.message || 'Internal server error' });
    return true;
  }
}

module.exports = {
  handleApiRequest,
  readSubmissions,
  writeSubmissions
};
