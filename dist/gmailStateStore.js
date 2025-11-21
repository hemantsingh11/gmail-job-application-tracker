"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadState = loadState;
exports.saveState = saveState;
const keyVaultClient_1 = __importDefault(require("./keyVaultClient"));
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
        const secret = await keyVaultClient_1.default.getSecret(secretName(ownerEmail));
        return JSON.parse(secret.value || '{}');
    }
    catch (err) {
        if (err.code === 'SecretNotFound') {
            return null;
        }
        throw err;
    }
}
async function saveState(ownerEmail, partial = {}) {
    const current = (await loadState(ownerEmail)) || {};
    const next = { ...current, ...partial };
    await keyVaultClient_1.default.setSecret(secretName(ownerEmail), JSON.stringify(next));
    return next;
}
