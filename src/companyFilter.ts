import type { GmailEmailDoc } from './types';

function normalizeCompany(name: string): string {
  return (name || '').trim().toLowerCase();
}

export function filterEmailsByCompany(
  emails: GmailEmailDoc[] = [],
  companyName: string
): GmailEmailDoc[] {
  const target = normalizeCompany(companyName);
  if (!target) return [];
  return emails.filter((email) => {
    const company = email?.classification?.company_name;
    const isJob = email?.classification?.is_job_related;
    const status = email?.classification?.status;
    if (typeof company !== 'string') return false;
    if (isJob !== true) return false;
    if (status === 'not_job_related') return false;
    return normalizeCompany(company) === target;
  });
}
