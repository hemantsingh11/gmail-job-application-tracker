import React, { useEffect, useMemo, useRef, useState } from 'react';

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
  const signInButtonRef = useRef<HTMLDivElement>(null);

  const totals = useMemo(() => {
    return jobs.reduce(
      (acc, job) => {
        acc.applied += job.applied || 0;
        acc.rejected += job.rejected || 0;
        acc.next_steps += job.next_steps || 0;
        return acc;
      },
      { applied: 0, rejected: 0, next_steps: 0 }
    );
  }, [jobs]);

  const checkingGmailConnection = user && gmailConnected === null;

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
    if (!user && !loadingUser) {
      renderGoogleButton();
    }
  }, [user, loadingUser]);

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
    if (user) {
      loadJobs(sort);
    }
  }, [user, sort]);

  useEffect(() => {
    if (user) {
      loadGmailConnection();
    } else {
      setGmailConnected(null);
      setGmailStatusError(null);
    }
  }, [user]);

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
    }
  };

  const renderComments = (comments: { date: string; note: string }[]) => {
    if (!comments || !comments.length) return '—';
    return comments
      .map((c) => `${c.date}: ${c.note}`)
      .join('\n');
  };

  return (
    <div className="page">
      <div className="gradient-bg" />
      <div className="page-inner">
        <header className="hero">
          <div className="hero-copy">
            <div className="eyebrow">Job Tracker</div>
            <h1>
              Stay on top of your job emails
              <span className="highlight"> effortlessly</span>
            </h1>
            <p className="lede">
              Connect Gmail, auto-classify responses, and track your applications without a
              spreadsheet.
            </p>
            <div className="action-row">
              {user ? (
                <>
                  {checkingGmailConnection ? (
                    <button className="btn" disabled>
                      Checking Gmail connection…
                    </button>
                  ) : gmailConnected ? (
                    <>
                      <button
                        className="btn primary"
                        onClick={triggerGmailFetch}
                        disabled={actionLoading}
                      >
                        {actionLoading ? 'Working…' : 'Fetch Gmail now'}
                      </button>
                      <span className="badge success">
                        <span className="badge-dot" />
                        Gmail connected
                      </span>
                    </>
                  ) : (
                    <button
                      className="btn primary"
                      onClick={connectGmail}
                      disabled={actionLoading}
                    >
                      Connect Gmail to start
                    </button>
                  )}
                  <button className="btn ghost" onClick={logout}>
                    Logout
                  </button>
                </>
              ) : (
                <div className="sign-in-block">
                  <div ref={signInButtonRef} />
                  {authError && <p className="error">{authError}</p>}
                </div>
              )}
            </div>
            {gmailStatus && <p className="status">{gmailStatus}</p>}
            {gmailStatusError && <p className="error">{gmailStatusError}</p>}
          </div>
          <div className="hero-card">
            <div className="card-header">
              <div className="dot green" />
              <div className="dot amber" />
              <div className="dot blue" />
            </div>
            {user ? (
              <div className="profile">
                {user.picture ? (
                  <img className="avatar" src={user.picture} alt={user.name} />
                ) : (
                  <div className="avatar placeholder">{user.name?.[0] || '?'}</div>
                )}
                <div>
                  <div className="label">Signed in</div>
                  <div className="title">{user.name || user.email}</div>
                  <div className="muted">{user.email}</div>
                </div>
              </div>
            ) : (
              <div className="profile skeleton">
                <div className="avatar placeholder" />
                <div>
                  <div className="skeleton-line short" />
                  <div className="skeleton-line" />
                </div>
              </div>
            )}
            <div className="stats">
              <div className="stat">
                <div className="label">Applied</div>
                <div className="stat-value">{totals.applied}</div>
              </div>
              <div className="stat">
                <div className="label">Rejections</div>
                <div className="stat-value">{totals.rejected}</div>
              </div>
              <div className="stat">
                <div className="label">Next steps</div>
                <div className="stat-value">{totals.next_steps}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Applications</p>
              <h2>Per-company summary</h2>
            </div>
            <div className="segmented">
              <button
                className={sort === 'company' ? 'active' : ''}
                onClick={() => setSort('company')}
              >
                Company
              </button>
              <button
                className={sort === 'updated' ? 'active' : ''}
                onClick={() => setSort('updated')}
              >
                Last updated
              </button>
            </div>
          </div>

          {!user && !loadingUser && (
            <div className="empty">Sign in to see your tracked applications.</div>
          )}
          {jobsLoading && user && <div className="empty">Loading jobs…</div>}
          {jobsError && <div className="error">{jobsError}</div>}
          {!jobsLoading && user && jobs.length === 0 && !jobsError && (
            <div className="empty">No job applications tracked yet.</div>
          )}

          {user && jobs.length > 0 && (
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
                    <tr key={job.id}>
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
      </div>
    </div>
  );
}
