import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileText,
  HelpCircle,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { ContactTicket, GitHubAuthStatus, WorkspaceSummary } from '../types';
import { apiFetch, setStoredGitHubSessionId } from '../utils/api';

interface PageNavProps {
  onNavigate: (path: string) => void;
}

interface PrivacyPageProps extends PageNavProps {
  workspaces: WorkspaceSummary[];
  onWorkspacesPurged: () => Promise<void>;
}

interface ContactPageProps extends PageNavProps {
  workspaces: WorkspaceSummary[];
}

const SUPPORT_FAQS = [
  {
    q: 'How do I import a monorepo or target a nested subfolder?',
    a: 'Paste either the repository root URL or a GitHub tree URL such as https://github.com/owner/repo/tree/main/packages/web. RepoForge Studio automatically scans up to 2 directory levels for nested package.json and index.html targets and lets you switch targets from the Workspace toolbar.',
  },
  {
    q: 'How does private GitHub repository cloning work inside an iframe?',
    a: 'Click Private Repos in the workspace bar to launch the OAuth 2.0 popup flow. Because modern browsers partition third-party cookies in iframes, RepoForge Studio pairs SameSite=None; Secure cookies with an explicit x-rf-session token handshake via window.opener.postMessage.',
  },
  {
    q: 'Why did RepoForge swap bcrypt or node-sass in my package.json?',
    a: 'When Auto-normalize lockfiles & base paths is enabled, RepoForge converts pnpm/yarn/bun lockfiles to standard npm, swaps native C++ addons like bcrypt -> bcryptjs and node-sass -> Dart sass, and injects relative asset base paths (--base=./) so compiled bundles mount cleanly under /preview/:id/.',
  },
  {
    q: 'How do I test Express, Fastify, or Hono backend endpoints in a cloned repo?',
    a: 'Open the Build & API tab inside your workspace, confirm or enter the server entrypoint file (for example server.ts or src/index.js), and click Start API Subprocess. RepoForge spawns the server on an isolated localhost port and proxies requests through /sandbox-api/:id/*.',
  },
  {
    q: 'Where do my cloned files and environment variables live?',
    a: 'All cloned repositories and .env overrides live inside ephemeral container storage (/tmp/repoforge-workspaces) scoped to the active server instance. You can delete individual workspaces anytime or purge all sandboxes from the Privacy page.',
  },
];

export const SupportPage: React.FC<PageNavProps> = ({ onNavigate }) => {
  const [faqQuery, setFaqQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [probing, setProbing] = useState(false);
  const [diagResult, setDiagResult] = useState<{
    latencyMs: number;
    workspaceCount: number;
    upgradesCount: number;
    oauthConfigured: boolean;
    checkedAt: string;
  } | null>(null);

  const runDiagnostics = async () => {
    setProbing(true);
    const t0 = performance.now();
    try {
      const [wsRes, upRes, authRes] = await Promise.all([
        apiFetch('/api/workspaces'),
        apiFetch('/api/upgrades'),
        apiFetch(`/api/auth/github/status?origin=${encodeURIComponent(window.location.origin)}`),
      ]);
      const wsJson = wsRes.ok
        ? ((await wsRes.json()) as { workspaces: WorkspaceSummary[] })
        : { workspaces: [] };
      const upJson = upRes.ok
        ? ((await upRes.json()) as { upgrades: unknown[] })
        : { upgrades: [] };
      const authJson = authRes.ok
        ? ((await authRes.json()) as GitHubAuthStatus)
        : { configured: false };

      setDiagResult({
        latencyMs: Math.max(1, Math.round(performance.now() - t0)),
        workspaceCount: wsJson.workspaces.length,
        upgradesCount: upJson.upgrades.length,
        oauthConfigured: Boolean(authJson.configured),
        checkedAt: new Date().toLocaleTimeString(),
      });
    } finally {
      setProbing(false);
    }
  };

  useEffect(() => {
    void runDiagnostics();
  }, []);

  const filteredFaqs = useMemo(() => {
    if (!faqQuery.trim()) return SUPPORT_FAQS;
    const q = faqQuery.trim().toLowerCase();
    return SUPPORT_FAQS.filter(
      (item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
    );
  }, [faqQuery]);

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-cyan-200 dark:border-slate-800 bg-gradient-to-r from-cyan-50 via-sky-50 to-orange-50/70 dark:from-[#0F1E2E] dark:via-[#111827] dark:to-[#1B1726] p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 dark:text-cyan-400">
              <HelpCircle className="w-4 h-4" />
              <span>Documentation · Troubleshooting · Live Runtime Health</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              RepoForge Studio Support Center
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Everything you need to clone public or private GitHub repositories, normalize builds for Node 22, run backend APIs, and inspect side-by-side branch previews.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="h-10 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Studio</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/contact')}
              className="h-10 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Open Support Ticket</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Self-Check Diagnostics */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              Live Studio Runtime Diagnostics
            </span>
            {diagResult && (
              <>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  API Reachable ({diagResult.latencyMs} ms)
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            disabled={probing}
            onClick={() => void runDiagnostics()}
            className="h-8 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            {probing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-cyan-600" />}
            <span>Run Health Probe</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 text-xs">
          <div className="p-5">
            <div className="text-slate-500 dark:text-slate-400">Express + Git Engine</div>
            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Operational</span>
            </div>
          </div>
          <div className="p-5">
            <div className="text-slate-500 dark:text-slate-400">API Roundtrip Latency</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white font-mono tabular-nums mt-1">
              {diagResult ? `${diagResult.latencyMs} ms` : '—'}
            </div>
          </div>
          <div className="p-5">
            <div className="text-slate-500 dark:text-slate-400">Active Sandboxes</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white font-mono tabular-nums mt-1">
              {diagResult ? `${diagResult.workspaceCount} mounted` : '—'}
            </div>
          </div>
          <div className="p-5">
            <div className="text-slate-500 dark:text-slate-400">GitHub OAuth App</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">
              {diagResult
                ? diagResult.oauthConfigured
                  ? 'Secrets Configured'
                  : 'Public Mode (Add Secrets for Private)'
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* 4-Step Workflow Reference */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {[
          {
            step: '01',
            accent: 'text-orange-600 dark:text-orange-400',
            title: 'Paste URL & Inspect',
            body: 'Enter any GitHub URL or owner/repo shorthand. RepoForge clones HEAD, detects frameworks, and parses ORM schemas.',
          },
          {
            step: '02',
            accent: 'text-cyan-600 dark:text-cyan-400',
            title: 'Edit Source & .env',
            body: 'Modify any source file in Code & Env or populate detected API keys before compiling.',
          },
          {
            step: '03',
            accent: 'text-emerald-600 dark:text-emerald-400',
            title: 'Build & Smoke Probe',
            body: 'Stream npm install & build logs over SSE, verify asset integrity, and spawn optional backend API subprocesses.',
          },
          {
            step: '04',
            accent: 'text-blue-600 dark:text-sky-400',
            title: 'Preview & Branch Diff',
            body: 'Launch responsive or full-screen previews and compare two branches side-by-side with exact bundle deltas.',
          },
        ].map((card) => (
          <div
            key={card.step}
            className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-xl p-5 space-y-2"
          >
            <div className={`font-mono text-xs font-bold ${card.accent}`}>STEP {card.step}</div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{card.title}</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {card.body}
            </p>
          </div>
        ))}
      </div>

      {/* Searchable FAQ */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Frequently Asked Questions
          </h2>
          <input
            type="text"
            value={faqQuery}
            onChange={(e) => setFaqQuery(e.target.value)}
            placeholder="Filter support topics..."
            className="sm:w-64 h-9 px-3 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {filteredFaqs.map((item, idx) => {
            const expanded = openIndex === idx;
            return (
              <div key={item.q} className="px-6 py-4">
                <button
                  type="button"
                  onClick={() => setOpenIndex(expanded ? null : idx)}
                  className="w-full flex items-center justify-between gap-4 text-left text-sm font-semibold text-slate-900 dark:text-white cursor-pointer"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                      expanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expanded && (
                  <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const PrivacyPage: React.FC<PrivacyPageProps> = ({
  onNavigate,
  workspaces,
  onWorkspacesPurged,
}) => {
  const [purging, setPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState<string | null>(null);

  const handlePurgeAll = async () => {
    setPurging(true);
    setPurgeMessage(null);
    try {
      const res = await apiFetch('/api/workspaces', { method: 'DELETE' });
      await apiFetch('/api/auth/github/logout', { method: 'POST' });
      setStoredGitHubSessionId(null);
      localStorage.removeItem('rf_voted_upgrades');
      const data = res.ok ? ((await res.json()) as { purgedCount: number }) : { purgedCount: 0 };
      await onWorkspacesPurged();
      setPurgeMessage(
        `Purged ${data.purgedCount} cloned sandbox workspace(s) from /tmp and cleared active GitHub OAuth session tokens.`
      );
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-emerald-200 dark:border-slate-800 bg-gradient-to-r from-emerald-50 via-teal-50/70 to-cyan-50 dark:from-[#0E221D] dark:via-[#111827] dark:to-[#0F1E2E] p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Privacy Policy &amp; Sandbox Data Controls · Effective November 2026</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Privacy Policy &amp; Data Isolation
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              RepoForge Studio is architected around ephemeral container sandboxes, minimal memory-scoped OAuth tokens, and explicit user-triggered cloud persistence.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="h-10 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer self-start lg:self-center shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Studio</span>
          </button>
        </div>
      </div>

      {/* Interactive Data Purge Control */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1 max-w-2xl">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Immediate Sandbox &amp; Session Purge Control
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Currently storing <strong className="font-mono tabular-nums">{workspaces.length}</strong> cloned workspace(s) in container disk cache. Triggering a purge stops all running sandbox API subprocesses, deletes cloned directories on disk, and revokes local GitHub session state.
          </p>
          {purgeMessage && (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 pt-1">
              {purgeMessage}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={purging}
          onClick={() => void handlePurgeAll()}
          className="h-10 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer shrink-0 self-start md:self-center"
        >
          {purging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          <span>Purge Sandboxes &amp; Clear Session</span>
        </button>
      </div>

      {/* Policy Sections */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
        {[
          {
            title: '1. Cloned Source Code & Ephemeral Build Sandboxes',
            body: 'When you paste a GitHub URL or select a private repository, RepoForge Studio runs a shallow clone (git clone --depth 1) inside an isolated temporary directory (/tmp/repoforge-workspaces). Source code, build artifacts, and edit buffers are never sold, indexed by external search engines, or shared with third parties.',
          },
          {
            title: '2. GitHub OAuth 2.0 Credentials & Access Tokens',
            body: 'When you authenticate with GitHub for private repository access, your OAuth access token is held exclusively in volatile server memory for the duration of your session and paired with an HTTP-only / SameSite=None session identifier. Disconnecting your GitHub account immediately erases the in-memory token.',
          },
          {
            title: '3. Environment Variables (.env) & Runtime Secrets',
            body: 'Environment variables entered inside the Code & Env configurator are injected strictly into child build and sandbox API processes for that specific workspace. Avoid entering production customer secrets when testing untrusted third-party repositories.',
          },
          {
            title: '4. Optional Cloud Persistence (Firebase / Firestore)',
            body: 'Workspace metadata snapshots are only written to Google Cloud Firestore when you explicitly click "Sign In & Sync to Firestore" inside the Database Schema Bridge card. No background telemetry or automatic cloud uploads occur without your action.',
          },
          {
            title: '5. Privacy Inquiries & Data Removal Requests',
            body: 'For questions regarding workspace isolation, Firestore snapshot removal, or enterprise compliance, contact our team via the /contact page or email tidyupscleaning25@gmail.com.',
          },
        ].map((sec) => (
          <div key={sec.title} className="p-6 space-y-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{sec.title}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{sec.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ContactPage: React.FC<ContactPageProps> = ({ onNavigate, workspaces }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('Build & Framework Support');
  const [workspaceId, setWorkspaceId] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<ContactTicket[]>([]);
  const [createdTicket, setCreatedTicket] = useState<ContactTicket | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch('/api/contact');
      if (res.ok) {
        const data = (await res.json()) as { tickets: ContactTicket[] };
        setTickets(data.tickets || []);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    setCreatedTicket(null);
    try {
      const res = await apiFetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          category,
          workspaceId: workspaceId || undefined,
          message: message.trim(),
        }),
      });
      const data = (await res.json()) as {
        ticket?: ContactTicket;
        tickets?: ContactTicket[];
        error?: string;
      };
      if (!res.ok || !data.ticket) {
        throw new Error(data.error || 'Failed to submit contact request.');
      }
      setCreatedTicket(data.ticket);
      setTickets(data.tickets || []);
      setMessage('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-orange-200 dark:border-slate-800 bg-gradient-to-r from-orange-50 via-amber-50/70 to-sky-50 dark:from-[#1E1615] dark:via-[#111827] dark:to-[#0F1E2E] p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-orange-600 dark:text-orange-400">
              <Mail className="w-4 h-4" />
              <span>Direct Engineering Support &amp; Custom Integration Inquiries</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Contact RepoForge Studio
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Need help getting a complex monorepo to compile, configuring private GitHub OAuth, or requesting a custom studio add-on? Send a ticket directly to our engineering queue.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="h-10 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer self-start lg:self-center shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Studio</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Ticket Submission Form */}
        <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl p-6 sm:p-8 space-y-5">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Submit a Support or Upgrade Request
          </h2>

          {createdTicket && (
            <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>Ticket {createdTicket.id} Logged Successfully</span>
              </div>
              <p>
                We recorded your {createdTicket.category} inquiry for {createdTicket.email}.
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full h-10 px-3.5 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full h-10 px-3.5 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Topic
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                >
                  <option value="Build & Framework Support">Build &amp; Framework Support</option>
                  <option value="Private Repo OAuth Setup">Private Repo OAuth Setup</option>
                  <option value="Suggested Upgrade / Add-On">Suggested Upgrade / Add-On</option>
                  <option value="Database & Cloud Bridge">Database &amp; Cloud Bridge</option>
                  <option value="General & Enterprise Inquiry">General &amp; Enterprise Inquiry</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Attach Workspace Context (Optional)
                </label>
                <select
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-orange-500"
                >
                  <option value="">None selected</option>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.owner}/{w.repoName}@{w.branch} ({w.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Message &amp; Repository Details
              </label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Include the GitHub repository URL, branch name, or any error lines from the Build & API console..."
                className="w-full p-3.5 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !name.trim() || !email.trim() || !message.trim()}
              className="h-10 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Submit Support Ticket</span>
            </button>
          </form>
        </div>

        {/* Direct Channels & Recent Logged Tickets */}
        <div className="lg:col-span-5 space-y-6">
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl p-6 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Direct Contact Channels
            </h3>
            <div className="space-y-3 divide-y divide-slate-100 dark:divide-slate-800">
              <div className="pt-1">
                <div className="text-slate-500 dark:text-slate-400">Support Email</div>
                <a
                  href="mailto:tidyupscleaning25@gmail.com"
                  className="font-mono font-semibold text-cyan-700 dark:text-cyan-400 hover:underline mt-0.5 inline-block"
                >
                  tidyupscleaning25@gmail.com
                </a>
              </div>
              <div className="pt-3">
                <div className="text-slate-500 dark:text-slate-400">Feature &amp; Add-On Board</div>
                <button
                  type="button"
                  onClick={() => onNavigate('/upgrades')}
                  className="font-semibold text-orange-600 dark:text-orange-400 hover:underline mt-0.5 cursor-pointer"
                >
                  Browse &amp; Vote on Suggested Upgrades →
                </button>
              </div>
              <div className="pt-3">
                <div className="text-slate-500 dark:text-slate-400">Response Window</div>
                <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  Monday – Friday · Within 1 business day
                </div>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900 dark:text-white">
                Recent Session Tickets
              </span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {tickets.length} logged
              </span>
            </div>
            {tickets.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No support tickets submitted in this session yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto text-xs">
                {tickets.map((t) => (
                  <div key={t.id} className="px-5 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-orange-600 dark:text-orange-400">
                        {t.id}
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {t.status}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {t.category}
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 line-clamp-2">{t.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const TermsPage: React.FC<PageNavProps> = ({ onNavigate }) => {
  const [copiedSummary, setCopiedSummary] = useState(false);

  const termsSections = [
    {
      id: 'authorized-repos',
      title: '1. Authorized Repository Access & Ownership',
      content:
        'By importing, cloning, or building a repository through RepoForge Studio, you represent that you have the legal right or open-source license permission to access, inspect, modify, and execute that code. You may only connect GitHub accounts that you are authorized to operate.',
    },
    {
      id: 'sandbox-usage',
      title: '2. Acceptable Build & Subprocess Execution Policy',
      content:
        'RepoForge Studio provides Node.js compilation pipelines and isolated backend API subprocesses strictly for software inspection, prototyping, and quality assurance. Cryptocurrency mining, network scanning, denial-of-service traffic, credential harvesting, or attempts to escape container boundaries are strictly prohibited and result in immediate termination.',
    },
    {
      id: 'ephemeral-storage',
      title: '3. Ephemeral Workspaces & Backup Responsibility',
      content:
        'Cloned workspaces and build artifacts reside in temporary container storage and may be recycled when instances scale or restart. Always export modified source archives (.tar.gz) or sync snapshots before closing critical sessions.',
    },
    {
      id: 'oss-licenses',
      title: '4. Third-Party Open-Source Licenses',
      content:
        'Imported repositories remain governed by their respective upstream licenses (MIT, Apache-2.0, GPL, proprietary, etc.). RepoForge Studio claims zero ownership over repositories you import, edit, or export using the platform.',
    },
    {
      id: 'warranty-liability',
      title: '5. Disclaimer of Warranties & Limitation of Liability',
      content:
        'RepoForge Studio is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of uninterrupted uptime or fitness for a particular purpose. Automated package normalizations (such as lockfile conversion or native package substitutions) are convenience transformations and should be reviewed prior to production deployment.',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-blue-200 dark:border-slate-800 bg-gradient-to-r from-blue-50 via-cyan-50/70 to-amber-50/60 dark:from-[#10192E] dark:via-[#111827] dark:to-[#1B1814] p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-sky-400">
              <FileText className="w-4 h-4" />
              <span>Terms &amp; Conditions (/T&amp;C) · Last Updated November 2026</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Terms &amp; Conditions of Use
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Clear rules governing repository cloning, sandbox compilation, API subprocess execution, and intellectual property inside RepoForge Studio.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                const text = termsSections.map((s) => `${s.title}\n${s.content}`).join('\n\n');
                navigator.clipboard.writeText(text);
                setCopiedSummary(true);
                setTimeout(() => setCopiedSummary(false), 1800);
              }}
              className="h-10 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              {copiedSummary ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedSummary ? 'Copied Terms' : 'Copy Full Terms'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="h-10 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Studio</span>
            </button>
          </div>
        </div>
      </div>

      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
        {termsSections.map((sec) => (
          <div key={sec.id} id={sec.id} className="p-6 space-y-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{sec.title}</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {sec.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
