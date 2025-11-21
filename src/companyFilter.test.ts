import assert from 'node:assert';
import { filterEmailsByCompany } from './companyFilter';
import type { GmailEmailDoc } from './types';

const emails: GmailEmailDoc[] = [
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

const filtered = filterEmailsByCompany(emails, 'acme');
assert.strictEqual(filtered.length, 1);
assert.strictEqual(filtered[0].id, '1');

const filteredCase = filterEmailsByCompany(emails, 'BETA CORP');
assert.strictEqual(filteredCase.length, 1);
assert.strictEqual(filteredCase[0].id, '2');

const filteredMissing = filterEmailsByCompany(emails, 'Missing');
assert.strictEqual(filteredMissing.length, 0);

console.log('companyFilter tests passed');
