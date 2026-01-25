import APIKey from '../models/APIKeys.js';
import APIStatus from '../models/APIStatus.js';
import { getActionForError, ACTIONS } from '../config/error.js';

class ApiKeyManager {
    constructor() {
        this.pool = [];
        this.index = 0;
        this.isInitialized = false;
        this.suspensionCache = new Map();
    }

    async loadKeys() {
        try {
            const keys = await APIKey.find({ isActive: true });
            if (!keys || keys.length === 0) {
                console.warn('⚠️ No active API Keys found in Database.');
                this.pool = [];
                return;
            }

            this.pool = keys.map(k => ({
                key: k.key,
                name: k.name,
                exhausted: false,
                lastUsed: 0
            }));

            this.isInitialized = true;
            console.log(`✅ Loaded ${this.pool.length} API Keys from DB.`);
        } catch (error) {
            console.error('❌ Failed to load API Keys:', error);
        }
    }

    async _getNextKey(modelId) {
        if (!this.isInitialized || this.pool.length === 0) {
            await this.loadKeys();
        }

        if (this.pool.length === 0) {
            throw new Error('No active API keys available.');
        }

        const validKeys = [];
        const now = Date.now();

        for (const entry of this.pool) {
            const cacheKey = `${entry.key}_${modelId}`;
            const suspendedUntil = this.suspensionCache.get(cacheKey);

            if (!suspendedUntil || suspendedUntil <= now) {
                validKeys.push(entry);
            }
        }

        if (validKeys.length === 0) {
            console.warn('All keys suspended, forcing DB reload...');
            await this.loadKeys();
            if (this.pool.length === 0) throw new Error(`All ${this.pool.length} API keys are currently rate-limited/suspended.`);
        }

        const entry = validKeys[this.index % validKeys.length];
        this.index++;
        entry.lastUsed = now;
        return entry.key;
    }

    async markRateLimited(key, modelId, ms = 60000) {
        const until = Date.now() + ms;
        const cacheKey = `${key}_${modelId}`;
        this.suspensionCache.set(cacheKey, until);

        try {
            await APIStatus.findOneAndUpdate(
                { key, model: modelId },
                { suspendedUntil: until, reason: 'RATE_LIMIT' },
                { upsert: true }
            );
            console.warn(`⏳ Suspended key ...${key.slice(-4)} for ${ms / 1000}s on ${modelId}`);
        } catch (e) {
            console.error('Failed to save APIStatus:', e);
        }
    }

    async markLeaked(key) {
        try {
            await APIKey.updateOne({ key }, { isActive: false, name: 'LEAKED - DISABLED' });
            console.error(`🚫 Key ...${key.slice(-4)} marked as LEAKED and disabled.`);
            await this.loadKeys();
        } catch (e) {
            console.error('Failed to mark key leaked:', e);
        }
    }

    async execute(modelId, task) {
        const MAX_RETRIES = this.pool.length > 0 ? this.pool.length + 2 : 3;
        let attempt = 0;
        let lastError = null;

        while (attempt < MAX_RETRIES) {
            let key;
            try {
                key = await this._getNextKey(modelId);
            } catch (e) {
                console.warn(`⚠️ ${e.message}`);
                throw e;
            }

            try {
                return await task(key);
            } catch (e) {
                lastError = e;

                if (e instanceof TypeError || e instanceof ReferenceError || e instanceof SyntaxError) {
                    console.error(`❌ CODE BUG (NON-RETRYABLE): ${e.message}`, e.stack);
                    throw e;
                }

                const statusCode = e.status || 500;
                const statusText = e.error?.status || e.message || 'UNKNOWN';
                const action = getActionForError(statusText, statusCode);

                let waitMs = 60000;
                const retryDelay = e?.error?.details?.find(d => d['@type']?.includes('RetryInfo'))?.retryDelay;
                if (retryDelay) {
                    waitMs = parseFloat(retryDelay) * 1000;
                }

                console.warn(`⚠️ Error ${statusCode} (${statusText}) on key ...${key.slice(-4)}. Action: ${action}`);

                if (action === ACTIONS.ROTATE_KEY) {
                    if (statusCode === 403 || statusText.includes('PERMISSION_DENIED')) {
                        await this.markLeaked(key);
                    } else {
                        await this.markRateLimited(key, modelId, waitMs);
                    }

                    await new Promise(r => setTimeout(r, 1000));

                } else if (action === ACTIONS.RETRY) {
                    const backoff = 2000 * (attempt + 1);
                    console.log(`Waiting ${backoff}ms before retry...`);
                    await new Promise(r => setTimeout(r, backoff));
                } else {
                    throw e;
                }

                attempt++;
            }
        }

        throw new Error(`Failed after ${attempt} attempts. Last error: ${lastError?.message}`);
    }
}

export default new ApiKeyManager();
