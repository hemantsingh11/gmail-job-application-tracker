const secretClient = require('./keyVaultClient');

const STATE_PREFIX = 'gmail-state-';

function slugify(ownerEmail) {
  if (!ownerEmail) {
    throw new Error('Owner email required for gmail state');
  }
  return ownerEmail.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

function secretName(ownerEmail) {
  return `${STATE_PREFIX}${slugify(ownerEmail)}`;
}

async function loadState(ownerEmail) {
  try {
    const secret = await secretClient.getSecret(secretName(ownerEmail));
    return JSON.parse(secret.value || '{}');
  } catch (err) {
    if (err.code === 'SecretNotFound') {
      return null;
    }
    throw err;
  }
}

async function saveState(ownerEmail, partial = {}) {
  const current = (await loadState(ownerEmail)) || {};
  const next = { ...current, ...partial };
  await secretClient.setSecret(secretName(ownerEmail), JSON.stringify(next));
  return next;
}

module.exports = {
  loadState,
  saveState,
};
