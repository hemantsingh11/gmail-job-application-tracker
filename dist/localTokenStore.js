"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadTokens = loadTokens;
exports.saveTokens = saveTokens;
exports.listOwners = listOwners;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(process.cwd(), '.data');
const TOKENS_FILE = path_1.default.join(DATA_DIR, 'gmail-tokens.json');
async function ensureFile() {
    await promises_1.default.mkdir(DATA_DIR, { recursive: true });
    try {
        await promises_1.default.access(TOKENS_FILE);
    }
    catch {
        await promises_1.default.writeFile(TOKENS_FILE, '{}', 'utf-8');
    }
}
async function readStore() {
    await ensureFile();
    const raw = await promises_1.default.readFile(TOKENS_FILE, 'utf-8');
    try {
        return JSON.parse(raw || '{}');
    }
    catch {
        return {};
    }
}
async function writeStore(data) {
    await ensureFile();
    await promises_1.default.writeFile(TOKENS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
async function loadTokens(ownerEmail) {
    const store = await readStore();
    return store[ownerEmail] || null;
}
async function saveTokens(ownerEmail, newTokens = {}) {
    const store = await readStore();
    const merged = { ...(store[ownerEmail] || {}), ...newTokens };
    store[ownerEmail] = merged;
    await writeStore(store);
    return merged;
}
async function listOwners() {
    const store = await readStore();
    return Object.keys(store);
}
