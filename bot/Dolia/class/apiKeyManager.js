import * as env from '../config/env.js';
import { getActionForError, ACTIONS } from '../config/error.js';

class ApiKeyManager {
    constructor(keys) {
        this.pool = keys.map(k => ({
            key: k,
            modelCooldowns: {},
            exhausted: false,
            lastUsed: 0
        }));
        this.index = 0;
    }

    async _getNextKey(modelId, timeoutMs = 10000) {
        const start = Date.now();

        while (true) {
            const now = Date.now();

            for (let i = 0; i < this.pool.length; i++) {
                const idx = (this.index + i) % this.pool.length;
                const entry = this.pool[idx];

                const cooldownEnd = entry.modelCooldowns[modelId] || 0;

                if (!entry.exhausted && cooldownEnd <= now) {
                    this.index = (idx + 1) % this.pool.length;
                    entry.lastUsed = now;
                    return entry.key;
                }
            }

            if (Date.now() - start > timeoutMs) {
                throw new Error(`All API keys are cooling down for model ${modelId}.`);
            }

            await new Promise(r => setTimeout(r, 200));
        }
    }

    markRateLimited(key, modelId, ms = 60000) {
        const entry = this.pool.find(e => e.key === key);
        if (entry) {
            entry.modelCooldowns[modelId] = Date.now() + ms;
        }
    }

    // Optional: currently not used but good for global bans
    markExhausted(key, ms = 3600000) {
        const entry = this.pool.find(e => e.key === key);
        if (entry) {
            entry.exhausted = true;
            // Also cooldown all models? 
            // For now just set a flag, though our getNextKey checks !exhausted
            setTimeout(() => { entry.exhausted = false; }, ms);
        }
    }

    async execute(modelId, task) {
        if (!this.pool.length) {
            throw new Error('No API keys loaded.');
        }

        const MAX_RETRIES = Math.max(this.pool.length * 2, 5);
        let attempt = 0;

        while (attempt < MAX_RETRIES) {
            const key = await this._getNextKey(modelId);

            try {
                return await task(key);
            } catch (e) {
                // Extract status code
                const statusCode = e.status || 500;
                const statusText = e.error?.status || e.message || 'UNKNOWN';

                // Get recommended action from config
                const action = getActionForError(statusText, statusCode);

                let waitMs = 60000;
                // Extract retryDelay if available (useful for Rate Limits)
                const retryDelay = e?.error?.details?.find(d => d['@type']?.includes('RetryInfo'))?.retryDelay;
                if (retryDelay) {
                    waitMs = parseFloat(retryDelay) * 1000;
                }

                console.warn(`⚠️ Error ${statusCode} (${statusText}) on ${modelId} with key ...${key.slice(-4)}. Action: ${action}`);

                if (action === ACTIONS.ROTATE_KEY) {
                    this.markRateLimited(key, modelId, waitMs);
                    // attempt++ happens below, forcing loop to retry with next key
                } else if (action === ACTIONS.RETRY) {
                    // Just retry (next key will be picked by _getNextKey)
                    await new Promise(r => setTimeout(r, 1000));
                } else if (action === ACTIONS.RETRY_LATER) {
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    // STOP or unknown
                    throw e;
                }

                attempt++;
                await new Promise(r => setTimeout(r, 100));
            }
        }
        throw new Error(`All API keys are currently rate-limited or exhausted for model ${modelId}.`);
    }
}

// Load keys
const rawKeys = Object.keys(env)
    .filter(k => k.startsWith('GEMINI') && k.endsWith('_KEY'))
    .sort((a, b) => {
        if (a === 'GEMINI_API_KEY') return -1;
        if (b === 'GEMINI_API_KEY') return 1;

        const na = parseInt(a.match(/\d+/)?.[0] || '999');
        const nb = parseInt(b.match(/\d+/)?.[0] || '999');
        return na - nb;
    })
    .map(k => env[k])
    .filter(Boolean);

const keyManager = new ApiKeyManager(rawKeys);

export default keyManager;
export { ApiKeyManager };
