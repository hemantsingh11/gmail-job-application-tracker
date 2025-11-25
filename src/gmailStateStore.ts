import secretClient from './keyVaultClient';

const STATE_PREFIX = 'gmail-state-';

function slugify(ownerEmail: string): string {
  if (!ownerEmail) {
    throw new Error('Owner email required for gmail state');
  }
  return ownerEmail.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

function secretName(ownerEmail: string): string {
  return `${STATE_PREFIX}${slugify(ownerEmail)}`;
}

export interface GmailState {
  lastInternalDateMs?: number;
}

export async function loadState(ownerEmail: string): Promise<GmailState | null> {
  try {
    const secret = await secretClient.getSecret(secretName(ownerEmail));
    return JSON.parse(secret.value || '{}');
  } catch (err: any) {
    if (err.code === 'SecretNotFound') {
      return null;
    }
    throw err;
  }
}

export async function saveState(
  ownerEmail: string,
  partial: GmailState = {}
): Promise<GmailState> {
  const current = (await loadState(ownerEmail)) || {};
  const next = { ...current, ...partial };
  await secretClient.setSecret(secretName(ownerEmail), JSON.stringify(next));
  return next;
}
