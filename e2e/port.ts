export const E2E_PORT = Number(process.env.E2E_PORT ?? 3123);

/**
 * The app is opened on http://localhost, not 127.0.0.1: `next start` runs with NODE_ENV=production,
 * so the session/state cookies are Secure, and browsers accept Secure cookies over plain http only
 * on localhost. APP_BASE_URL (OAuth callback) uses the same origin so the state cookie comes back.
 */
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
