import APIKey from '../models/APIKeys.js';
import APIStatus from '../models/APIStatus.js';
import { getActionForError, ACTIONS } from '../config/error.js';

class ApiKeyManager {
    constructor() {
        this.pool = [];
        this.index = 0;
        this.isInitialized = false;
        // Local cache for suspension to reduce DB hits
        this.suspensionCache = new Map();
    }

    async loadKeys() {
        try {
            const keys = await APIKey.find({ isActive: true });
            if (!keys || keys.length === 0) {
                console.warn('⚠️ No active API Keys found in Database.');
                this.pool = []; // Clear pool if empty
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

    async _checkSuspension(key, modelId) {
        // 1. Check strict local cache first
        const cacheKey = `${key}_${modelId}`;
        const suspendedUntil = this.suspensionCache.get(cacheKey);
        if (suspendedUntil && suspendedUntil > Date.now()) {
            return true;
        }

        // 2. Check DB (Periodically or on cache miss? To avoid spamming DB, we rely on local cache mostly when running)
        // But for multiple instances compatibility, we should verify DB if local says clear.
        // For performance, let's assume if local cache is clear, we might try.
        // BUT if we want robust anti-spam, let's just query active suspensions once on load or lazily.
        // Let's implement lazy DB check if we failed locally? No, that's too late.
        // Simplified: Trust local cache for now. DB write ensures other bots see it (if we synced).
        // Since we are single instance for now, local map is fine + DB write for persistence.
        return false;
    }

    async _getNextKey(modelId) {
        if (!this.isInitialized || this.pool.length === 0) {
            await this.loadKeys();
        }

        if (this.pool.length === 0) {
            throw new Error('No active API keys available.');
        }

        // Filter out suspended keys
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
            // Check if we should re-sync from DB?
            // Maybe some keys are valid now?
            // Calculate minimum wait
            throw new Error(`All ${this.pool.length} API keys are currently rate-limited/suspended.`);
        }

        // Round Robin
        const entry = validKeys[this.index % validKeys.length];
        this.index++;
        entry.lastUsed = now;
        return entry.key;
    }

    async markRateLimited(key, modelId, ms = 60000) {
        const until = Date.now() + ms;

        // 1. Update Local Cache
        const cacheKey = `${key}_${modelId}`;
        this.suspensionCache.set(cacheKey, until);

        // 2. Persist to DB
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
            // Reload keys to update pool
            await this.loadKeys();
        } catch (e) {
            console.error('Failed to mark key leaked:', e);
        }
    }

    async execute(modelId, task) {
        const MAX_RETRIES = this.pool.length > 0 ? this.pool.length : 1; // Try each key once
        let attempt = 0;
        let lastError = null;

        while (attempt < MAX_RETRIES) {
            let key;
            try {
                key = await this._getNextKey(modelId);
            } catch (e) {
                // No keys available at all
                console.warn(`⚠️ ${e.message}`);
                throw e; // Stop trying
            }

            try {
                return await task(key);
            } catch (e) {
                lastError = e;
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
                    // Check specifically for 403 PERMISSION_DENIED (Leaked) vs 429
                    if (statusCode === 403 || statusText.includes('PERMISSION_DENIED')) {
                        await this.markLeaked(key);
                    } else {
                        await this.markRateLimited(key, modelId, waitMs);
                    }
                } else if (action === ACTIONS.RETRY) {
                    // 503/500 errors, maybe short wait?
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    // STOP or unknown fatal error
                    throw e;
                }

                attempt++;
            }
        }

        throw new Error(`Failed after ${attempt} attempts. Last error: ${lastError?.message}`);
    }
}

export default new ApiKeyManager();
