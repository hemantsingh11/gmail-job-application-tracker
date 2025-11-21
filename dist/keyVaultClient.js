"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const keyvault_secrets_1 = require("@azure/keyvault-secrets");
const identity_1 = require("@azure/identity");
// Ensure env is loaded before reading KEY_VAULT_URI (server also calls dotenv.config()).
dotenv_1.default.config();
const KEY_VAULT_URI = process.env.KEY_VAULT_URI;
if (!KEY_VAULT_URI) {
    throw new Error('Missing KEY_VAULT_URI environment variable for Azure Key Vault.');
}
const credential = new identity_1.DefaultAzureCredential();
const secretClient = new keyvault_secrets_1.SecretClient(KEY_VAULT_URI, credential);
exports.default = secretClient;
