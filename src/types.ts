import type { Request } from 'express';

export type ClassificationStatus =
  | 'applied'
  | 'rejected'
  | 'next_steps'
  | 'comment_only'
  | 'not_job_related';

export interface ClassificationResult {
  is_job_related: boolean;
  status: ClassificationStatus;
  summary: string;
  company_name: string;
}

export interface GmailEmailDoc {
  id: string;
  owner: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  labelIds: string[];
  fetchedAt: string;
  internalDate: number;
  classification?: ClassificationResult;
  classifiedAt?: string;
  createdAt?: string;
}

export interface CommentEntry {
  date: string;
  note: string;
}

export interface JobDoc {
  id: string;
  owner: string;
  company_name: string;
  applied: number;
  rejected: number;
  next_steps: number;
  comments: CommentEntry[];
  last_updated: string;
}

export interface SessionPayload {
  name: string;
  email: string;
  picture: string;
  createdAt: string;
  exp: number;
}

export interface AuthedRequest extends Request {
  userSession?: SessionPayload | null;
}
