/**
 * API Client - Now uses offline-first approach
 * All calls are made to local SQLite database instead of remote backend
 */

export { api, TOKEN_KEY, CURRENT_USER_KEY } from './offline-client';
export { apiLogin, apiRegister, apiGetMe } from './offline-client';
