import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.data');
const TOKENS_FILE = path.join(DATA_DIR, 'gmail-tokens.json');

async function ensureFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(TOKENS_FILE);
  } catch {
    await fs.writeFile(TOKENS_FILE, '{}', 'utf-8');
  }
}

async function readStore(): Promise<Record<string, any>> {
  await ensureFile();
  const raw = await fs.readFile(TOKENS_FILE, 'utf-8');
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

async function writeStore(data: Record<string, any>): Promise<void> {
  await ensureFile();
  await fs.writeFile(TOKENS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function loadTokens(ownerEmail: string): Promise<Record<string, unknown> | null> {
  const store = await readStore();
  return store[ownerEmail] || null;
}

export async function saveTokens(
  ownerEmail: string,
  newTokens: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const store = await readStore();
  const merged = { ...(store[ownerEmail] || {}), ...newTokens };
  store[ownerEmail] = merged;
  await writeStore(store);
  return merged;
}

export async function listOwners(): Promise<string[]> {
  const store = await readStore();
  return Object.keys(store);
}
