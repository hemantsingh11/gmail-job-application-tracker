"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const companyFilter_1 = require("./companyFilter");
const emails = [
    {
        id: '1',
        owner: 'user@example.com',
        from: 'a@example.com',
        to: 'user@example.com',
        subject: 'Offer',
        date: 'Mon',
        snippet: 'snippet',
        body: 'body',
        labelIds: [],
        fetchedAt: '2024-01-01T00:00:00Z',
        internalDate: 1,
        classification: { is_job_related: true, status: 'applied', summary: '', company_name: 'Acme' },
    },
    {
        id: '1b',
        owner: 'user@example.com',
        from: 'a@example.com',
        to: 'user@example.com',
        subject: 'Newsletter',
        date: 'Mon',
        snippet: 'snippet',
        body: 'body',
        labelIds: [],
        fetchedAt: '2024-01-01T00:00:00Z',
        internalDate: 1,
        classification: {
            is_job_related: false,
            status: 'not_job_related',
            summary: '',
            company_name: 'Acme',
        },
    },
    {
        id: '2',
        owner: 'user@example.com',
        from: 'b@example.com',
        to: 'user@example.com',
        subject: 'Hello',
        date: 'Tue',
        snippet: 'snippet',
        body: 'body',
        labelIds: [],
        fetchedAt: '2024-01-02T00:00:00Z',
        internalDate: 2,
        classification: { is_job_related: true, status: 'applied', summary: '', company_name: 'Beta Corp' },
    },
    {
        id: '3',
        owner: 'user@example.com',
        from: 'c@example.com',
        to: 'user@example.com',
        subject: 'Missing company',
        date: 'Wed',
        snippet: 'snippet',
        body: 'body',
        labelIds: [],
        fetchedAt: '2024-01-03T00:00:00Z',
        internalDate: 3,
        classification: { is_job_related: true, status: 'applied', summary: '', company_name: '' },
    },
    {
        id: '4',
        owner: 'user@example.com',
        from: 'd@example.com',
        to: 'user@example.com',
        subject: 'No classification',
        date: 'Thu',
        snippet: 'snippet',
        body: 'body',
        labelIds: [],
        fetchedAt: '2024-01-04T00:00:00Z',
        internalDate: 4,
    },
];
const filtered = (0, companyFilter_1.filterEmailsByCompany)(emails, 'acme');
node_assert_1.default.strictEqual(filtered.length, 1);
node_assert_1.default.strictEqual(filtered[0].id, '1');
const filteredCase = (0, companyFilter_1.filterEmailsByCompany)(emails, 'BETA CORP');
node_assert_1.default.strictEqual(filteredCase.length, 1);
node_assert_1.default.strictEqual(filteredCase[0].id, '2');
const filteredMissing = (0, companyFilter_1.filterEmailsByCompany)(emails, 'Missing');
node_assert_1.default.strictEqual(filteredMissing.length, 0);
console.log('companyFilter tests passed');
