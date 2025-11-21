import React, { useEffect, useRef, useState } from 'react';

type User = {
  name: string;
  email: string;
  picture?: string;
};

type JobSummary = {
  id: string;
  company_name: string;
  applied: number;
  rejected: number;
  next_steps: number;
  comments: { date: string; note: string }[];
  last_updated: string;
};

type GmailEmail = {
  id: string;
  threadId?: string;
  gmailAccount?: string;
  owner: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body?: string;
  labelIds?: string[];
  fetchedAt: string;
  internalDate: number;
  classification?: {
    is_job_related: boolean;
    status: string;
    summary: string;
    company_name: string;
  };
  classifiedAt?: string;
  createdAt?: string;
};

declare global {
  interface Window {
    google?: any;
  }
}

const loadGisScript = (): Promise<void> => {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity script'));
    document.head.appendChild(script);
  });
};

export default function App() {
  const [route, setRoute] = useState<string>(window.location.pathname || '/');
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [sort, setSort] = useState<'company' | 'updated'>('company');
  const [gmailStatus, setGmailStatus] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [gmailStatusError, setGmailStatusError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [companyEmails, setCompanyEmails] = useState<GmailEmail[]>([]);
  const [companyEmailsLoading, setCompanyEmailsLoading] = useState(false);
  const [companyEmailsError, setCompanyEmailsError] = useState<string | null>(null);
  const [openEmailIds, setOpenEmailIds] = useState<Set<string>>(new Set());
  const signInButtonRef = useRef<HTMLDivElement>(null);

  const checkingGmailConnection = user && gmailConnected === null;
  const hasJobs = jobs.length > 0;
  const isProfile = route.startsWith('/profile');
  const isCompany = route.startsWith('/company/');
  const currentCompanySlug = isCompany ? route.replace('/company/', '') : '';
  const currentCompanyName = currentCompanySlug ? decodeURIComponent(currentCompanySlug) : '';
  const needsAuthPage = isProfile || isCompany;

  const navigate = (path: string) => {
    if (path === route) return;
    window.history.pushState({}, '', path);
    setRoute(path);
  };

  const navigateToCompany = (companyName: string) => {
    if (!companyName) return;
    navigate(`/company/${encodeURIComponent(companyName)}`);
  };

  const ensureConfig = async () => {
    if (googleClientId) return googleClientId;
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.googleClientId) {
      setGoogleClientId(data.googleClientId);
      return data.googleClientId as string;
    }
    throw new Error('Google Sign-In not configured');
  };

  const renderGoogleButton = async () => {
    if (!needsAuthPage) return;
    try {
      const clientId = await ensureConfig();
      await loadGisScript();
      if (!window.google?.accounts?.id || !signInButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: any) => {
          if (!response.credential) {
            setAuthError('Google Sign-In failed. Please try again.');
            return;
          }
          try {
            const res = await fetch('/api/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: response.credential }),
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || 'Failed to sign in');
            }
            setUser(data.user);
            navigate('/profile');
            setAuthError(null);
          } catch (err: any) {
            setAuthError(err.message || 'Failed to sign in');
          }
        },
      });
      window.google.accounts.id.renderButton(signInButtonRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        width: 280,
      });
    } catch (err: any) {
      setAuthError(err.message || 'Failed to load Google Sign-In');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const fetchMe = async () => {
      try {
        const res = await fetch('/api/me');
        if (!res.ok) {
          setUser(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setUser(data.user);
        }
      } catch {
        setUser(null);
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    };
    fetchMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user && !loadingUser && isProfile) {
      renderGoogleButton();
    }
    if (!user && !loadingUser && isCompany) {
      renderGoogleButton();
    }
  }, [user, loadingUser, isProfile, isCompany]);

  const loadGmailConnection = async () => {
    if (!user) return;
    setGmailStatusError(null);
    try {
      const res = await fetch('/api/gmail/status');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to check Gmail connection');
      }
      setGmailConnected(Boolean(data.connected));
    } catch (err: any) {
      setGmailConnected(false);
      setGmailStatusError(err.message || 'Failed to check Gmail connection');
    }
  };

  const loadJobs = async (sortOrder: 'company' | 'updated') => {
    setJobsLoading(true);
    setJobsError(null);
    try {
      const res = await fetch(`/api/jobs?sort=${encodeURIComponent(sortOrder)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load jobs');
      }
      setJobs(data.jobs || []);
    } catch (err: any) {
      setJobsError(err.message || 'Failed to load jobs');
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    if (user && isProfile) {
      loadJobs(sort);
    }
  }, [user, sort, isProfile]);

  useEffect(() => {
    if (user && isProfile) {
      loadGmailConnection();
    } else {
      setGmailConnected(null);
      setGmailStatusError(null);
    }
  }, [user, isProfile]);

  const loadCompanyEmails = async (companyName: string) => {
    if (!companyName) return;
    setCompanyEmailsLoading(true);
    setCompanyEmailsError(null);
    setOpenEmailIds(new Set());
    try {
      const res = await fetch(`/api/gmail/company?name=${encodeURIComponent(companyName)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load company emails');
      }
      setCompanyEmails(data.emails || []);
    } catch (err: any) {
      setCompanyEmailsError(err.message || 'Failed to load company emails');
      setCompanyEmails([]);
    } finally {
      setCompanyEmailsLoading(false);
    }
  };

  useEffect(() => {
    if (user && currentCompanyName) {
      loadCompanyEmails(currentCompanyName);
    } else {
      setCompanyEmails([]);
      setCompanyEmailsError(null);
      setCompanyEmailsLoading(false);
      setOpenEmailIds(new Set());
    }
  }, [user, currentCompanyName]);

  const triggerGmailFetch = async () => {
    if (!gmailConnected) {
      setGmailStatus('Please connect your Gmail account first.');
      connectGmail();
      return;
    }
    setActionLoading(true);
    setGmailStatus('Fetching Gmail...');
    try {
      const res = await fetch('/api/gmail/fetch', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 || data.code === 'NO_GMAIL_TOKENS') {
          setGmailStatus('Please connect your Gmail account first.');
          window.location.href = '/auth/google';
          return;
        }
        throw new Error(data.error || 'Failed to fetch Gmail');
      }
      setGmailStatus(`Fetched ${data.result?.fetched || 0} emails.`);
      await loadJobs(sort);
    } catch (err: any) {
      setGmailStatus(err.message || 'Failed to fetch Gmail.');
    } finally {
      setActionLoading(false);
    }
  };

  const connectGmail = () => {
    window.location.href = '/auth/google';
  };

  const logout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setUser(null);
      setJobs([]);
      setGmailConnected(null);
      setGmailStatusError(null);
      navigate('/');
    }
  };

  const renderComments = (comments: { date: string; note: string }[]) => {
    if (!comments || !comments.length) return '—';
    return comments
      .map((c) => `${c.date}: ${c.note}`)
      .join('\n');
  };

  const gmailLinkForEmail = (email: GmailEmail) => {
    const targetId = email.threadId || email.id;
    if (!targetId) return '';
    const authUser = email.gmailAccount || email.owner || user?.email || '';
    const base = authUser
      ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(authUser)}`
      : 'https://mail.google.com/mail/u/0';
    return `${base}#all/${encodeURIComponent(targetId)}`;
  };

  const toggleEmailOpen = (emailId: string) => {
    setOpenEmailIds((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  };

  useEffect(() => {
    const handler = () => setRoute(window.location.pathname || '/');
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const marketingPage = (
    <>
      <nav className="top-nav fade-in">
        <div className="brand">
          <div className="brand-mark">JT</div>
          <span>Job Tracker</span>
        </div>
        <div className="nav-links">
          <a href="#" onClick={(e) => e.preventDefault()}>
            Features
          </a>
          <a href="#" onClick={(e) => e.preventDefault()}>
            How it works
          </a>
          <a href="#" onClick={(e) => e.preventDefault()}>
            Pricing
          </a>
          <a href="#" onClick={(e) => e.preventDefault()}>
            Support
          </a>
        </div>
        <div className="nav-actions">
          {user ? (
            <button className="btn primary" onClick={() => navigate('/profile')}>
              Go to dashboard
            </button>
          ) : (
            <>
              <button className="btn link" onClick={() => navigate('/profile')}>
                Log in
              </button>
              <button className="btn primary" onClick={() => navigate('/profile')}>
                Sign up
              </button>
            </>
          )}
        </div>
      </nav>

      <header className="hero one-col fade-in">
        <div className="hero-copy">
          <div className="eyebrow">Built for focused job searches</div>
          <h1>
            Keep every application <span className="highlight">under control.</span>
          </h1>
          <p className="lede hero-headline">
            Connect Gmail once, we classify every reply, and you get a calm view of each company
            you&apos;re talking to—no more digging through threads.
          </p>
          <div className="sub-row">
            {gmailConnected && (
              <span className="badge success">
                <span className="badge-dot" />
                Gmail connected
              </span>
            )}
          </div>
        </div>
      </header>

      <section className="steps fade-in">
        <div className="step-card pill-row hero-bullets">
          <div className="hero-bullet">
            <span className="check">✓</span> Secure Gmail connect
          </div>
          <div className="hero-bullet">
            <span className="check">✓</span> Auto-classified responses
          </div>
          <div className="hero-bullet">
            <span className="check">✓</span> Per-company rollups
          </div>
          <div className="hero-bullet">
            <span className="check">✓</span> Nightly + on-demand sync
          </div>
        </div>

        <div className="social-proof">
          <div className="avatar-stack">
            <span className="avatar-dot">A</span>
            <span className="avatar-dot">L</span>
            <span className="avatar-dot">S</span>
            <span className="avatar-dot">M</span>
            <span className="avatar-dot">R</span>
          </div>
          <div>
            <p className="quote">
              “I finally know exactly where each company stands without digging through my inbox.”
            </p>
            <p className="muted small">Made for people running fast job searches.</p>
          </div>
        </div>
      </section>
    </>
  );

  const profilePage = (
    <>
      {user && gmailConnected === false && (
        <div className="inline-banner warning">
          <div>
            <p className="label">Onboarding</p>
            <p className="title">Connect Gmail to start classifying</p>
            <p className="muted small">
              We fetch only your job-related messages and keep refresh tokens in your Key Vault.
            </p>
          </div>
          <div className="banner-actions">
            <button className="btn primary" onClick={connectGmail} disabled={actionLoading}>
              Connect Gmail
            </button>
          </div>
        </div>
      )}

      <header className="hero one-col fade-in compact-hero">
        <div className="hero-copy">
          <div className="hero-inline">
            <div className="eyebrow">Inbox automations</div>
            <div className="action-row tight-row hero-actions">
              {user ? (
                <>
                  {checkingGmailConnection ? (
                    <button className="btn" disabled>
                      Checking Gmail…
                    </button>
                  ) : gmailConnected ? (
                    <button
                      className="btn primary"
                      onClick={triggerGmailFetch}
                      disabled={actionLoading}
                    >
                      {actionLoading ? 'Working…' : 'Fetch Gmail now'}
                    </button>
                  ) : (
                    <button className="btn primary" onClick={connectGmail} disabled={actionLoading}>
                      Connect Gmail
                    </button>
                  )}
                  <button className="btn ghost" onClick={logout}>
                    Logout
                  </button>
                  {gmailConnected && (
                    <span className="badge success">
                      <span className="badge-dot" />
                      Gmail connected
                    </span>
                  )}
                </>
              ) : (
                <div className="sign-in-block">
                  <div ref={signInButtonRef} />
                  {authError && <p className="error">{authError}</p>}
                </div>
              )}
            </div>
          </div>
          {(gmailStatus || gmailStatusError) && (
            <div className="sub-row tight-row hero-status">
              {gmailStatus && <p className="status">{gmailStatus}</p>}
              {gmailStatusError && <p className="error">{gmailStatusError}</p>}
            </div>
          )}
        </div>
      </header>

      <main className="panel scrollable fade-in">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Applications</p>
            <h2>Live view</h2>
          </div>
          <div className="controls-row toolbox">
            <div className="dropdown">
              <button className="btn ghost dropdown-toggle">Sort & View</button>
              <div className="dropdown-menu">
                <div className="menu-section">
                  <p className="muted small">Sort</p>
                  <button
                    className={sort === 'company' ? 'menu-item active' : 'menu-item'}
                    onClick={() => setSort('company')}
                  >
                    Company
                  </button>
                  <button
                    className={sort === 'updated' ? 'menu-item active' : 'menu-item'}
                    onClick={() => setSort('updated')}
                  >
                    Last updated
                  </button>
                </div>
                <div className="menu-section">
                  <p className="muted small">View</p>
                  <button
                    className={viewMode === 'cards' ? 'menu-item active' : 'menu-item'}
                    onClick={() => setViewMode('cards')}
                  >
                    Cards
                  </button>
                  <button
                    className={viewMode === 'table' ? 'menu-item active' : 'menu-item'}
                    onClick={() => setViewMode('table')}
                  >
                    Table
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {!user && !loadingUser && (
          <div className="empty">Sign in to see your tracked applications.</div>
        )}
        {jobsLoading && user && <div className="empty">Loading jobs…</div>}
        {jobsError && <div className="error">{jobsError}</div>}
        {!jobsLoading && user && jobs.length === 0 && !jobsError && (
          <div className="empty">
            <h3>Nothing yet</h3>
            <p>Connect Gmail to pull in your first batch of applications.</p>
            {!gmailConnected && (
              <button className="btn primary" onClick={connectGmail}>
                Connect Gmail
              </button>
            )}
          </div>
        )}

        {user && hasJobs && viewMode === 'cards' && (
          <div className="card-grid">
            {jobs.map((job) => (
              <article
                key={job.id}
                className="job-card clickable"
                role="button"
                tabIndex={0}
                onClick={() => navigateToCompany(job.company_name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigateToCompany(job.company_name);
                  }
                }}
              >
                <div className="job-card-top">
                  <div className="company-mark">
                    <span>{job.company_name?.[0] || '?'}</span>
                  </div>
                  <div>
                    <p className="label">Company</p>
                    <h4>{job.company_name || ''}</h4>
                    <p className="muted small">Last updated {job.last_updated || '—'}</p>
                  </div>
                </div>
                <div className="pill-row">
                  <span className="pill neutral">Applied {job.applied || 0}</span>
                  <span className="pill danger">Rejected {job.rejected || 0}</span>
                  <span className="pill success">Next steps {job.next_steps || 0}</span>
                </div>
                <div className="notes">
                  <p className="label">Notes</p>
                  {job.comments && job.comments.length > 0 ? (
                    <ul>
                      {job.comments.slice(0, 2).map((c, idx) => (
                        <li key={idx}>
                          <span className="muted small">{c.date}</span>
                          <div>{c.note}</div>
                        </li>
                      ))}
                      {job.comments.length > 2 && (
                        <li className="muted small">+{job.comments.length - 2} more</li>
                      )}
                    </ul>
                  ) : (
                    <p className="muted">No notes yet.</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {user && hasJobs && viewMode === 'table' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Applied</th>
                  <th>Rejected</th>
                  <th>Next steps</th>
                  <th>Last updated</th>
                  <th>Comments</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="clickable-row"
                    onClick={() => navigateToCompany(job.company_name)}
                  >
                    <td>{job.company_name || ''}</td>
                    <td>
                      <span className="pill neutral">{job.applied || 0}</span>
                    </td>
                    <td>
                      <span className="pill danger">{job.rejected || 0}</span>
                    </td>
                    <td>
                      <span className="pill success">{job.next_steps || 0}</span>
                    </td>
                    <td>{job.last_updated || ''}</td>
                    <td>
                      <div className="comment-text">{renderComments(job.comments || [])}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );

  const companyPage = (
    <>
      <nav className="top-nav fade-in">
        <div className="brand" onClick={() => navigate('/')}>
          <div className="brand-mark">JT</div>
          <span>Job Tracker</span>
        </div>
        <div className="nav-actions">
          <button className="btn ghost" onClick={() => navigate('/profile')}>
            Back to dashboard
          </button>
        </div>
      </nav>

      <header className="hero one-col fade-in compact-hero">
        <div className="hero-copy">
          <div className="hero-inline">
            <div>
              <div className="eyebrow">Company</div>
              <h2>{currentCompanyName || 'Company'}</h2>
            </div>
            <div className="action-row">
              <button className="btn ghost" onClick={() => navigate('/profile')}>
                ← Overview
              </button>
            </div>
          </div>
          {companyEmailsError && <p className="error">{companyEmailsError}</p>}
          {!user && !loadingUser && (
            <div className="sign-in-block">
              <div ref={signInButtonRef} />
              {authError && <p className="error">{authError}</p>}
            </div>
          )}
        </div>
      </header>

      <main className="panel scrollable fade-in">
        {!user && loadingUser && <div className="empty">Checking session…</div>}
        {user && companyEmailsLoading && <div className="empty">Loading emails…</div>}
        {user && !companyEmailsLoading && !companyEmails.length && !companyEmailsError && (
          <div className="empty">No classified emails for this company yet.</div>
        )}
        {user && !companyEmailsLoading && companyEmails.length > 0 && (
          <div className="accordion">
            {companyEmails.map((email) => {
              const isOpen = openEmailIds.has(email.id);
              const gmailLink = gmailLinkForEmail(email);
              return (
                <article key={email.id} className={isOpen ? 'accordion-item open' : 'accordion-item'}>
                  <button className="accordion-toggle" onClick={() => toggleEmailOpen(email.id)}>
                    <div className="accordion-meta">
                      <p className="muted small">{email.date}</p>
                      <p className="label">{email.classification?.status || 'email'}</p>
                    </div>
                    <div className="accordion-title">
                      <h4>{email.subject || '(No subject)'}</h4>
                      <p className="muted small">From {email.from || 'Unknown sender'}</p>
                    </div>
                    <div className="accordion-actions">
                      {gmailLink && (
                        <a
                          href={gmailLink}
                          className="btn ghost"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open in Gmail
                        </a>
                      )}
                      <span className="chevron">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="accordion-body">
                      <p className="muted small">
                        {email.classification?.summary || email.snippet || 'No summary available.'}
                      </p>
                      {(email.body || email.snippet) && (
                        <pre className="email-body">
                          {(email.body || email.snippet || '').slice(0, 2000)}
                        </pre>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </>
  );

  return (
    <div className="page">
      <div className="gradient-bg" />
      <div className="page-inner">
        {isCompany ? companyPage : isProfile ? profilePage : marketingPage}
      </div>
    </div>
  );
}
