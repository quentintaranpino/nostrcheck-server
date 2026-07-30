// Ensure config is loaded before any module imports that depend on it
import { initGlobalConfig } from './src/lib/config/core.js';

// Initialize global config before tests run
await initGlobalConfig();
