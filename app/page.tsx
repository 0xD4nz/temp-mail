'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mail,
  Copy,
  RefreshCw,
  Trash2,
  Clock,
  Inbox as InboxIcon,
  X,
  Check,
  MailOpen,
  Sparkles,
  Plus,
  Search,
  Bell,
  BellOff,
  Settings,
  Sun,
  Moon,
  Paperclip,
  Download,
  RotateCcw,
  Timer,
  BarChart3,
  Archive,
  Eye,
  EyeOff,
  ChevronDown,
  Globe,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { formatDate, extractName, getInitials, stringToColor, truncate, copyToClipboard, sanitizeHtml } from '@/lib/utils';

interface Attachment {
  filename: string;
  contentType: string;
  size: number;
  content: string;
}

interface Email {
  id: string;
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  date: Date;
  read: boolean;
  deleted?: boolean;
  attachments?: Attachment[];
}

interface Inbox {
  address: string;
  createdAt: number;
  expiresAt: number;
  maxExpiresAt?: number;
  isCustom: boolean;
  domain?: string;
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
}

// Email Content Component with Iframe Isolation
const EmailContent = ({ html, text }: { html?: string; text?: string }) => {
  const [iframeHeight, setIframeHeight] = useState('auto');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'iframe-height' && typeof event.data.height === 'number') {
        // Add buffer and set height directly from iframe's reported height
        setIframeHeight(`${event.data.height + 40}px`);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (html) {
    const sanitizedHtml = sanitizeHtml(html);
    const wrappedHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            html, body { 
              margin: 0;
              padding: 0;
              overflow: hidden;
            }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
              padding: 16px; 
              color: #1e293b; 
              line-height: 1.6;
              background-color: #ffffff;
            }
            img { max-width: 100%; height: auto; display: block; }
            a { color: #6366f1; text-decoration: none; }
            a:hover { text-decoration: underline; }
            * { box-sizing: border-box; }
          </style>
        </head>
        <body>
          <div id="content-root">${sanitizedHtml}</div>
          <script>
            function reportHeight() {
              const height = document.body.scrollHeight;
              window.parent.postMessage({ type: 'iframe-height', height: height }, '*');
            }
            
            // Report on load
            window.onload = function() {
              reportHeight();
              // Multiple delayed reports for images/async content
              setTimeout(reportHeight, 100);
              setTimeout(reportHeight, 300);
              setTimeout(reportHeight, 600);
              setTimeout(reportHeight, 1000);
              setTimeout(reportHeight, 2000);
            };
            
            // Watch for size changes
            if (window.ResizeObserver) {
              new ResizeObserver(reportHeight).observe(document.body);
            }
            
            // Also report images loaded
            document.querySelectorAll('img').forEach(function(img) {
              img.onload = reportHeight;
            });
            
            // Initial report
            reportHeight();
          </script>
        </body>
      </html>
    `;

    return (
      <div className="emailContentContainer">
        <iframe
          ref={iframeRef}
          srcDoc={wrappedHtml}
          className="emailIframe"
          style={{ height: iframeHeight, minHeight: '200px', flex: '1 0 auto' }}
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-scripts"
          title="Email Content"
        />
      </div>
    );
  }

  return (
    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', padding: '24px' }}>
      {text || ''}
    </pre>
  );
};

export default function Home() {
  // State
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [activeInbox, setActiveInbox] = useState<string>('');
  const [emails, setEmails] = useState<Email[]>([]);
  const [trashedEmails, setTrashedEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [qrCode, setQrCode] = useState<string>('');
  const [canExtend, setCanExtend] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [showTrash, setShowTrash] = useState(false);
  const [inboxMaximized, setInboxMaximized] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Settings & Modals
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewInboxModal, setShowNewInboxModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customUsername, setCustomUsername] = useState('');

  // Domain selection
  const [availableDomains, setAvailableDomains] = useState<string[]>(['tempmail.local']);
  const [selectedDomain, setSelectedDomain] = useState('tempmail.local');

  // Stats
  const [stats, setStats] = useState({
    totalReceived: 0,
    totalRead: 0,
    unread: 0,
    inTrash: 0,
  });

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Refs
  const prevEmailCount = useRef(0);

  // Show toast notification
  const showToast = useCallback((type: Toast['type'], title: string, message?: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  // Fetch available domains
  const fetchDomains = async () => {
    try {
      const res = await fetch('/api/generate?domains=true');
      const data = await res.json();
      if (data.success && data.domains) {
        setAvailableDomains(data.domains);
        setSelectedDomain(data.domains[0]);
      }
    } catch (error) {
      console.error('Failed to fetch domains:', error);
    }
  };

  // Generate new email address
  const generateEmail = useCallback(async (custom?: string, domain?: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customUsername: custom,
          domain: domain || selectedDomain
        }),
      });
      const data = await res.json();

      if (!data.success) {
        showToast('error', 'Error', data.error);
        return;
      }

      const newInbox: Inbox = {
        address: data.email,
        createdAt: Date.now(),
        expiresAt: data.expiresAt,
        maxExpiresAt: data.maxExpiresAt,
        isCustom: data.isCustom,
        domain: data.domain,
      };

      setInboxes(prev => [...prev, newInbox]);
      setActiveInbox(data.email);
      setEmails([]);
      setSelectedEmail(null);
      setTimeLeft(data.expiresIn || 3600);
      setCanExtend(true);

      // Save to localStorage
      const savedInboxes = JSON.parse(localStorage.getItem('tempmail_inboxes') || '[]');
      savedInboxes.push(newInbox);
      localStorage.setItem('tempmail_inboxes', JSON.stringify(savedInboxes));

      showToast('success', 'Email Created', data.email);

      // Generate QR code
      fetchQRCode(data.email);
    } catch (error) {
      console.error('Failed to generate email:', error);
      showToast('error', 'Error', 'Failed to generate email');
    } finally {
      setLoading(false);
    }
  }, [showToast, selectedDomain]);

  // Fetch QR code
  const fetchQRCode = async (email: string) => {
    try {
      const res = await fetch(`/api/qrcode?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.success) {
        setQrCode(data.qrcode);
      }
    } catch (error) {
      console.error('Failed to fetch QR code:', error);
    }
  };

  // Fetch emails
  const fetchEmails = useCallback(async (showRefreshing = true) => {
    if (!activeInbox) return;

    if (showRefreshing) setRefreshing(true);
    try {
      const url = showTrash
        ? `/api/emails?address=${encodeURIComponent(activeInbox)}&trash=true`
        : `/api/emails?address=${encodeURIComponent(activeInbox)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        if (showTrash) {
          setTrashedEmails(data.emails);
        } else {
          // Check for new emails
          if (notificationsEnabled && data.emails.length > prevEmailCount.current) {
            const newCount = data.emails.length - prevEmailCount.current;
            showToast('info', 'New Email', `You have ${newCount} new email(s)`);

            // Browser notification
            if (Notification.permission === 'granted') {
              new Notification('TempMail - New Email', {
                body: `You have ${newCount} new email(s)`,
                icon: '/favicon.ico',
              });
            }
          }
          prevEmailCount.current = data.emails.length;
          setEmails(data.emails);
        }
      }

      // Fetch stats
      const statsRes = await fetch(`/api/emails?address=${encodeURIComponent(activeInbox)}&stats=true`);
      const statsData = await statsRes.json();
      if (statsData.success && statsData.stats) {
        setStats(statsData.stats);
      }

      // Check extend status
      const inboxRes = await fetch(`/api/inbox?address=${encodeURIComponent(activeInbox)}`);
      const inboxData = await inboxRes.json();
      if (inboxData.success) {
        setCanExtend(inboxData.canExtend);
      }
    } catch (error) {
      console.error('Failed to fetch emails:', error);
    } finally {
      setRefreshing(false);
    }
  }, [activeInbox, showTrash, notificationsEnabled, showToast]);

  // Delete email
  const handleDeleteEmail = async (emailId: string, permanent = false) => {
    try {
      const url = permanent
        ? `/api/emails?address=${encodeURIComponent(activeInbox)}&id=${emailId}&permanent=true`
        : `/api/emails?address=${encodeURIComponent(activeInbox)}&id=${emailId}`;

      await fetch(url, { method: 'DELETE' });

      if (permanent) {
        setTrashedEmails(prev => prev.filter(e => e.id !== emailId));
        showToast('success', 'Deleted', 'Email permanently deleted');
      } else {
        setEmails(prev => prev.filter(e => e.id !== emailId));
        showToast('success', 'Moved to Trash', 'Email moved to trash');
      }

      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null);
      }
    } catch (error) {
      console.error('Failed to delete email:', error);
      showToast('error', 'Error', 'Failed to delete email');
    }
  };

  // Delete inbox completely
  const handleDeleteInbox = async () => {
    try {
      await fetch(`/api/inbox?address=${encodeURIComponent(activeInbox)}`, {
        method: 'DELETE',
      });

      // Remove from state
      const newInboxes = inboxes.filter(i => i.address !== activeInbox);
      setInboxes(newInboxes);

      // Update localStorage
      localStorage.setItem('tempmail_inboxes', JSON.stringify(newInboxes));

      setShowDeleteConfirm(false);
      showToast('success', 'Inbox Deleted', 'Inbox and all emails deleted');

      // Switch to another inbox or show create modal
      if (newInboxes.length > 0) {
        setActiveInbox(newInboxes[0].address);
        setTimeLeft(Math.floor((newInboxes[0].expiresAt - Date.now()) / 1000));
        fetchQRCode(newInboxes[0].address);
      } else {
        setActiveInbox('');
        setShowNewInboxModal(true);
      }
    } catch (error) {
      console.error('Failed to delete inbox:', error);
      showToast('error', 'Error', 'Failed to delete inbox');
    }
  };

  // Restore email from trash
  const handleRestoreEmail = async (emailId: string) => {
    try {
      await fetch(`/api/emails?address=${encodeURIComponent(activeInbox)}&id=${emailId}&action=restore`, {
        method: 'PATCH',
      });

      setTrashedEmails(prev => prev.filter(e => e.id !== emailId));
      showToast('success', 'Restored', 'Email restored from trash');
      fetchEmails(false);
    } catch (error) {
      console.error('Failed to restore email:', error);
      showToast('error', 'Error', 'Failed to restore email');
    }
  };

  // Copy email to clipboard
  const handleCopy = async () => {
    const success = await copyToClipboard(activeInbox);
    if (success) {
      setCopied(true);
      showToast('success', 'Copied!', 'Email address copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // View email
  const handleViewEmail = async (emailItem: Email) => {
    try {
      const res = await fetch(`/api/emails?address=${encodeURIComponent(activeInbox)}&id=${emailItem.id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedEmail(data.email);
        setEmails(prev => prev.map(e => e.id === emailItem.id ? { ...e, read: true } : e));
        // Open modal if inbox is maximized
        if (inboxMaximized) {
          setShowEmailModal(true);
        }
      }
    } catch {
      setSelectedEmail(emailItem);
      if (inboxMaximized) {
        setShowEmailModal(true);
      }
    }
  };

  // Extend inbox (max 1 hour total)
  const handleExtendInbox = async () => {
    try {
      const res = await fetch(`/api/inbox?address=${encodeURIComponent(activeInbox)}&action=extend`, {
        method: 'PATCH',
      });
      const data = await res.json();

      if (data.success) {
        setTimeLeft(Math.floor((data.expiresAt - Date.now()) / 1000));
        showToast('success', 'Extended', data.message);

        // Update inbox in state
        setInboxes(prev => prev.map(i =>
          i.address === activeInbox
            ? { ...i, expiresAt: data.expiresAt }
            : i
        ));

        // Check if we can still extend
        const inboxRes = await fetch(`/api/inbox?address=${encodeURIComponent(activeInbox)}`);
        const inboxData = await inboxRes.json();
        if (inboxData.success) {
          setCanExtend(inboxData.canExtend);
        }
      } else {
        showToast('warning', 'Cannot Extend', data.error);
        setCanExtend(false);
      }
    } catch (error) {
      console.error('Failed to extend inbox:', error);
      showToast('error', 'Error', 'Failed to extend inbox');
    }
  };

  // Toggle notifications
  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        localStorage.setItem('tempmail_notifications', 'true');
        showToast('success', 'Notifications Enabled', 'You will be notified of new emails');
      }
    } else {
      setNotificationsEnabled(false);
      localStorage.setItem('tempmail_notifications', 'false');
    }
  };

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('tempmail_theme', newTheme);
  };

  // Filter emails
  const filteredEmails = (showTrash ? trashedEmails : emails).filter(email => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        email.subject.toLowerCase().includes(query) ||
        email.from.toLowerCase().includes(query) ||
        email.text.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    if (filter === 'unread' && email.read) return false;
    if (filter === 'read' && !email.read) return false;

    return true;
  });

  // Initialize
  useEffect(() => {
    // Load theme
    const savedTheme = localStorage.getItem('tempmail_theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    // Load notifications setting
    const savedNotifications = localStorage.getItem('tempmail_notifications');
    if (savedNotifications === 'true') {
      setNotificationsEnabled(true);
    }

    // Fetch available domains
    fetchDomains();

    // Load saved inboxes
    const savedInboxes = JSON.parse(localStorage.getItem('tempmail_inboxes') || '[]') as Inbox[];
    const validInboxes = savedInboxes.filter(inbox => inbox.expiresAt > Date.now());

    if (validInboxes.length > 0) {
      setInboxes(validInboxes);
      setActiveInbox(validInboxes[0].address);
      setTimeLeft(Math.floor((validInboxes[0].expiresAt - Date.now()) / 1000));
      fetchQRCode(validInboxes[0].address);
      localStorage.setItem('tempmail_inboxes', JSON.stringify(validInboxes));
    } else {
      // No saved inboxes - show welcome state (user clicks + to create)
      // Intentionally do nothing - let user initiate inbox creation
    }
  }, []);

  // Auto-refresh emails
  useEffect(() => {
    if (!activeInbox) return;

    fetchEmails(false);
    const interval = setInterval(() => fetchEmails(false), 10000);
    return () => clearInterval(interval);
  }, [activeInbox, fetchEmails]);

  // Timer countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Remove expired inbox
          setInboxes(current => {
            const remaining = current.filter(i => i.address !== activeInbox);
            localStorage.setItem('tempmail_inboxes', JSON.stringify(remaining));
            return remaining;
          });
          const validInboxes = inboxes.filter(i => i.address !== activeInbox && i.expiresAt > Date.now());

          if (validInboxes.length > 0) {
            setActiveInbox(validInboxes[0].address);
            return Math.floor((validInboxes[0].expiresAt - Date.now()) / 1000);
          } else {
            // Show new inbox modal instead of auto-generating
            setActiveInbox('');
            setShowNewInboxModal(true);
            return 0;
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeInbox, inboxes]);

  // Format time left
  const formatTimeLeft = () => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Download attachment
  const downloadAttachment = (attachment: Attachment) => {
    const link = document.createElement('a');
    link.href = `data:${attachment.contentType};base64,${attachment.content}`;
    link.download = attachment.filename;
    link.click();
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <main className="main">
      <div className="container">
        {/* Header */}
        <header className="header">
          <div className="logo">
            <div className="logoIcon">
              <Mail />
            </div>
            <span className="logoText">TempMail</span>
          </div>
          <div className="headerActions">
            {activeInbox ? (
              <div className={`timer ${timeLeft < 300 ? 'expiring' : ''}`}>
                <Clock />
                <span>{formatTimeLeft()}</span>
              </div>
            ) : (
              <div className="timer">
                <Clock />
                <span>No inbox</span>
              </div>
            )}
            <button
              className="btn btnIcon btnSecondary"
              onClick={toggleNotifications}
              title={notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
            >
              {notificationsEnabled ? <Bell /> : <BellOff />}
            </button>
            <button
              className="btn btnIcon btnSecondary"
              onClick={toggleTheme}
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
            <button
              className="btn btnIcon btnSecondary"
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <Settings />
            </button>
          </div>
        </header>

        {/* Stats Bar */}
        <div className="statsBar">
          <div className="statCard">
            <div className="statIcon primary">
              <Mail />
            </div>
            <div className="statInfo">
              <h3>{stats.totalReceived}</h3>
              <p>Total Received</p>
            </div>
          </div>
          <div className="statCard">
            <div className="statIcon success">
              <Eye />
            </div>
            <div className="statInfo">
              <h3>{stats.totalRead}</h3>
              <p>Read</p>
            </div>
          </div>
          <div className="statCard">
            <div className="statIcon warning">
              <EyeOff />
            </div>
            <div className="statInfo">
              <h3>{stats.unread}</h3>
              <p>Unread</p>
            </div>
          </div>
          <div className="statCard">
            <div className="statIcon info">
              <Archive />
            </div>
            <div className="statInfo">
              <h3>{stats.inTrash}</h3>
              <p>In Trash</p>
            </div>
          </div>
        </div>

        {/* Inbox Tabs */}
        <div className="inboxTabs">
          {inboxes.map(inbox => (
            <button
              key={inbox.address}
              className={`inboxTab ${activeInbox === inbox.address ? 'active' : ''}`}
              onClick={() => {
                setActiveInbox(inbox.address);
                setSelectedEmail(null);
                setTimeLeft(Math.floor((inbox.expiresAt - Date.now()) / 1000));
                fetchQRCode(inbox.address);
              }}
            >
              <Mail style={{ width: 14, height: 14 }} />
              <span>{truncate(inbox.address.split('@')[0], 10)}</span>
              <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>@{inbox.domain || inbox.address.split('@')[1]}</span>
              {inbox.isCustom && <span className="badge">Custom</span>}
            </button>
          ))}
          <button
            className="inboxTab addInboxTab"
            onClick={() => setShowNewInboxModal(true)}
            title="Add new inbox"
          >
            <Plus style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Email Generator Card */}
        <div className="emailCard">
          <div className="emailCardHeader">
            <div className="emailCardLeft">
              <div className="emailCardIcon">
                <Sparkles />
              </div>
              <div>
                <h1 className="emailCardTitle">Your Temporary Email</h1>
                <p className="emailCardSubtitle">Use this email to receive messages</p>
              </div>
            </div>
          </div>

          <div className="emailDisplayWrapper">
            <div className="emailDisplayMain">
              <div className="emailDisplay">
                <span className="emailAddress">{activeInbox || 'Click + to create your first inbox'}</span>
              </div>

              <div className="emailActions">
                <button
                  className={`btn ${copied ? 'btnSuccess' : 'btnSecondary'}`}
                  onClick={handleCopy}
                  disabled={!activeInbox}
                >
                  {copied ? <Check /> : <Copy />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  className="btn btnPrimary"
                  onClick={() => setShowNewInboxModal(true)}
                  disabled={loading}
                >
                  <Plus />
                  New Email
                </button>
                <button
                  className={`btn ${canExtend ? 'btnSecondary' : 'btnWarning'}`}
                  onClick={handleExtendInbox}
                  disabled={!canExtend}
                  title={canExtend ? 'Extend by 1 hour (max 1 hour total)' : 'Maximum extension reached'}
                >
                  <Timer />
                  {canExtend ? 'Extend' : 'Max Reached'}
                </button>
                <button
                  className="btn btnSecondary"
                  onClick={() => setShowSettings(true)}
                  title="Settings"
                >
                  <Settings />
                  Settings
                </button>
                <button
                  className="btn btnDanger"
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Delete this inbox"
                >
                  <Trash2 />
                  Delete
                </button>
              </div>
            </div>

            {qrCode && (
              <div className="qrCodeBox">
                <img src={qrCode} alt="QR Code" />
                <span>Scan to copy</span>
              </div>
            )}
          </div>
        </div>

        {/* Content Grid */}
        <div className={`contentGrid ${inboxMaximized ? 'inboxMaximized' : ''}`}>
          {/* Inbox Panel */}
          <div className="inboxPanel">
            <div className="inboxHeader">
              <div className="inboxTitle">
                <h2>{showTrash ? 'Trash' : 'Inbox'}</h2>
                <span className="inboxCount">{filteredEmails.length}</span>
              </div>
              <div className="inboxActions">
                <button
                  className={`btn btnIcon btnSmall ${showTrash ? 'btnWarning' : 'btnSecondary'}`}
                  onClick={() => {
                    setShowTrash(!showTrash);
                    setSelectedEmail(null);
                  }}
                  title={showTrash ? 'Show inbox' : 'Show trash'}
                >
                  {showTrash ? <InboxIcon /> : <Trash2 />}
                </button>
                <button
                  className={`btn btnIcon btnSmall btnSecondary ${refreshing ? 'refreshing' : ''}`}
                  onClick={() => fetchEmails()}
                  disabled={refreshing}
                  title="Refresh"
                >
                  <RefreshCw />
                </button>
                <button
                  className="btn btnIcon btnSmall btnSecondary"
                  onClick={() => setInboxMaximized(!inboxMaximized)}
                  title={inboxMaximized ? 'Minimize inbox' : 'Maximize inbox'}
                >
                  {inboxMaximized ? <Minimize2 /> : <Maximize2 />}
                </button>
              </div>
            </div>

            {/* Search Box */}
            <div className="searchBox">
              <div className="searchInput">
                <Search />
                <input
                  type="text"
                  placeholder="Search emails..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className="btn btnIcon btnSmall"
                    onClick={() => setSearchQuery('')}
                    style={{ padding: 4 }}
                  >
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                )}
              </div>
            </div>

            {/* Filter Tabs */}
            {!showTrash && (
              <div className="filterTabs">
                <button
                  className={`filterTab ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  All
                </button>
                <button
                  className={`filterTab ${filter === 'unread' ? 'active' : ''}`}
                  onClick={() => setFilter('unread')}
                >
                  Unread
                </button>
                <button
                  className={`filterTab ${filter === 'read' ? 'active' : ''}`}
                  onClick={() => setFilter('read')}
                >
                  Read
                </button>
              </div>
            )}

            <div className="inboxList">
              {filteredEmails.length === 0 ? (
                <div className="emptyState">
                  <div className="emptyIcon">
                    {showTrash ? <Trash2 /> : <InboxIcon />}
                  </div>
                  <h3 className="emptyTitle">
                    {showTrash ? 'Trash is empty' : 'No emails yet'}
                  </h3>
                  <p className="emptyText">
                    {showTrash
                      ? 'Deleted emails will appear here.'
                      : 'Emails sent to your temporary address will appear here automatically.'}
                  </p>
                </div>
              ) : (
                filteredEmails.map(emailItem => (
                  <div
                    key={emailItem.id}
                    className={`emailItem ${!emailItem.read ? 'unread' : ''} ${selectedEmail?.id === emailItem.id ? 'active' : ''}`}
                    onClick={() => handleViewEmail(emailItem)}
                  >
                    <div
                      className="emailAvatar"
                      style={{ backgroundColor: stringToColor(emailItem.from) }}
                    >
                      {getInitials(extractName(emailItem.from))}
                    </div>
                    <div className="emailItemContent">
                      <div className="emailItemHeader">
                        <span className="emailItemFrom">
                          {truncate(extractName(emailItem.from), 20)}
                        </span>
                        <span className="emailItemDate">
                          {formatDate(emailItem.date)}
                        </span>
                      </div>
                      <div className="emailItemSubject">
                        {emailItem.subject || '(No subject)'}
                      </div>
                      <div className="emailItemPreview">
                        {truncate(emailItem.text || '', 40)}
                      </div>
                      {emailItem.attachments && emailItem.attachments.length > 0 && (
                        <div className="emailItemMeta">
                          <span className="attachmentBadge">
                            <Paperclip />
                            {emailItem.attachments.length}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Email Viewer Panel */}
          <div className="viewerPanel">
            {selectedEmail ? (
              <>
                <div className="viewerHeader">
                  <div className="viewerMeta">
                    <div
                      className="viewerAvatar"
                      style={{ backgroundColor: stringToColor(selectedEmail.from) }}
                    >
                      {getInitials(extractName(selectedEmail.from))}
                    </div>
                    <div className="viewerInfo">
                      <h2 className="viewerSubject">
                        {selectedEmail.subject || '(No subject)'}
                      </h2>
                      <p className="viewerFrom">
                        From: <strong>{selectedEmail.from}</strong>
                      </p>
                      <p className="viewerDate">
                        {formatDate(selectedEmail.date)}
                      </p>
                    </div>
                    <div className="viewerActions">
                      {showTrash ? (
                        <>
                          <button
                            className="btn btnIcon btnSuccess"
                            onClick={() => handleRestoreEmail(selectedEmail.id)}
                            title="Restore"
                          >
                            <RotateCcw />
                          </button>
                          <button
                            className="btn btnIcon btnDanger"
                            onClick={() => handleDeleteEmail(selectedEmail.id, true)}
                            title="Delete permanently"
                          >
                            <Trash2 />
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn btnIcon btnDanger"
                          onClick={() => handleDeleteEmail(selectedEmail.id)}
                          title="Delete"
                        >
                          <Trash2 />
                        </button>
                      )}
                      <button
                        className="btn btnIcon btnSecondary"
                        onClick={() => setShowEmailModal(true)}
                        title="Open in floating window"
                      >
                        <Maximize2 />
                      </button>
                      <button
                        className="btn btnIcon btnSecondary"
                        onClick={() => setSelectedEmail(null)}
                        title="Close"
                      >
                        <X />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Attachments */}
                {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                  <div className="attachmentsSection">
                    <div className="attachmentsHeader">
                      <Paperclip />
                      <span>{selectedEmail.attachments.length} attachment(s)</span>
                    </div>
                    <div className="attachmentsList">
                      {selectedEmail.attachments.map((attachment, idx) => (
                        <button
                          key={idx}
                          className="attachmentItem"
                          onClick={() => downloadAttachment(attachment)}
                        >
                          <Download />
                          <span>{attachment.filename}</span>
                          <span className="attachmentSize">
                            {formatFileSize(attachment.size)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`viewerContent ${selectedEmail.html ? 'htmlMode' : ''}`}>
                  <EmailContent html={selectedEmail.html} text={selectedEmail.text} />
                </div>
              </>
            ) : (
              <div className="viewerEmpty">
                <div className="viewerEmptyIcon">
                  <MailOpen />
                </div>
                <h3 className="emptyTitle">Select an email to read</h3>
                <p className="emptyText">
                  Click on any email in your inbox to view its contents here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Email Modal */}
      {showEmailModal && selectedEmail && (
        <div className="modalOverlay" onClick={() => setShowEmailModal(false)}>
          <div className="modal emailModal" onClick={e => e.stopPropagation()}>
            <div className="viewerHeader">
              <div className="viewerMeta">
                <div
                  className="viewerAvatar"
                  style={{ backgroundColor: stringToColor(selectedEmail.from) }}
                >
                  {getInitials(extractName(selectedEmail.from))}
                </div>
                <div className="viewerInfo">
                  <h2 className="viewerSubject">
                    {selectedEmail.subject || '(No subject)'}
                  </h2>
                  <p className="viewerFrom">
                    From: <strong>{selectedEmail.from}</strong>
                  </p>
                  <p className="viewerDate">
                    {formatDate(selectedEmail.date)}
                  </p>
                </div>
                <div className="viewerActions">
                  {!showTrash && (
                    <button
                      className="btn btnIcon btnDanger"
                      onClick={() => {
                        handleDeleteEmail(selectedEmail.id);
                        setShowEmailModal(false);
                      }}
                      title="Delete"
                    >
                      <Trash2 />
                    </button>
                  )}
                  <button
                    className="btn btnIcon btnSecondary"
                    onClick={() => setShowEmailModal(false)}
                    title="Close"
                  >
                    <X />
                  </button>
                </div>
              </div>
            </div>

            {/* Attachments in Modal */}
            {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
              <div className="attachmentsSection">
                <div className="attachmentsHeader">
                  <Paperclip />
                  <span>{selectedEmail.attachments.length} attachment(s)</span>
                </div>
                <div className="attachmentsList">
                  {selectedEmail.attachments.map((attachment, idx) => (
                    <button
                      key={idx}
                      className="attachmentItem"
                      onClick={() => downloadAttachment(attachment)}
                    >
                      <Download />
                      <span>{attachment.filename}</span>
                      <span className="attachmentSize">
                        {formatFileSize(attachment.size)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={`viewerContent ${selectedEmail.html ? 'htmlMode' : ''}`}>
              <EmailContent html={selectedEmail.html} text={selectedEmail.text} />
            </div>
          </div>
        </div>
      )}

      {/* New Inbox Modal */}
      {showNewInboxModal && (
        <div className="modalOverlay" onClick={() => setShowNewInboxModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modalHeader">
              <h2 className="modalTitle">Create New Inbox</h2>
              <button
                className="btn btnIcon btnSecondary"
                onClick={() => setShowNewInboxModal(false)}
              >
                <X />
              </button>
            </div>
            <div className="modalBody">
              <div className="formGroup">
                <label className="formLabel">Select Domain</label>
                <div className="selectWrapper">
                  <select
                    className="formSelect"
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                  >
                    {availableDomains.map(domain => (
                      <option key={domain} value={domain}>{domain}</option>
                    ))}
                  </select>
                  <Globe className="selectIcon" />
                </div>
              </div>
              <div className="formGroup">
                <label className="formLabel">Custom Username (optional)</label>
                <div className="inputGroup">
                  <input
                    type="text"
                    placeholder="your-custom-name"
                    value={customUsername}
                    onChange={(e) => setCustomUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                  />
                  <span className="inputSuffix">@{selectedDomain}</span>
                </div>
                <p className="formHint">Leave empty for random address. Min 3 characters.</p>
              </div>
            </div>
            <div className="modalFooter">
              <button
                className="btn btnSecondary"
                onClick={() => setShowNewInboxModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btnPrimary"
                onClick={() => {
                  generateEmail(customUsername || undefined, selectedDomain);
                  setShowNewInboxModal(false);
                  setCustomUsername('');
                }}
                disabled={customUsername.length > 0 && customUsername.length < 3}
              >
                <Plus />
                Create Inbox
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="modalOverlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modalHeader">
              <h2 className="modalTitle">Delete Inbox?</h2>
              <button
                className="btn btnIcon btnSecondary"
                onClick={() => setShowDeleteConfirm(false)}
              >
                <X />
              </button>
            </div>
            <div className="modalBody">
              <p style={{ color: 'var(--text-secondary)' }}>
                Are you sure you want to delete <strong>{activeInbox}</strong>?
              </p>
              <p style={{ color: 'var(--danger)', marginTop: '12px', fontSize: '0.9rem' }}>
                This will permanently delete the inbox and all associated emails. This action cannot be undone.
              </p>
            </div>
            <div className="modalFooter">
              <button
                className="btn btnSecondary"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="btn btnDanger"
                onClick={handleDeleteInbox}
              >
                <Trash2 />
                Delete Inbox
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modalOverlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modalHeader">
              <h2 className="modalTitle">Settings</h2>
              <button
                className="btn btnIcon btnSecondary"
                onClick={() => setShowSettings(false)}
              >
                <X />
              </button>
            </div>
            <div className="modalBody">
              <div className="settingsSection">
                <h3 className="settingsTitle">
                  <Sun />
                  Appearance
                </h3>
                <div className="toggleSwitch">
                  <span className="toggleLabel">Dark Theme</span>
                  <div
                    className={`toggleControl ${theme === 'dark' ? 'active' : ''}`}
                    onClick={toggleTheme}
                  />
                </div>
              </div>

              <div className="settingsSection">
                <h3 className="settingsTitle">
                  <Bell />
                  Notifications
                </h3>
                <div className="toggleSwitch">
                  <span className="toggleLabel">Browser Notifications</span>
                  <div
                    className={`toggleControl ${notificationsEnabled ? 'active' : ''}`}
                    onClick={toggleNotifications}
                  />
                </div>
              </div>

              <div className="settingsSection">
                <h3 className="settingsTitle">
                  <Globe />
                  Available Domains
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  {availableDomains.map(domain => (
                    <span key={domain} className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                      {domain}
                    </span>
                  ))}
                </div>
              </div>

              <div className="settingsSection">
                <h3 className="settingsTitle">
                  <BarChart3 />
                  Statistics
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Total emails received: {stats.totalReceived}<br />
                  Emails read: {stats.totalRead}<br />
                  Currently unread: {stats.unread}<br />
                  In trash: {stats.inTrash}
                </p>
              </div>
            </div>
            <div className="modalFooter">
              <button
                className="btn btnSecondary"
                onClick={() => setShowSettings(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="toastContainer">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type} fadeIn`}>
            {toast.type === 'success' && <Check className="toastIcon" />}
            {toast.type === 'error' && <X className="toastIcon" />}
            {toast.type === 'info' && <Bell className="toastIcon" />}
            {toast.type === 'warning' && <Clock className="toastIcon" />}
            <div className="toastContent">
              <div className="toastTitle">{toast.title}</div>
              {toast.message && <div className="toastMessage">{toast.message}</div>}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
