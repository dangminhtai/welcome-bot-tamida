import APIKey from '../models/APIKeys.js';
import { getActionForError, ACTIONS } from '../config/error.js';

class ApiKeyManager {
    constructor() {
        this.pool = [];
        this.index = 0;
        this.isInitialized = false;
    }

    async loadKeys() {
        try {
            const keys = await APIKey.find({ isActive: true });
            if (!keys || keys.length === 0) {
                console.warn('⚠️ No active API Keys found in Database.');
                return;
            }

            this.pool = keys.map(k => ({
                key: k.key,
                name: k.name,
                modelCooldowns: {},
                exhausted: false,
                lastUsed: 0
            }));

            this.isInitialized = true;
            console.log(`✅ Loaded ${this.pool.length} API Keys from DB.`);
        } catch (error) {
            console.error('❌ Failed to load API Keys:', error);
        }
    }

    async _getNextKey(modelId, timeoutMs = 10000) {
        if (!this.isInitialized || this.pool.length === 0) {
            await this.loadKeys();
        }

        if (this.pool.length === 0) {
            throw new Error('No active API keys available.');
        }

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
            console.warn(`⏳ Key ${entry.name || '...'} rate limited on ${modelId} for ${ms}ms`);
        }
    }

    async execute(modelId, task) {
        if (!this.isInitialized && this.pool.length === 0) {
            await this.loadKeys();
        }

        const MAX_RETRIES = Math.max(this.pool.length * 2, 5);
        let attempt = 0;

        while (attempt < MAX_RETRIES) {
            let key;
            try {
                key = await this._getNextKey(modelId);
            } catch (e) {
                throw e; // No keys available
            }

            try {
                return await task(key);
            } catch (e) {
                const statusCode = e.status || 500;
                const statusText = e.error?.status || e.message || 'UNKNOWN';
                const action = getActionForError(statusText, statusCode);

                // Check for duplicate key errors or specific mongo errors if any (unlikely here)

                let waitMs = 60000;
                const retryDelay = e?.error?.details?.find(d => d['@type']?.includes('RetryInfo'))?.retryDelay;
                if (retryDelay) {
                    waitMs = parseFloat(retryDelay) * 1000;
                }

                console.warn(`⚠️ Error ${statusCode} (${statusText}) on ${modelId}. Action: ${action}`);

                if (action === ACTIONS.ROTATE_KEY) {
                    this.markRateLimited(key, modelId, waitMs);
                } else if (action === ACTIONS.RETRY) {
                    await new Promise(r => setTimeout(r, 1000));
                } else if (action === ACTIONS.RETRY_LATER) {
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    throw e;
                }

                attempt++;
                await new Promise(r => setTimeout(r, 100));
            }
        }
        throw new Error(`All API keys are currently rate-limited or exhausted for model ${modelId}.`);
    }
}

export default new ApiKeyManager();
