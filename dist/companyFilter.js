"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterEmailsByCompany = filterEmailsByCompany;
function normalizeCompany(name) {
    return (name || '').trim().toLowerCase();
}
function filterEmailsByCompany(emails = [], companyName) {
    const target = normalizeCompany(companyName);
    if (!target)
        return [];
    return emails.filter((email) => {
        const company = email?.classification?.company_name;
        const isJob = email?.classification?.is_job_related;
        const status = email?.classification?.status;
        if (typeof company !== 'string')
            return false;
        if (isJob !== true)
            return false;
        if (status === 'not_job_related')
            return false;
        return normalizeCompany(company) === target;
    });
}
