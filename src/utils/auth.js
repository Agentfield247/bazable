import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { getApiBase } from './apiBase.js';
import { logger } from './logger.js';

const CREDENTIALS_PATH = path.join(os.homedir(), '.bazable', 'credentials.json');

// Lazily resolved API base URL (cached once)
let _apiBase = null;
async function resolveApiBase() {
  if (!_apiBase) _apiBase = await getApiBase();
  return _apiBase;
}

async function readCredentials() {
  try {
    const raw = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch { return null; }
}

async function writeCredentials(data) {
  const dir = path.dirname(CREDENTIALS_PATH);
  await fs.mkdir(dir, { mode: 0o700, recursive: true });
  await fs.writeFile(CREDENTIALS_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

/**
 * Check if the cloud backend is reachable.
 * Returns true if the health‑check endpoint responds.
 */
async function checkCloudHealth() {
  const base = await resolveApiBase();
  try {
    await axios.get(`${base}/ping`, { timeout: 5000 });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Request a device code from Bazable Cloud.
 * First verifies the cloud is reachable.
 */
export async function requestDeviceCode() {
  const healthy = await checkCloudHealth();
  if (!healthy) {
    throw new Error(
      'Could not reach Bazable Cloud. Please check your internet connection, or wait a moment and try again.'
    );
  }

  const base = await resolveApiBase();
  const { data } = await axios.post(`${base}/auth/device`);
  return data;
}

/**
 * Poll until the device code is approved (or timeout).
 * Retries on temporary network failures.
 */
export async function pollDeviceCode(deviceCode) {
  const base = await resolveApiBase();
  const maxAttempts = 60; // 5 minutes (5‑second intervals)

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { data } = await axios.post(`${base}/auth/device/poll`, {
        device_code: deviceCode,
      });
      // Save credentials locally
      await writeCredentials(data);
      return data;
    } catch (error) {
      // Network errors – retry silently
      if (
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        (error.message && error.message.toLowerCase().includes('timeout'))
      ) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      // Expected "authorization_pending" – keep polling
      if (
        error.response?.status === 400 &&
        error.response?.data?.error === 'authorization_pending'
      ) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      // Any other error – throw immediately
      throw error;
    }
  }

  throw new Error('Device code expired or timed out.');
}

/**
 * Get the stored access token, or null if not authenticated.
 */
export async function getAuthToken() {
  const creds = await readCredentials();
  return creds?.access_token || null;
}
