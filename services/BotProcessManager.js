import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PortManager {
    constructor(start = 8081, end = 8999) {
        this.available = [];
        for (let i = start; i <= end; i++) this.available.push(i);
        this.used = new Set();
    }

    getPort() {
        if (!this.available.length) throw new Error('No available ports');
        const port = this.available.shift();
        this.used.add(port);
        return port;
    }

    releasePort(port) {
        if (this.used.has(port)) {
            this.used.delete(port);
            this.available.push(port);
        }
    }
}

class BotProcessManager {
    constructor() {
        if (!BotProcessManager.instance) {
            this.activeProcesses = new Map();
            this.processPorts = new Map(); // Track ports for processes
            this.portManager = new PortManager();
            BotProcessManager.instance = this;
        }
        return BotProcessManager.instance;
    }

    async startBot(botName) {
        // Prevent duplicate starts
        if (this.activeProcesses.has(botName)) {
            return { success: false, message: `⚠️ Bot **${botName}** is already running.` };
        }

        // Determine bot path
        // Assuming bots are in: code_root/bot/[botName]/index.js
        // We are in: code_root/services/BotProcessManager.js
        // So root is ../
        const botRoot = path.join(__dirname, '..', 'bot', botName);
        const entryPoint = path.join(botRoot, 'index.js');

        if (!fs.existsSync(entryPoint)) {
            return { success: false, message: `❌ Entry point not found: \`${entryPoint}\`` };
        }

        try {
            // Fetch bot config from DB
            // Dynamic import to avoid earlier circular deps if any
            const { default: MonitoredBot } = await import('../models/MonitoredBot.js');
            const botConfig = await MonitoredBot.findOne({ name: botName });

            if (!botConfig) {
                return { success: false, message: `⚠️ Bot **${botName}** configuration not found in Database.` };
            }

            // Check if required credentials exist
            if (!botConfig.token || !botConfig.clientId || !botConfig.mongoUri) {
                return { success: false, message: `⚠️ Missing credentials (Token/ClientID/MongoURI) for **${botName}** in Database.` };
            }

            const port = this.portManager.getPort();
            console.log(`🚀 Starting child bot: ${botName} on port ${port}...`);

            // Prepare Environment Variables
            // We explicitly overwrite DISCORD_TOKEN, CLIENT_ID, MONGO_URI
            const childEnv = {
                ...process.env,
                PORT: port,
                DISCORD_TOKEN: botConfig.token,
                CLIENT_ID: botConfig.clientId,
                MONGO_URI: botConfig.mongoUri,
                // Optional: Force NODE_ENV or others if needed
            };

            // Fork the process
            const child = fork(entryPoint, [], {
                cwd: botRoot,
                stdio: 'inherit',
                env: childEnv
            });

            this.activeProcesses.set(botName, child);
            this.processPorts.set(botName, port);

            child.on('exit', (code, signal) => {
                if (code !== null) {
                    console.log(`⚠️ Child bot ${botName} exited with code ${code}`);
                } else if (signal) {
                    console.log(`🛑 Child bot ${botName} was killed by signal ${signal}`);
                } else {
                    console.log(`⚠️ Child bot ${botName} exited.`);
                }
                this.cleanup(botName);
            });

            child.on('error', (err) => {
                console.error(`❌ Child bot ${botName} error:`, err);
                this.cleanup(botName);
            });

            return { success: true, message: `✅ Bot **${botName}** has been started on port ${port}.` };

        } catch (error) {
            console.error(`Failed to start bot ${botName}:`, error);
            // Ensure port is released if start fails
            if (this.processPorts.has(botName)) {
                this.cleanup(botName);
            }
            return { success: false, message: `❌ Failed to start bot: ${error.message}` };
        }
    }

    cleanup(botName) {
        if (this.activeProcesses.has(botName)) {
            this.activeProcesses.delete(botName);
        }
        if (this.processPorts.has(botName)) {
            const port = this.processPorts.get(botName);
            this.portManager.releasePort(port);
            this.processPorts.delete(botName);
            console.log(`♻️ Released port ${port} for ${botName}`);
        }
    }

    stopBot(botName) {
        const child = this.activeProcesses.get(botName);
        if (!child) {
            return { success: false, message: `⚠️ Bot **${botName}** is not running.` };
        }

        child.kill();
        this.cleanup(botName);
        return { success: true, message: `🛑 Bot **${botName}** has been stopped.` };
    }

    getStatus(botName) {
        return this.activeProcesses.has(botName) ? 'Running' : 'Stopped';
    }
}

const instance = new BotProcessManager();
export default instance;
