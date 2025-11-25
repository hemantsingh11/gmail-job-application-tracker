import path from 'path';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { CosmosClient, type Container } from '@azure/cosmos';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import cron from 'node-cron';
import { htmlToText } from 'html-to-text';
import dotenv from 'dotenv';
import type {
  AuthedRequest,
  ClassificationResult,
  GmailEmailDoc,
  JobDoc,
  SessionPayload,
} from './types';
import * as tokenStore from './gmailTokenStore';
import * as gmailStateStore from './gmailStateStore';
import { filterEmailsByCompany } from './companyFilter';

async function logGmailDiagnostics(
  gmailContainer: Container,
  ownerEmail: string,
  companyName: string
): Promise<void> {
  const diagnostics: Array<{ label: string; query: string; parameters?: any[] }> = [
    {
      label: 'Non-string owner',
      query: 'SELECT TOP 3 c.id, c.owner FROM c WHERE NOT IS_STRING(c.owner)',
    },
    {
      label: 'Non-string company classification',
      query:
        'SELECT TOP 3 c.id, c.classification FROM c WHERE c.owner = @owner AND (NOT IS_DEFINED(c.classification) OR NOT IS_OBJECT(c.classification) OR NOT IS_DEFINED(c.classification.company_name) OR NOT IS_STRING(c.classification.company_name))',
      parameters: [{ name: '@owner', value: ownerEmail }],
    },
    {
      label: 'Missing internalDate',
      query:
        'SELECT TOP 3 c.id, c.internalDate FROM c WHERE c.owner = @owner AND (NOT IS_DEFINED(c.internalDate) OR NOT IS_NUMBER(c.internalDate))',
      parameters: [{ name: '@owner', value: ownerEmail }],
    },
    {
      label: 'Sample classified company',
      query:
        'SELECT TOP 3 c.id, c.classification FROM c WHERE c.owner = @owner AND IS_DEFINED(c.classification.company_name) AND c.classification.company_name = @company',
      parameters: [
        { name: '@owner', value: ownerEmail },
        { name: '@company', value: companyName },
      ],
    },
  ];

  for (const diag of diagnostics) {
    try {
      const { resources } = await gmailContainer.items
        .query(diag, { maxItemCount: 3 })
        .fetchAll();
      console.log(`[Diag:${diag.label}]`, resources);
    } catch (err: any) {
      console.error(`[Diag failed:${diag.label}]`, err.message || err);
    }
  }
}

dotenv.config();

const COSMOS_URI = process.env.COSMOS_URI;
const COSMOS_KEY = process.env.COSMOS_KEY;
const COSMOS_DATABASE = process.env.COSMOS_DATABASE;
const COSMOS_CONTAINER = process.env.COSMOS_CONTAINER;
const COSMOS_GMAIL_DATABASE = process.env.COSMOS_GMAIL_DATABASE || 'gmaildb';
const COSMOS_GMAIL_CONTAINER = process.env.COSMOS_GMAIL_CONTAINER || 'emails';
const COSMOS_JOBS_DATABASE = process.env.COSMOS_JOBS_DATABASE || 'jobsdb';
const COSMOS_JOBS_CONTAINER = process.env.COSMOS_JOBS_CONTAINER || 'applications';
const COSMOS_USER_DATABASE = process.env.COSMOS_USER_DATABASE || 'userdb';
const COSMOS_USER_CONTAINER = process.env.COSMOS_USER_CONTAINER || 'users';
const PORT = Number(process.env.PORT || '3000');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';
const GMAIL_CRON = process.env.GMAIL_CRON_SCHEDULE || '45 0 * * *';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMAIL_CLASS_MODEL = process.env.EMAIL_CLASS_MODEL || 'gpt-4o-mini';
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_DURATION_DAYS = Number(process.env.SESSION_DURATION_DAYS || '10');
const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
const SESSION_COOKIE_NAME = 'jobapp_session';
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_DURATION_MS,
};
const EASTERN_TIMEZONE = 'America/New_York';
const STATIC_DIR = path.join(__dirname, '..', 'client', 'dist');

declare global {
  namespace Express {
    interface Request {
      userSession?: SessionPayload | null;
    }
  }
}

requireEnv('SESSION_SECRET', SESSION_SECRET);
if (OPENAI_API_KEY) {
  console.log(`Email classification enabled (model: ${EMAIL_CLASS_MODEL}).`);
} else {
  console.warn('OPENAI_API_KEY not set. Job email classification is disabled.');
}

function requireEnv(name: string, value: string | undefined | null): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function initCosmos(): Promise<{ client: CosmosClient; container: Container }> {
  requireEnv('COSMOS_URI', COSMOS_URI);
  requireEnv('COSMOS_KEY', COSMOS_KEY);
  requireEnv('COSMOS_DATABASE', COSMOS_DATABASE);
  requireEnv('COSMOS_CONTAINER', COSMOS_CONTAINER);

  const client = new CosmosClient({ endpoint: COSMOS_URI!, key: COSMOS_KEY! });

  const { database } = await client.databases.createIfNotExists({
    id: COSMOS_DATABASE!,
  });

  const { container } = await database.containers.createIfNotExists({
    id: COSMOS_CONTAINER!,
    partitionKey: '/email',
  });

  return { client, container };
}

async function initGmailCosmos(): Promise<{ client: CosmosClient; container: Container }> {
  requireEnv('COSMOS_URI', COSMOS_URI);
  requireEnv('COSMOS_KEY', COSMOS_KEY);

  const client = new CosmosClient({ endpoint: COSMOS_URI!, key: COSMOS_KEY! });
  const { database } = await client.databases.createIfNotExists({
    id: COSMOS_GMAIL_DATABASE,
  });

  const { container } = await database.containers.createIfNotExists({
    id: COSMOS_GMAIL_CONTAINER,
    partitionKey: '/owner',
  });

  return { client, container };
}

async function initJobsCosmos(): Promise<{ client: CosmosClient; container: Container }> {
  requireEnv('COSMOS_URI', COSMOS_URI);
  requireEnv('COSMOS_KEY', COSMOS_KEY);

  const client = new CosmosClient({ endpoint: COSMOS_URI!, key: COSMOS_KEY! });
  const { database } = await client.databases.createIfNotExists({
    id: COSMOS_JOBS_DATABASE,
  });

  const { container } = await database.containers.createIfNotExists({
    id: COSMOS_JOBS_CONTAINER,
    partitionKey: '/owner',
  });

  return { client, container };
}

async function initUserCosmos(): Promise<{ client: CosmosClient; container: Container }> {
  requireEnv('COSMOS_URI', COSMOS_URI);
  requireEnv('COSMOS_KEY', COSMOS_KEY);

  const client = new CosmosClient({ endpoint: COSMOS_URI!, key: COSMOS_KEY! });
  const { database } = await client.databases.createIfNotExists({
    id: COSMOS_USER_DATABASE,
  });

  const { container } = await database.containers.createIfNotExists({
    id: COSMOS_USER_CONTAINER,
    partitionKey: '/userid',
  });

  return { client, container };
}

function createOAuthClient(): OAuth2Client {
  requireEnv('GOOGLE_CLIENT_ID', GOOGLE_CLIENT_ID);
  requireEnv('GOOGLE_CLIENT_SECRET', GOOGLE_CLIENT_SECRET);
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

function extractHeader(
  headers: Array<{ name?: string | null; value?: string | null }> = [],
  name: string
): string {
  const header = headers.find((h) => h.name === name);
  return header ? header.value || '' : '';
}

function escapeHtml(str = ''): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers && req.headers.cookie;
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.split('=');
    if (!rawKey) return acc;
    const key = rawKey.trim();
    const value = rest.join('=').trim();
    try {
      acc[key] = decodeURIComponent(value || '');
    } catch {
      acc[key] = value || '';
    }
    return acc;
  }, {});
}

function encodeSessionPayload(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeSessionPayload(data: string): SessionPayload {
  return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
}

function signSessionData(data: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET!).update(data).digest('base64url');
}

function createSessionToken(user: Partial<SessionPayload>): string {
  const payload: SessionPayload = {
    name: user.name || '',
    email: user.email || '',
    picture: user.picture || '',
    createdAt: new Date().toISOString(),
    exp: Date.now() + SESSION_DURATION_MS,
  };
  const data = encodeSessionPayload(payload);
  const signature = signSessionData(data);
  return `${data}.${signature}`;
}

function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;
  const expected = signSessionData(data);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  let payload: SessionPayload;
  try {
    payload = decodeSessionPayload(data);
  } catch {
    return null;
  }
  if (payload.exp && payload.exp < Date.now()) {
    return null;
  }
  return payload;
}

function setSessionCookie(res: Response, user: Partial<SessionPayload>): string {
  const token = createSessionToken(user);
  res.cookie(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
  return token;
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SESSION_COOKIE_OPTIONS.secure,
  });
}

function getSessionFromRequest(req: Request): SessionPayload | null {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  return verifySessionToken(token);
}

function pad2(value: string | number): string {
  return String(value).padStart(2, '0');
}

function getPreviousEasternDayRangeSeconds(): { after: number; before: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZoneName: 'shortOffset',
  });
  const map: Record<string, string> = {};
  formatter.formatToParts(now).forEach((part) => {
    if (part.type) {
      map[part.type] = part.value;
    }
  });
  let offset = map.timeZoneName || 'GMT-05:00';
  offset = offset.replace('GMT', '');
  let sign = '+';
  if (offset.startsWith('-')) {
    sign = '-';
    offset = offset.slice(1);
  } else if (offset.startsWith('+')) {
    offset = offset.slice(1);
  }
  let [hours, minutes] = offset.split(':');
  hours = pad2(hours || '0');
  minutes = pad2(minutes || '0');
  const offsetString = `${sign}${hours}:${minutes}`;
  const startTodayEastern = new Date(`${map.year}-${map.month}-${map.day}T00:00:00${offsetString}`);
  const startYesterdayEastern = new Date(startTodayEastern.getTime() - 24 * 60 * 60 * 1000);
  const startTodaySeconds = Math.floor(startTodayEastern.getTime() / 1000);
  const startYesterdaySeconds = Math.floor(startYesterdayEastern.getTime() / 1000);
  return { after: startYesterdaySeconds, before: startTodaySeconds };
}

function decodeBodyData(data = ''): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

function extractMessageBody(part: any = {}): string {
  if (part.parts && part.parts.length) {
    for (const subpart of part.parts) {
      const text = extractMessageBody(subpart);
      if (text) return text;
    }
  }

  const body = part.body || {};
  if (body.data) {
    const text = decodeBodyData(body.data);
    if ((part.mimeType || '').includes('html')) {
      return htmlToText(text, { wordwrap: 100 });
    }
    return text;
  }

  return '';
}

async function classifyEmail(emailDoc: GmailEmailDoc): Promise<ClassificationResult | null> {
  if (!OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not set. Skipping classification.');
    return null;
  }

  const systemPrompt = `You classify one email at a time.
Output only JSON with this schema:
{
  "is_job_related": true | false,
  "status": "applied" | "rejected" | "next_steps" | "comment_only" | "not_job_related",
  "summary": "short sentence",
  "company_name": "Company extracted from the message"
}

Rules:
- Ignore newsletters, job alerts, marketing blasts, and platform recommendations.
- applied: acknowledges receipt or confirms application submission.
- rejected: explicit rejection.
- next_steps: interviews, assessments, or availability requests.
- comment_only: job-related but not applied/rejected/next_steps.
- not_job_related: everything else.
Always include a concise summary and company_name guess.`;

  const content = `Subject: ${emailDoc.subject || '(no subject)'}\nFrom: ${
    emailDoc.from || 'unknown'
  }\n\nBody:\n${emailDoc.body || emailDoc.snippet || ''}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMAIL_CLASS_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const errMessage = data?.error?.message || 'OpenAI classification failed';
      throw new Error(errMessage);
    }

    const message = data.choices?.[0]?.message?.content;
    if (!message) {
      throw new Error('Empty classification response');
    }
    return JSON.parse(message) as ClassificationResult;
  } catch (err: any) {
    console.error('Email classification failed', err.message || err);
    return null;
  }
}

async function upsertJobStatus(
  jobsContainer: Container | null,
  ownerRaw: string,
  classification: ClassificationResult | null
): Promise<JobDoc | null> {
  if (!jobsContainer) {
    console.warn('Jobs container missing. Skipping status upsert.');
    return null;
  }
  if (!classification) return null;

  const companyName = (classification.company_name || '').trim();
  const ownerEmail = (ownerRaw || '').trim().toLowerCase();
  if (!companyName) {
    console.warn('Classification missing company_name. Skipping.');
    return null;
  }
  if (!ownerEmail) {
    console.warn('Missing owner for job status update. Skipping.');
    return null;
  }

  const status = classification.status;
  if (
    !classification.is_job_related ||
    status === 'not_job_related' ||
    !['applied', 'rejected', 'next_steps', 'comment_only'].includes(status)
  ) {
    return null;
  }

  const pk = ownerEmail;
  const companySlug = companyName.toLowerCase().replace(/\s+/g, '_');
  const docId = `${ownerEmail}::${companySlug}`;
  const today = new Date().toISOString().slice(0, 10);
  let doc: JobDoc | null;
  try {
    const { resource } = await jobsContainer.item(docId, pk).read<JobDoc>();
    doc = resource || null;
  } catch (err: any) {
    if (err.code === 404) {
      doc = {
        id: docId,
        owner: ownerEmail,
        company_name: companyName,
        applied: 0,
        rejected: 0,
        next_steps: 0,
        comments: [],
        last_updated: today,
      };
    } else {
      throw err;
    }
  }
  if (!doc) {
    doc = {
      id: docId,
      owner: ownerEmail,
      company_name: companyName,
      applied: 0,
      rejected: 0,
      next_steps: 0,
      comments: [],
      last_updated: today,
    };
  }

  if (!Array.isArray(doc.comments)) {
    doc.comments = [];
  } else if (doc.comments.length && typeof doc.comments[0] === 'string') {
    doc.comments = doc.comments.map((note: any) => ({ date: today, note: String(note) }));
  }

  if (status === 'applied') {
    doc.applied = (doc.applied || 0) + 1;
  } else if (status === 'rejected') {
    doc.rejected = (doc.rejected || 0) + 1;
  } else if (status === 'next_steps') {
    doc.next_steps = (doc.next_steps || 0) + 1;
  } else if (status === 'comment_only') {
    const note = (classification.summary || '').slice(0, 280);
    doc.comments.push({ date: today, note });
  }

  doc.last_updated = today;
  await jobsContainer.items.upsert(doc);
  return doc;
}

async function classifyEmailAndUpsert(
  emailDoc: GmailEmailDoc,
  jobsContainer: Container | null
): Promise<ClassificationResult | null> {
  if (!jobsContainer) return null;
  const ownerEmail = (emailDoc.owner || '').trim().toLowerCase();
  if (!ownerEmail) {
    console.warn('Email document missing owner, skipping classification upsert.');
    return null;
  }
  const classification = await classifyEmail(emailDoc);
  if (!classification) return null;
  console.log(
    `Classified email "${emailDoc.subject || '(no subject)'}" → ${
      classification.status
    } (${classification.company_name || 'unknown company'})`
  );
  try {
    await upsertJobStatus(jobsContainer, ownerEmail, classification);
  } catch (err: any) {
    console.error('Failed to upsert job status', err.message || err);
  }
  return classification;
}

async function verifyGoogleIdCredential(idToken?: string): Promise<any> {
  if (!idToken) {
    throw new Error('Missing Google credential');
  }
  const client = createOAuthClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
}

async function fetchAndStoreGmailEmails(
  emailContainer: Container | null,
  oauthClient: OAuth2Client | null,
  jobsContainer: Container | null,
  ownerRaw: string,
  options: { queryOverride?: string; skipStateUpdate?: boolean } = {}
): Promise<{ fetched: number; owner?: string }> {
  const ownerEmail = (ownerRaw || '').trim().toLowerCase();
  if (!ownerEmail) {
    throw new Error('Owner email required for Gmail fetch');
  }
  if (!emailContainer) {
    console.warn('Gmail container not ready, skipping fetch.');
    return { fetched: 0 };
  }

  const { queryOverride = '', skipStateUpdate = false } = options;
  const useState = !queryOverride;

  let client = oauthClient;
  if (!client) {
    const savedTokens = await tokenStore.loadTokens(ownerEmail);
    if (!savedTokens) {
      const err: any = new Error('Gmail access not configured');
      err.code = 'NO_GMAIL_TOKENS';
      throw err;
    }
    client = createOAuthClient();
    client.setCredentials(savedTokens);
  }

  client.on('tokens', (tokens) => {
    tokenStore.saveTokens(ownerEmail, tokens as Record<string, unknown>).catch((err) => {
      console.error('Failed to persist updated Gmail tokens', err);
    });
  });

  const gmail = google.gmail({ version: 'v1', auth: client });

  let state: gmailStateStore.GmailState = {};
  let lastInternalDateMs: number | null = null;
  if (useState) {
    state = (await gmailStateStore.loadState(ownerEmail)) || {};
    lastInternalDateMs = state.lastInternalDateMs ? Number(state.lastInternalDateMs) : null;
  }

  const queryParts: string[] = [];
  if (queryOverride) {
    queryParts.push(queryOverride);
  } else if (lastInternalDateMs) {
    const afterSeconds = Math.floor(lastInternalDateMs / 1000);
    queryParts.push(`after:${afterSeconds}`);
  } else {
    queryParts.push('newer_than:7d');
  }
  const gmailQuery = queryParts.join(' ').trim();

  const profileResp = await gmail.users.getProfile({ userId: 'me' });
  const gmailAccountEmail = (profileResp.data.emailAddress || ownerEmail).toLowerCase();
  if (gmailAccountEmail !== ownerEmail) {
    console.warn(
      `Gmail account (${gmailAccountEmail}) differs from session owner (${ownerEmail}). Using session owner for storage.`
    );
  }

  const docs: GmailEmailDoc[] = [];
  let pageToken: string | undefined;
  let maxInternalDate = lastInternalDateMs || 0;
  do {
    const messageList = await gmail.users.messages.list({
      userId: 'me',
      q: gmailQuery || undefined,
      maxResults: 100,
      pageToken,
    });
    const messages = messageList.data.messages || [];
    pageToken = messageList.data.nextPageToken || undefined;
    if (!messages.length) {
      continue;
    }

    for (const message of messages) {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id: message.id!,
        format: 'full',
      });

      const headers = data.payload ? data.payload.headers || [] : [];
      const internalDateMs = Number(data.internalDate) || Date.now();
      const doc: GmailEmailDoc = {
        id: data.id || '',
        threadId: data.threadId || message.threadId || '',
        owner: ownerEmail,
        gmailAccount: gmailAccountEmail,
        from: extractHeader(headers, 'From') || 'unknown',
        to: extractHeader(headers, 'To') || '',
        subject: extractHeader(headers, 'Subject') || '(No subject)',
        date: extractHeader(headers, 'Date') || '',
        snippet: data.snippet || '',
        body: extractMessageBody(data.payload) || data.snippet || '',
        labelIds: data.labelIds || [],
        fetchedAt: new Date().toISOString(),
        internalDate: internalDateMs,
      };

      if (internalDateMs > maxInternalDate) {
        maxInternalDate = internalDateMs;
      }

      let existingDoc: GmailEmailDoc | null = null;
      try {
        const { resource } = await emailContainer.item(doc.id, ownerEmail).read<GmailEmailDoc>();
        existingDoc = resource || null;
      } catch (err: any) {
        if (err.code !== 404) {
          console.error('Failed to read existing Gmail doc', err);
        }
      }

      if (existingDoc) {
        doc.classification = existingDoc.classification;
        doc.classifiedAt = existingDoc.classifiedAt;
        doc.createdAt = existingDoc.createdAt || doc.fetchedAt;
      }

      const { resource } = await emailContainer.items.upsert(doc);
      const alreadyClassified = Boolean(resource?.classification?.status);

      if (!alreadyClassified && jobsContainer && OPENAI_API_KEY) {
        try {
          const classification = await classifyEmailAndUpsert(doc, jobsContainer);
          if (classification) {
            doc.classification = classification;
            doc.classifiedAt = new Date().toISOString();
            await emailContainer.items.upsert(doc);
          }
        } catch (err: any) {
          console.error('Failed to classify Gmail message', err);
        }
      }

      docs.push(doc);
    }
  } while (pageToken);

  if (!docs.length) {
    console.log('No new Gmail messages found for ingestion.');
    return { fetched: 0, owner: ownerEmail };
  }

  if (useState && !skipStateUpdate && maxInternalDate > (lastInternalDateMs || 0)) {
    await gmailStateStore.saveState(ownerEmail, { lastInternalDateMs: maxInternalDate });
  }

  console.log(
    `Stored or updated ${docs.length} Gmail messages for ${ownerEmail}${
      gmailQuery ? ` (query: "${gmailQuery}")` : ''
    }`
  );
  return { fetched: docs.length, owner: ownerEmail };
}

function scheduleGmailJob(emailContainer: Container | null, jobsContainer: Container | null): void {
  cron.schedule(
    GMAIL_CRON,
    async () => {
      const owners = await tokenStore.listOwners();
      if (!owners.length) {
        console.log(
          `[Cron] ${new Date().toLocaleString('en-US', {
            timeZone: EASTERN_TIMEZONE,
          })} ET – skipped: no connected Gmail accounts.`
        );
        return;
      }
      const range = getPreviousEasternDayRangeSeconds();
      const rangeQuery = `after:${range.after} before:${range.before}`;
      console.log(
        `[Cron] ${new Date().toLocaleString('en-US', {
          timeZone: EASTERN_TIMEZONE,
        })} ET – starting scheduled Gmail fetch for ${owners.length} account(s), range "${rangeQuery}".`
      );
      for (const owner of owners) {
        try {
          await fetchAndStoreGmailEmails(emailContainer, null, jobsContainer, owner, {
            queryOverride: rangeQuery,
            skipStateUpdate: true,
          });
          console.log(`[Cron] Completed scheduled fetch for ${owner}.`);
        } catch (err: any) {
          if (err.code === 'NO_GMAIL_TOKENS') {
            console.warn(`Scheduled fetch skipped for ${owner}: Gmail tokens missing.`);
          } else {
            console.error(`Scheduled Gmail fetch failed for ${owner}`, err);
          }
        }
      }
    },
    {
      timezone: EASTERN_TIMEZONE,
    }
  );
  console.log(`Scheduled Gmail fetch with cron "${GMAIL_CRON}" (${EASTERN_TIMEZONE}).`);
}

async function start(): Promise<void> {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use((req: AuthedRequest, _res: Response, next: NextFunction) => {
    req.userSession = getSessionFromRequest(req);
    next();
  });

  const { container: profileContainer } = await initCosmos();
  const { container: gmailContainer } = await initGmailCosmos();
  const { container: jobsContainer } = await initJobsCosmos();
  const { container: userContainer } = await initUserCosmos();
  tokenStore.setUserContainer(userContainer);
  gmailStateStore.setUserContainer(userContainer);
  scheduleGmailJob(gmailContainer, jobsContainer);

  // Expose minimal public config for the frontend
  app.get('/api/config', (_req: Request, res: Response) => {
    return res.json({ googleClientId: GOOGLE_CLIENT_ID || null });
  });

  app.get('/api/me', (req: AuthedRequest, res: Response) => {
    if (!req.userSession) {
      return res.status(401).json({ error: 'Not signed in' });
    }
    const { name, email, picture } = req.userSession;
    return res.json({ user: { name, email, picture } });
  });

  app.post('/api/login', async (req: Request, res: Response) => {
    const credential = (req.body && (req.body as any).credential) || '';
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential' });
    }
    try {
      const payload = await verifyGoogleIdCredential(credential);
      if (!payload || !payload.email) {
        throw new Error('Missing email in Google credential');
      }
      const user = {
        name: payload.name || payload.email,
        email: payload.email,
        picture: payload.picture || '',
      };
      setSessionCookie(res, user);
      return res.json({ user });
    } catch (err: any) {
      console.error('Login failed', err.message || err);
      return res.status(401).json({ error: 'Invalid Google credential' });
    }
  });

  app.post('/api/logout', (_req: Request, res: Response) => {
    clearSessionCookie(res);
    return res.json({ ok: true });
  });

  app.get('/auth/google', (req: AuthedRequest, res: Response) => {
    if (!req.userSession) {
      return res.redirect('/');
    }
    try {
      const oauth2Client = createOAuthClient();
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/gmail.readonly',
        ],
      });
      return res.redirect(authUrl);
    } catch (err) {
      console.error('Failed to initiate Google auth', err);
      return res.status(500).send('Google OAuth not configured');
    }
  });

  app.get('/auth/google/callback', async (req: AuthedRequest, res: Response) => {
    if (!req.userSession) {
      return res.redirect('/');
    }
    const code = req.query.code as string | undefined;
    if (!code) {
      return res.status(400).send('Missing authorization code.');
    }

    const ownerEmail = req.userSession && req.userSession.email
      ? req.userSession.email.toLowerCase()
      : null;
    if (!ownerEmail) {
      return res.status(401).send('Not signed in.');
    }

    let oauth2Client: OAuth2Client;
    try {
      oauth2Client = createOAuthClient();
    } catch (err) {
      console.error('OAuth client error', err);
      return res.status(500).send('Google OAuth not configured');
    }

    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      await tokenStore.saveTokens(ownerEmail, tokens as Record<string, unknown>);

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profilePromise = gmail.users.getProfile({ userId: 'me' });
      const messagesPromise = gmail.users.messages.list({ userId: 'me', maxResults: 5 });
      const [{ data: profile }, { data: messagesData }] = await Promise.all([
        profilePromise,
        messagesPromise,
      ]);

      const messages = messagesData.messages || [];
      const detailed = await Promise.all(
        messages.slice(0, 5).map(async (message) => {
          const { data } = await gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From', 'Date'],
          });
          const headers = data.payload ? data.payload.headers || [] : [];
          return {
            id: message.id,
            subject: extractHeader(headers, 'Subject') || '(No subject)',
            from: extractHeader(headers, 'From') || 'Unknown sender',
            date: extractHeader(headers, 'Date') || '',
            snippet: data.snippet || '',
          };
        })
      );

      const listItems = detailed
        .map((msg) => {
          return `
            <li>
              <p><strong>Subject:</strong> ${escapeHtml(msg.subject)}</p>
              <p><strong>From:</strong> ${escapeHtml(msg.from)}</p>
              <p><strong>Date:</strong> ${escapeHtml(msg.date)}</p>
              <p><strong>Snippet:</strong> ${escapeHtml(msg.snippet)}</p>
            </li>`;
        })
        .join('');

      const html = `<!doctype html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Gmail Preview</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 30px; color: #222; }
              ul { list-style: none; padding: 0; }
              li { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
              a { color: #1a73e8; text-decoration: none; }
              .actions { margin-top: 20px; display: flex; gap: 12px; }
              button { padding: 10px 16px; cursor: pointer; }
            </style>
          </head>
          <body>
            <h1>Gmail snapshot</h1>
            <p>Signed in as <strong>${escapeHtml(profile.emailAddress || '')}</strong></p>
            <ul>${listItems || '<li>No recent messages.</li>'}</ul>
            <div class="actions">
              <button onclick="logout()">Logout</button>
              <a href="/">Back to app</a>
            </div>
            <script>
              function logout() {
                sessionStorage.removeItem('googleUser');
                window.location.href = '/';
              }
            </script>
          </body>
        </html>`;

      return res.send(html);
    } catch (err: any) {
      console.error('Google auth callback error', err);
      return res.status(500).send('Failed to read Gmail. Check the server logs for details.');
    }
  });

  app.get('/api/profile/:email', async (req: Request, res: Response) => {
    const email = (req.params.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    try {
      const { resource } = await profileContainer.item(email, email).read();
      if (!resource) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      return res.json({ profile: resource });
    } catch (err: any) {
      if (err.code === 404) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      console.error('Error reading profile', err);
      return res.status(500).json({ error: 'Failed to fetch profile' });
    }
  });

  app.post('/api/profile', async (req: Request, res: Response) => {
    const name = ((req.body as any).name || '').trim();
    const email = ((req.body as any).email || '').trim().toLowerCase();

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    try {
      const doc = { id: email, email, name };
      const { resource } = await profileContainer.items.upsert(doc);
      return res.status(201).json({ profile: resource });
    } catch (err) {
      console.error('Error saving profile', err);
      return res.status(500).json({ error: 'Failed to save profile' });
    }
  });

  app.post('/api/gmail/fetch', async (req: AuthedRequest, res: Response) => {
    if (!req.userSession) {
      return res.status(401).json({ error: 'Not signed in' });
    }
    const ownerEmail = (req.userSession.email || '').toLowerCase();
    if (!ownerEmail) {
      return res.status(400).json({ error: 'Missing user email' });
    }
    try {
      const result = await fetchAndStoreGmailEmails(gmailContainer, null, jobsContainer, ownerEmail);
      return res.json({ ok: true, result });
    } catch (err: any) {
      if (err.code === 'NO_GMAIL_TOKENS') {
        return res.status(409).json({
          error: 'Gmail access not configured. Please connect your Google account.',
          code: 'NO_GMAIL_TOKENS',
        });
      }
      console.error('Manual Gmail fetch failed', err);
      return res.status(500).json({ error: 'Failed to fetch Gmail' });
    }
  });

  app.get('/api/gmail/status', async (req: AuthedRequest, res: Response) => {
    if (!req.userSession) {
      return res.status(401).json({ error: 'Not signed in' });
    }
    const ownerEmail = (req.userSession.email || '').toLowerCase();
    if (!ownerEmail) {
      return res.status(400).json({ error: 'Missing user email' });
    }
    try {
      const tokens = (await tokenStore.loadTokens(ownerEmail)) || {};
      const connected = Object.keys(tokens).length > 0;
      return res.json({ connected });
    } catch (err: any) {
      console.error('Failed to check Gmail status', err.message || err);
      return res.status(500).json({ error: 'Failed to check Gmail connection' });
    }
  });

  app.get('/api/jobs', async (req: AuthedRequest, res: Response) => {
    if (!req.userSession) {
      return res.status(401).json({ error: 'Not signed in' });
    }
    const sortParam = ((req.query.sort as string) || '').toLowerCase();
    const sortByUpdated = sortParam === 'updated';
    const orderClause = sortByUpdated
      ? 'ORDER BY c.last_updated DESC'
      : 'ORDER BY c.company_name ASC';
    try {
      const ownerEmail = (req.userSession.email || '').toLowerCase();
      const querySpec = {
        query: `SELECT c.id, c.company_name, c.applied, c.rejected, c.next_steps, c.comments, c.last_updated FROM c WHERE c.owner = @owner ${orderClause}`,
        parameters: [{ name: '@owner', value: ownerEmail }],
      };
      const { resources } = await jobsContainer.items.query<JobDoc>(querySpec).fetchAll();
      return res.json({ jobs: resources || [] });
    } catch (err: any) {
      console.error('Failed to fetch job summaries', err);
      return res.status(500).json({ error: 'Failed to load job summaries' });
    }
  });

  app.get('/api/gmail/company', async (req: AuthedRequest, res: Response) => {
    if (!req.userSession) {
      return res.status(401).json({ error: 'Not signed in' });
    }
    if (!gmailContainer) {
      return res.status(503).json({ error: 'Gmail storage not ready' });
    }
    const ownerEmail = (req.userSession.email || '').toLowerCase();
    const companyName = ((req.query.name as string) || '').trim();
    if (!ownerEmail) {
      return res.status(400).json({ error: 'Missing user email' });
    }
    if (!companyName) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    try {
      // Use readAll on the partition to avoid Cosmos errors from malformed docs on projection.
      const { resources } = await gmailContainer.items
        .readAll<GmailEmailDoc>({ partitionKey: ownerEmail })
        .fetchAll();
      const filtered = filterEmailsByCompany(resources || [], companyName).sort((a, b) => {
        const aDate = typeof a.internalDate === 'number' ? a.internalDate : 0;
        const bDate = typeof b.internalDate === 'number' ? b.internalDate : 0;
        return bDate - aDate;
      });
      return res.json({ emails: filtered });
    } catch (err: any) {
      const errorInfo = {
        message: err.message || String(err),
        code: err.code,
        statusCode: err.statusCode,
        substatus: err.substatus,
        activityId: err.activityId,
        body: err.body,
      };
      console.error('Failed to fetch company emails', errorInfo);
      try {
        await logGmailDiagnostics(gmailContainer, ownerEmail, companyName);
      } catch (diagErr: any) {
        console.error('Diagnostics failed', diagErr.message || diagErr);
      }
      return res
        .status(500)
        .json({ error: 'Failed to load company emails', activityId: errorInfo.activityId });
    }
  });

  // Serve static client (Vite build)
  app.use(express.static(STATIC_DIR));
  // Catch-all for SPA routes (regex to avoid path-to-regexp wildcard parsing issues)
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (process.env.NODE_ENV !== 'production') {
      console.log('Frontend dev (Vite): http://localhost:5173');
    }
  });
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
