import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadEvents(client, eventsPath) {
    if (!fs.existsSync(eventsPath)) {
        console.warn(`Directory not found: ${eventsPath}`);
        return;
    }

    const getAllFiles = (dirPath, arrayOfFiles = []) => {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            if (fs.statSync(fullPath).isDirectory()) {
                getAllFiles(fullPath, arrayOfFiles);
            } else if (file.endsWith('.js')) {
                arrayOfFiles.push(fullPath);
            }
        }
        return arrayOfFiles;
    };

    const eventFiles = getAllFiles(eventsPath);

    for (const file of eventFiles) {
        try {
            const module = await import(pathToFileURL(file).href);
            // Support default export: export default (client) => { ... }
            const eventFunction = module.default;

            if (typeof eventFunction === 'function') {
                eventFunction(client);
                // console.log(`✅ Loaded event file: ${path.basename(file)}`);
            } else {
                console.warn(`⚠️ The event file at ${file} does not export a default function.`);
            }
        } catch (error) {
            console.error(`❌ Error loading event file ${file}:`, error);
        }
    }
}
