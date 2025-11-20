const secretClient = require('./keyVaultClient');

const TOKEN_PREFIX = 'gmail-token-';

function slugify(ownerEmail) {
  if (!ownerEmail) {
    throw new Error('Owner email required for token store');
  }
  return ownerEmail.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

function secretName(ownerEmail) {
  return `${TOKEN_PREFIX}${slugify(ownerEmail)}`;
}

async function loadTokens(ownerEmail) {
  try {
    const secret = await secretClient.getSecret(secretName(ownerEmail));
    const data = JSON.parse(secret.value || '{}');
    if (data.tokens) return data.tokens;
    return data;
  } catch (err) {
    if (err.code === 'SecretNotFound') {
      return null;
    }
    throw err;
  }
}

async function saveTokens(ownerEmail, newTokens = {}) {
  const existing = (await loadTokens(ownerEmail)) || {};
  const merged = { ...existing, ...newTokens };
  const payload = {
    ownerEmail,
    tokens: merged,
    savedAt: new Date().toISOString(),
  };
  await secretClient.setSecret(secretName(ownerEmail), JSON.stringify(payload));
  return merged;
}

async function listOwners() {
  const owners = new Set();
  try {
    for await (const props of secretClient.listPropertiesOfSecrets()) {
      if (!props.name || !props.name.startsWith(TOKEN_PREFIX)) continue;
      try {
        const secret = await secretClient.getSecret(props.name);
        const data = JSON.parse(secret.value || '{}');
        if (data.ownerEmail) {
          owners.add(data.ownerEmail.toLowerCase());
        }
      } catch (err) {
        // ignore individual secret errors
      }
    }
  } catch (err) {
    console.error('Failed to list Key Vault Gmail owners', err.message || err);
  }
  return Array.from(owners);
}

module.exports = {
  loadTokens,
  saveTokens,
  listOwners,
};
