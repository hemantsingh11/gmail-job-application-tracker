import secretClient from './keyVaultClient';

const TOKEN_PREFIX = 'gmail-token-';

function slugify(ownerEmail: string): string {
  if (!ownerEmail) {
    throw new Error('Owner email required for token store');
  }
  return ownerEmail.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

function secretName(ownerEmail: string): string {
  return `${TOKEN_PREFIX}${slugify(ownerEmail)}`;
}

export interface GmailTokensPayload {
  ownerEmail: string;
  tokens: Record<string, unknown>;
  savedAt: string;
}

export async function loadTokens(
  ownerEmail: string
): Promise<Record<string, unknown> | null> {
  try {
    const secret = await secretClient.getSecret(secretName(ownerEmail));
    const data = JSON.parse(secret.value || '{}');
    if (data.tokens) return data.tokens;
    return data;
  } catch (err: any) {
    if (err.code === 'SecretNotFound') {
      return null;
    }
    throw err;
  }
}

export async function saveTokens(
  ownerEmail: string,
  newTokens: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const existing = (await loadTokens(ownerEmail)) || {};
  const merged = { ...existing, ...newTokens };
  const payload: GmailTokensPayload = {
    ownerEmail,
    tokens: merged,
    savedAt: new Date().toISOString(),
  };
  await secretClient.setSecret(secretName(ownerEmail), JSON.stringify(payload));
  return merged;
}

export async function listOwners(): Promise<string[]> {
  const owners = new Set<string>();
  try {
    for await (const props of secretClient.listPropertiesOfSecrets()) {
      if (!props.name || !props.name.startsWith(TOKEN_PREFIX)) continue;
      try {
        const secret = await secretClient.getSecret(props.name);
        const data = JSON.parse(secret.value || '{}');
        if (data.ownerEmail) {
          owners.add(String(data.ownerEmail).toLowerCase());
        }
      } catch (err) {
        // ignore individual secret errors
      }
    }
  } catch (err: any) {
    console.error('Failed to list Key Vault Gmail owners', err.message || err);
  }
  return Array.from(owners);
}
