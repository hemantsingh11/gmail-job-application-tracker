import dotenv from 'dotenv';
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

// Ensure env is loaded before reading KEY_VAULT_URI (server also calls dotenv.config()).
dotenv.config();

const KEY_VAULT_URI = process.env.KEY_VAULT_URI;

if (!KEY_VAULT_URI) {
  throw new Error('Missing KEY_VAULT_URI environment variable for Azure Key Vault.');
}

const credential = new DefaultAzureCredential();
const secretClient = new SecretClient(KEY_VAULT_URI, credential);

export default secretClient;
