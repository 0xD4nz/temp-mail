'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  LogOut,
  Search,
  Trash2,
  Plus,
  Globe,
  ArrowLeft,
  Inbox as InboxIcon,
  Mail,
  CalendarClock,
  Database,
  KeyRound,
} from 'lucide-react';

interface AdminStats {
  inboxes: number;
  emails: number;
  emailsToday: number;
  domains: string[];
  dbSizeBytes: number;
}

interface AdminInbox {
  address: string;
  domain: string;
  createdAt: number;
  expiresAt: number;
  emailCount: number;
}

interface DomainInfo {
  domain: string;
  isPrimary: boolean;
}

type AuthState = 'loading' | 'login' | 'ready' | 'unconfigured';
type Tab = 'overview' | 'inboxes' | 'domains';

const formatBytes = (b: number): string => {
  if (!b || b < 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateTime = (ts: number): string => {
  try {
    return new Date(ts).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
};

export default function AdminPage() {
  const [auth, setAuth] = useState<AuthState>('loading');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);

  const [inboxes, setInboxes] = useState<AdminInbox[]>([]);
  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxesLoading, setInboxesLoading] = useState(false);

  const [domains, setDomains] = useState<DomainInfo[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [domainError, setDomainError] = useState('');

  const loadStats = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.status === 401) {
        setAuth('login');
        return false;
      }
      if (res.status === 503) {
        setAuth('unconfigured');
        return false;
      }
      if (!res.ok) {
        setAuth('login');
        return false;
      }
      const data = (await res.json()) as AdminStats;
      setStats(data);
      setAuth('ready');
      return true;
    } catch {
      setAuth('login');
      return false;
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 503) {
        setAuth('unconfigured');
        return;
      }
      if (!res.ok) {
        setLoginError('Wrong password. Please try again.');
        return;
      }
      setPassword('');
      await loadStats();
    } catch {
      setLoginError('Login failed. Check your connection and try again.');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setAuth('login');
    setStats(null);
    setPassword('');
  };

  const loadInboxes = useCallback(async (q: string) => {
    setInboxesLoading(true);
    try {
      const res = await fetch(
        `/api/admin/inboxes?search=${encodeURIComponent(q)}&limit=100`
      );
      if (res.ok) {
        const data = await res.json();
        setInboxes((data.inboxes || []) as AdminInbox[]);
      }
    } catch {
      /* ignore */
    } finally {
      setInboxesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth !== 'ready' || tab !== 'inboxes') return;
    const t = setTimeout(() => loadInboxes(inboxSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [auth, tab, inboxSearch, loadInboxes]);

  const handleDeleteInbox = async (address: string) => {
    if (
      !window.confirm(
        `Delete inbox ${address} and all of its emails? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/inboxes?address=${encodeURIComponent(address)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setInboxes((prev) => prev.filter((i) => i.address !== address));
        loadStats();
      }
    } catch {
      /* ignore */
    }
  };

  const loadDomains = useCallback(async () => {
    setDomainsLoading(true);
    try {
      const res = await fetch('/api/admin/domains');
      if (res.ok) {
        const data = await res.json();
        setDomains((data.domains || []) as DomainInfo[]);
      }
    } catch {
      /* ignore */
    } finally {
      setDomainsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth === 'ready' && tab === 'domains') {
      loadDomains();
    }
  }, [auth, tab, loadDomains]);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = newDomain.trim().toLowerCase();
    if (!d) return;
    setDomainError('');
    try {
      const res = await fetch('/api/admin/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: d }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDomainError((data.error as string) || 'Failed to add domain.');
        return;
      }
      setDomains((data.domains || []) as DomainInfo[]);
      setNewDomain('');
      loadStats();
    } catch {
      setDomainError('Failed to add domain. Check your connection.');
    }
  };

  const handleDeleteDomain = async (domain: string) => {
    if (domains.length <= 1) return;
    if (
      !window.confirm(
        `Remove domain ${domain}? Inboxes on this domain will stop receiving mail.`
      )
    ) {
      return;
    }
    setDomainError('');
    try {
      const res = await fetch(
        `/api/admin/domains?domain=${encodeURIComponent(domain)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (res.ok) {
        setDomains((data.domains || []) as DomainInfo[]);
        loadStats();
      } else {
        setDomainError((data.error as string) || 'Failed to remove domain.');
      }
    } catch {
      setDomainError('Failed to remove domain. Check your connection.');
    }
  };

  if (auth === 'loading') {
    return (
      <main className="main">
        <div className="adminLoading">Checking admin access...</div>
      </main>
    );
  }

  if (auth === 'unconfigured') {
    return (
      <main className="main">
        <div className="loginWrap">
          <div className="loginCard">
            <div className="loginIcon">
              <ShieldCheck />
            </div>
            <h1>Admin Locked</h1>
            <p>Admin belum dikonfigurasi (set ADMIN_PASSWORD)</p>
            <a href="/" className="btn btnSecondary">
              <ArrowLeft />
              Back to site
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (auth === 'login') {
    return (
      <main className="main">
        <div className="loginWrap">
          <div className="loginCard">
            <div className="loginIcon">
              <KeyRound />
            </div>
            <h1>Admin Login</h1>
            <p>Enter the admin password to continue.</p>
            <form onSubmit={handleLogin}>
              <div className="formGroup" style={{ textAlign: 'left' }}>
                <label className="formLabel" htmlFor="admin-password">
                  Password
                </label>
                <input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Admin password"
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                className="btn btnPrimary"
                disabled={loginBusy || !password}
                style={{ width: '100%' }}
              >
                <ShieldCheck />
                {loginBusy ? 'Checking...' : 'Log in'}
              </button>
            </form>
            {loginError && <div className="loginError">{loginError}</div>}
          </div>
        </div>
      </main>
    );
  }

  const primaryDomain =
    domains.find((d) => d.isPrimary)?.domain ||
    stats?.domains?.[0] ||
    'yourdomain.com';

  return (
    <main className="main">
      <div className="adminWrap">
        <header className="adminHeader">
          <div className="adminBrand">
            <div className="adminBrandMark">
              <ShieldCheck />
            </div>
            <div>
              <h1>TempMail Admin</h1>
              <p>Control Panel</p>
            </div>
          </div>
          <div className="adminHeaderActions">
            <a href="/" className="btn btnSecondary btnSmall">
              <ArrowLeft />
              View site
            </a>
            <button
              type="button"
              className="btn btnDanger btnSmall"
              onClick={handleLogout}
            >
              <LogOut />
              Logout
            </button>
          </div>
        </header>

        <nav className="adminTabs">
          <button
            type="button"
            className={`adminTab ${tab === 'overview' ? 'active' : ''}`}
            onClick={() => setTab('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`adminTab ${tab === 'inboxes' ? 'active' : ''}`}
            onClick={() => setTab('inboxes')}
          >
            Inboxes
          </button>
          <button
            type="button"
            className={`adminTab ${tab === 'domains' ? 'active' : ''}`}
            onClick={() => setTab('domains')}
          >
            Domains
          </button>
        </nav>

        {tab === 'overview' && (
          <div className="adminGrid">
            <div className="adminStatCard accent-yellow">
              <h3>{stats?.inboxes ?? 0}</h3>
              <p>Total Inbox</p>
            </div>
            <div className="adminStatCard accent-blue">
              <h3>{stats?.emails ?? 0}</h3>
              <p>Total Email</p>
            </div>
            <div className="adminStatCard accent-pink">
              <h3>{stats?.emailsToday ?? 0}</h3>
              <p>Email Hari Ini</p>
            </div>
            <div className="adminStatCard accent-green">
              <h3>{formatBytes(stats?.dbSizeBytes ?? 0)}</h3>
              <p>Ukuran DB</p>
            </div>
          </div>
        )}

        {tab === 'inboxes' && (
          <div className="adminPanel">
            <div className="adminPanelHeader">
              <h2>
                <InboxIcon
                  style={{ width: 18, height: 18, verticalAlign: '-3px' }}
                />{' '}
                Inboxes
              </h2>
              <span className="badge">{inboxes.length} shown</span>
            </div>
            <div className="adminPanelBody">
              <div className="adminSearchRow">
                <input
                  type="search"
                  placeholder="Search by address..."
                  value={inboxSearch}
                  onChange={(e) => setInboxSearch(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btnSecondary"
                  onClick={() => loadInboxes(inboxSearch.trim())}
                >
                  <Search />
                  Search
                </button>
              </div>
              {inboxesLoading ? (
                <p>Loading inboxes...</p>
              ) : inboxes.length === 0 ? (
                <div className="emptyState">
                  <div className="emptyIcon">
                    <InboxIcon />
                  </div>
                  <h3 className="emptyTitle">No inboxes found</h3>
                  <p className="emptyText">
                    Try a different search term, or wait for new inboxes to be
                    created.
                  </p>
                </div>
              ) : (
                inboxes.map((inbox) => (
                  <div key={inbox.address} className="adminRow">
                    <div className="adminRowMain">
                      <div className="adminRowTitle">{inbox.address}</div>
                      <div className="adminRowSub">
                        Created {formatDateTime(inbox.createdAt)} · Expires{' '}
                        {formatDateTime(inbox.expiresAt)}
                      </div>
                    </div>
                    <div className="adminRowMeta">
                      <span className="badge">{inbox.domain}</span>
                      <span className="badge">
                        <Mail style={{ width: 12, height: 12 }} />{' '}
                        {inbox.emailCount}
                      </span>
                      <button
                        type="button"
                        className="btn btnDanger btnSmall"
                        title={`Delete ${inbox.address}`}
                        onClick={() => handleDeleteInbox(inbox.address)}
                      >
                        <Trash2 />
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'domains' && (
          <>
            <div className="adminPanel">
              <div className="adminPanelHeader">
                <h2>
                  <Globe
                    style={{ width: 18, height: 18, verticalAlign: '-3px' }}
                  />{' '}
                  Domains
                </h2>
              </div>
              <div className="adminPanelBody">
                <form onSubmit={handleAddDomain}>
                  <div className="adminSearchRow">
                    <input
                      type="text"
                      placeholder="newdomain.com"
                      value={newDomain}
                      onChange={(e) =>
                        setNewDomain(
                          e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, '')
                        )
                      }
                    />
                    <button type="submit" className="btn btnPrimary">
                      <Plus />
                      Add domain
                    </button>
                  </div>
                </form>
                {domainError && <div className="loginError">{domainError}</div>}
                {domainsLoading ? (
                  <p>Loading domains...</p>
                ) : (
                  domains.map((d) => (
                    <div key={d.domain} className="adminRow">
                      <div className="adminRowMain">
                        <div className="adminRowTitle">{d.domain}</div>
                      </div>
                      <div className="adminRowMeta">
                        {d.isPrimary && (
                          <span className="badge">Primary</span>
                        )}
                        <button
                          type="button"
                          className="btn btnDanger btnSmall"
                          title={`Remove ${d.domain}`}
                          disabled={domains.length <= 1}
                          onClick={() => handleDeleteDomain(d.domain)}
                        >
                          <Trash2 />
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="adminNote">
              <strong>DNS setup</strong>
              Arahkan MX setiap domain ke server ini agar bisa menerima email.
              <pre>
                {`Type   Host   Value                  Priority
MX     @      mail.${primaryDomain}   10`}
              </pre>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginTop: 12,
                  alignItems: 'center',
                  fontSize: '0.82rem',
                }}
              >
                <CalendarClock style={{ width: 16, height: 16 }} />
                DNS changes can take a few minutes to propagate.
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
