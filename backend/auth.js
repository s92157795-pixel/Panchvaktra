const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUTH_FILE = path.join(__dirname, '..', 'data', 'auth.json');
const activeSessions = new Map(); // token -> { createdAt, expiresAt }
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Rate-limiting for owner login: 3 attempts max per client IP
const loginAttempts = new Map(); // ip -> { count: number, lockedUntil: number }
const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes lockout

// Master Recovery Key for emergency owner password reset
const DEFAULT_RECOVERY_KEY = process.env.OWNER_RECOVERY_KEY || 'PV-OWNER-MASTER-2026';

// Hash password with PBKDF2
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

// Ensure auth file exists with default owner credentials if not created yet
function ensureAuthFile() {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(AUTH_FILE)) {
    const salt = crypto.randomBytes(16).toString('hex');
    const defaultPassword = process.env.ADMIN_PASSWORD || 'Panchvaktra@2026';
    const initialConfig = {
      salt,
      passwordHash: hashPassword(defaultPassword, salt),
      recoveryKey: DEFAULT_RECOVERY_KEY,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(AUTH_FILE, JSON.stringify(initialConfig, null, 2), 'utf8');
    console.log('[SECURITY] Initialized owner authentication with default password: Panchvaktra@2026');
  } else {
    // Ensure recoveryKey is recorded in existing file
    try {
      const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
      if (!data.recoveryKey) {
        data.recoveryKey = DEFAULT_RECOVERY_KEY;
        fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), 'utf8');
      }
    } catch (e) {}
  }
}

// Read auth config
function getAuthConfig() {
  ensureAuthFile();
  try {
    const data = fs.readFileSync(AUTH_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to read auth config:', err);
    return null;
  }
}

// Verify entered password against stored salt and hash
function verifyPassword(enteredPassword) {
  if (!enteredPassword || typeof enteredPassword !== 'string') return false;
  const config = getAuthConfig();
  if (!config || !config.salt || !config.passwordHash) return false;
  const hash = hashPassword(enteredPassword, config.salt);
  const bufA = Buffer.from(hash, 'hex');
  const bufB = Buffer.from(config.passwordHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Update owner password
function updatePassword(newPassword) {
  ensureAuthFile();
  const salt = crypto.randomBytes(16).toString('hex');
  const existingConfig = getAuthConfig() || {};
  const config = {
    ...existingConfig,
    salt,
    passwordHash: hashPassword(newPassword, salt),
    recoveryKey: existingConfig.recoveryKey || DEFAULT_RECOVERY_KEY,
    updatedAt: new Date().toISOString()
  };
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[AUTH ERROR] Could not persist new password to disk:', err.message);
  }
  // Invalidate all active sessions when password is changed
  activeSessions.clear();
  return true;
}

// Verify recovery key with constant-time cryptographic hash comparison
function verifyRecoveryKey(enteredKey) {
  if (!enteredKey || typeof enteredKey !== 'string') return false;
  const config = getAuthConfig();
  const masterKey = (config && config.recoveryKey) ? config.recoveryKey : DEFAULT_RECOVERY_KEY;
  const cleanEntered = enteredKey.trim();
  const cleanMaster = (masterKey || '').trim();

  const bufEntered = crypto.createHash('sha256').update(cleanEntered).digest();
  const bufMaster = crypto.createHash('sha256').update(cleanMaster).digest();
  return crypto.timingSafeEqual(bufEntered, bufMaster);
}

// Reset password using master recovery key
function resetPasswordWithRecoveryKey(recoveryKey, newPassword, clientIp) {
  if (!verifyRecoveryKey(recoveryKey)) {
    return { success: false, error: 'Invalid Master Recovery Key. Please check the key and try again.' };
  }
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters long.' };
  }
  updatePassword(newPassword);
  resetLoginAttempts(clientIp);
  return { success: true, message: 'Owner password has been successfully reset. You may now sign in.' };
}

// Get login attempt status for client IP
function getLoginAttemptStatus(ip) {
  const record = loginAttempts.get(ip);
  if (!record) {
    return { allowed: true, remainingTries: MAX_LOGIN_ATTEMPTS, locked: false, lockoutRemainingSecs: 0 };
  }

  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingSecs = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, remainingTries: 0, locked: true, lockoutRemainingSecs: remainingSecs };
  }

  // If lockout duration has elapsed, clear record
  if (record.lockedUntil && now >= record.lockedUntil) {
    loginAttempts.delete(ip);
    return { allowed: true, remainingTries: MAX_LOGIN_ATTEMPTS, locked: false, lockoutRemainingSecs: 0 };
  }

  const remainingTries = Math.max(0, MAX_LOGIN_ATTEMPTS - (record.count || 0));
  return { allowed: true, remainingTries, locked: false, lockoutRemainingSecs: 0 };
}

// Record a failed login attempt for client IP
function recordFailedLogin(ip) {
  const now = Date.now();
  let record = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  
  // If previously expired, reset
  if (record.lockedUntil && now >= record.lockedUntil) {
    record = { count: 0, lockedUntil: 0 };
  }

  record.count = (record.count || 0) + 1;

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    loginAttempts.set(ip, record);
    return {
      locked: true,
      remainingTries: 0,
      lockoutRemainingSecs: Math.ceil(LOCKOUT_DURATION_MS / 1000)
    };
  }

  loginAttempts.set(ip, record);
  return {
    locked: false,
    remainingTries: Math.max(0, MAX_LOGIN_ATTEMPTS - record.count),
    lockoutRemainingSecs: 0
  };
}

// Reset failed login attempts on successful authentication
function resetLoginAttempts(ip) {
  if (ip) {
    loginAttempts.delete(ip);
  }
}

// Create new session token for owner
function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  activeSessions.set(token, {
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  });
  return token;
}

// Destroy a session token
function destroySession(token) {
  if (token) {
    activeSessions.delete(token);
  }
}

// Extract token from request (Authorization header only to enforce non-persistent session on refresh)
function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

// Verify if incoming request belongs to the authenticated owner
function isAuthenticated(req) {
  const token = extractToken(req);
  if (!token) return false;

  const session = activeSessions.get(token);
  if (!session) return false;

  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return false;
  }

  return true;
}

// Periodically sweep expired sessions and expired lockout records to prevent memory growth
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, session] of activeSessions.entries()) {
    if (now > session.expiresAt) {
      activeSessions.delete(token);
    }
  }
  for (const [ip, record] of loginAttempts.entries()) {
    if (record.lockedUntil && now >= record.lockedUntil) {
      loginAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

module.exports = {
  ensureAuthFile,
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
  isAuthenticated,
  DEFAULT_RECOVERY_KEY
};
