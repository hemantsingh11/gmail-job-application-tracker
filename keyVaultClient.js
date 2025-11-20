const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');

const KEY_VAULT_URI = process.env.KEY_VAULT_URI;

if (!KEY_VAULT_URI) {
  throw new Error('Missing KEY_VAULT_URI environment variable for Azure Key Vault.');
}

const credential = new DefaultAzureCredential();
const secretClient = new SecretClient(KEY_VAULT_URI, credential);

module.exports = secretClient;
