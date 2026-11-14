import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Code2,
  Hammer,
  Minimize2,
  Play,
  RotateCcw,
} from 'lucide-react';
import type {
  ApiServerState,
  BuildOptions,
  BuildStatus,
  EnvVarItem,
  GitHubAuthStatus,
  RuntimePreviewEvent,
  SmokeProbeReport,
  WorkspaceDetail,
  WorkspaceSummary,
} from './types';
import { apiFetch, setStoredGitHubSessionId } from './utils/api';
import { BrandLogo } from './components/BrandLogo';
import { BrandLogoModal } from './components/BrandLogoModal';
import { RepoCommandBar } from './components/RepoCommandBar';
import { GitHubRepoDrawer } from './components/GitHubRepoDrawer';
import { OverviewPanel } from './components/OverviewPanel';
import { ProjectDocsWorkflowsPanel } from './components/ProjectDocsWorkflowsPanel';
import { CodeConfigPanel } from './components/CodeConfigPanel';
import { BuildConsolePanel } from './components/BuildConsolePanel';
import { LivePreviewPanel } from './components/LivePreviewPanel';
import { BranchDiffPanel } from './components/BranchDiffPanel';
import { SuggestedUpgradesView } from './components/SuggestedUpgradesView';
import {
  ContactPage,
  PrivacyPage,
  SupportPage,
  TermsPage,
} from './components/LegalAndSupportPages';

type NavTab = 'overview' | 'docs' | 'code' | 'build' | 'preview' | 'diff';
type RouteView = 'studio' | 'upgrades' | 'support' | 'privacy' | 'contact' | 'terms';

function resolveRouteFromPathname(pathname: string): RouteView {
  let clean = pathname;
  try {
    clean = decodeURIComponent(pathname);
  } catch {
    clean = pathname;
  }
  const lower = clean.replace(/\/+$/, '').toLowerCase();
  if (lower === '/upgrades' || lower === '/updates' || lower === '/addons') return 'upgrades';
  if (lower === '/support') return 'support';
  if (lower === '/privacy') return 'privacy';
  if (lower === '/contact') return 'contact';
  if (lower === '/t&c' || lower === '/terms') return 'terms';
  return 'studio';
}

export default function App() {
  const [routeView, setRouteView] = useState<RouteView>(() =>
    resolveRouteFromPathname(window.location.pathname)
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('rf_theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [repoInput, setRepoInput] = useState('https://github.com/gabrielecirulli/2048');
  const [branchInput, setBranchInput] = useState('');

  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceDetail | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [apiLogs, setApiLogs] = useState<string[]>([]);
  const [runtimeEvents, setRuntimeEvents] = useState<RuntimePreviewEvent[]>([]);

  // GitHub OAuth & Private Repo Drawer State
  const [githubAuth, setGithubAuth] = useState<GitHubAuthStatus | null>(null);
  const [githubDrawerOpen, setGithubDrawerOpen] = useState(false);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [editorTargetFile, setEditorTargetFile] = useState<string | null>(null);
  const [fullScreenApp, setFullScreenApp] = useState(false);
  const [fullScreenReloadKey, setFullScreenReloadKey] = useState(0);
  const [logoModalOpen, setLogoModalOpen] = useState(false);

  const [buildOptions, setBuildOptions] = useState<BuildOptions>({
    autoNormalize: true,
    cleanInstall: false,
  });

  const bootCheckedRef = useRef(false);

  // Sync theme class onto <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('rf_theme', theme);
    } catch {
      // Ignore storage restrictions
    }
  }, [theme]);

  // Browser back/forward routing listener
  useEffect(() => {
    const onPopState = () => {
      setRouteView(resolveRouteFromPathname(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = useCallback((path: string, targetTab?: NavTab) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setRouteView(resolveRouteFromPathname(path));
    if (targetTab) {
      setActiveTab(targetTab);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const refreshGitHubAuth = useCallback(async () => {
    try {
      const res = await apiFetch(
        `/api/auth/github/status?origin=${encodeURIComponent(window.location.origin)}`
      );
      if (res.ok) {
        const data = (await res.json()) as GitHubAuthStatus;
        setGithubAuth(data);
      }
    } catch {
      // Ignore network hiccup
    }
  }, []);

  const refreshWorkspacesList = useCallback(async () => {
    try {
      const res = await apiFetch('/api/workspaces');
      if (res.ok) {
        const data = (await res.json()) as { workspaces: WorkspaceSummary[] };
        setWorkspaces(data.workspaces);
        return data.workspaces;
      }
    } catch {
      // Ignore
    }
    return [];
  }, []);

  const loadWorkspaceDetail = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/workspaces/${id}`);
      if (res.ok) {
        const data = (await res.json()) as { workspace: WorkspaceDetail };
        setActiveWorkspace(data.workspace);
        setLogs(data.workspace.logs || []);
        setApiLogs(data.workspace.apiServer?.logs || []);
        return data.workspace;
      }
    } catch {
      // Ignore
    }
    return null;
  }, []);

  const handleImport = useCallback(
    async (autoBuild: boolean, overrideUrl?: string, overrideBranch?: string) => {
      const targetUrl = (overrideUrl ?? repoInput).trim();
      if (!targetUrl) return;

      setIsImporting(true);
      setErrorBanner(null);
      setRuntimeEvents([]);

      try {
        const res = await apiFetch('/api/workspaces/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: targetUrl,
            branch: (overrideBranch ?? branchInput).trim() || undefined,
            autoBuild,
            autoNormalize: buildOptions.autoNormalize,
          }),
        });

        const payload = (await res.json()) as { workspace?: WorkspaceDetail; error?: string };
        if (!res.ok || !payload.workspace) {
          throw new Error(payload.error || 'Failed to clone repository.');
        }

        setActiveWorkspace(payload.workspace);
        setLogs(payload.workspace.logs || []);
        setApiLogs(payload.workspace.apiServer?.logs || []);
        setEditorTargetFile(null);
        await refreshWorkspacesList();

        if (autoBuild) {
          setActiveTab('build');
        } else {
          setActiveTab('overview');
        }
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Repository import failed.');
      } finally {
        setIsImporting(false);
      }
    },
    [repoInput, branchInput, buildOptions.autoNormalize, refreshWorkspacesList]
  );

  // Initial bootstrap
  useEffect(() => {
    if (bootCheckedRef.current) return;
    bootCheckedRef.current = true;

    void refreshGitHubAuth();

    void (async () => {
      const existing = await refreshWorkspacesList();
      if (existing.length > 0) {
        await loadWorkspaceDetail(existing[0].id);
      } else {
        await handleImport(true, 'https://github.com/gabrielecirulli/2048');
      }
    })();
  }, [refreshGitHubAuth, refreshWorkspacesList, loadWorkspaceDetail, handleImport]);

  // Listen for OAuth popup postMessage AND preview iframe console events
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const origin = e.origin || '';
      const data = e.data as {
        type?: string;
        sessionId?: string;
        source?: string;
        workspaceId?: string;
        level?: 'log' | 'warn' | 'error';
        message?: string;
      };

      if (
        data?.type === 'OAUTH_AUTH_SUCCESS' &&
        (origin.endsWith('.run.app') || origin.includes('localhost'))
      ) {
        if (data.sessionId) {
          setStoredGitHubSessionId(data.sessionId);
        }
        setOauthNotice(null);
        void refreshGitHubAuth();
        return;
      }

      if (
        data &&
        data.source === 'repoforge-preview' &&
        data.workspaceId === activeWorkspace?.id &&
        data.message
      ) {
        setRuntimeEvents((prev) => [
          ...prev.slice(-99),
          {
            id: `${Date.now()}-${Math.random()}`,
            level: data.level || 'error',
            message: String(data.message),
            timestamp: new Date().toISOString().slice(11, 19),
          },
        ]);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [activeWorkspace?.id, refreshGitHubAuth]);

  const handleConnectGitHub = async () => {
    setOauthNotice(null);
    try {
      const res = await apiFetch(
        `/api/auth/github/url?origin=${encodeURIComponent(window.location.origin)}`
      );
      const payload = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !payload.url) {
        setOauthNotice(
          payload.error ||
            'Configure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in AI Studio Secrets first.'
        );
        return;
      }
      const popup = window.open(payload.url, 'github_oauth_popup', 'width=600,height=700');
      if (!popup) {
        setOauthNotice(
          'Browser blocked the OAuth popup. Allow popups for this site and click Connect again.'
        );
      }
    } catch {
      setOauthNotice('Unable to initiate GitHub OAuth flow.');
    }
  };

  const handleDisconnectGitHub = async () => {
    await apiFetch('/api/auth/github/logout', { method: 'POST' });
    setStoredGitHubSessionId(null);
    await refreshGitHubAuth();
  };

  // Subscribe to Server-Sent Events (SSE) for real-time build & API server logs
  useEffect(() => {
    if (!activeWorkspace?.id) return;
    const wsId = activeWorkspace.id;
    const source = new EventSource(`/api/workspaces/${wsId}/logs`);

    source.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          type: 'init' | 'log' | 'api-log' | 'status';
          logs?: string[];
          line?: string;
          status?: BuildStatus;
          smokeProbe?: SmokeProbeReport;
          apiServer?: ApiServerState;
        };

        if (msg.type === 'init') {
          if (Array.isArray(msg.logs)) setLogs(msg.logs);
          if (msg.apiServer?.logs) setApiLogs(msg.apiServer.logs);
        } else if (msg.type === 'log' && msg.line) {
          setLogs((prev) => [...prev.slice(-1499), msg.line!]);
        } else if (msg.type === 'api-log' && msg.line) {
          setApiLogs((prev) => [...prev.slice(-599), msg.line!]);
          if (msg.apiServer) {
            setActiveWorkspace((prev) =>
              prev && prev.id === wsId ? { ...prev, apiServer: msg.apiServer! } : prev
            );
          }
        } else if (msg.type === 'status' && msg.status) {
          if (msg.status === 'succeeded' || msg.status === 'failed') {
            void loadWorkspaceDetail(wsId);
            void refreshWorkspacesList();
          } else {
            setActiveWorkspace((prev) =>
              prev && prev.id === wsId
                ? {
                    ...prev,
                    status: msg.status!,
                    apiServer: msg.apiServer ?? prev.apiServer,
                    smokeProbe: msg.smokeProbe ?? prev.smokeProbe,
                  }
                : prev
            );
          }
        }
      } catch {
        // Ignore malformed SSE payload
      }
    };

    return () => {
      source.close();
    };
  }, [activeWorkspace?.id, loadWorkspaceDetail, refreshWorkspacesList]);

  const handleTriggerBuild = async (forceClean?: boolean) => {
    if (!activeWorkspace) return;
    setErrorBanner(null);
    setRuntimeEvents([]);
    navigateTo('/', 'build');

    try {
      const res = await apiFetch(`/api/workspaces/${activeWorkspace.id}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoNormalize: buildOptions.autoNormalize,
          cleanInstall: forceClean ?? buildOptions.cleanInstall,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { workspace: WorkspaceDetail };
        setActiveWorkspace(data.workspace);
        await refreshWorkspacesList();
      } else {
        const err = (await res.json()) as { error?: string };
        setErrorBanner(err.error || 'Unable to start build.');
      }
    } catch {
      setErrorBanner('Network error while starting build.');
    }
  };

  const handleSwitchSubProject = async (subPath: string) => {
    if (!activeWorkspace) return;
    setErrorBanner(null);
    try {
      const res = await apiFetch(`/api/workspaces/${activeWorkspace.id}/target`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSubPath: subPath }),
      });
      if (res.ok) {
        const data = (await res.json()) as { workspace: WorkspaceDetail };
        setActiveWorkspace(data.workspace);
        setApiLogs([]);
        await refreshWorkspacesList();
      }
    } catch {
      setErrorBanner('Failed to switch target sub-project.');
    }
  };

  const handleSaveEnvVars = async (envVars: EnvVarItem[]) => {
    if (!activeWorkspace) return;
    const res = await apiFetch(`/api/workspaces/${activeWorkspace.id}/env`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envVars }),
    });
    if (res.ok) {
      const data = (await res.json()) as { workspace: WorkspaceDetail };
      setActiveWorkspace(data.workspace);
    }
  };

  const handleDeleteWorkspace = async (id: string) => {
    await apiFetch(`/api/workspaces/${id}`, { method: 'DELETE' });
    const updated = await refreshWorkspacesList();
    if (activeWorkspace?.id === id) {
      setFullScreenApp(false);
      if (updated.length > 0) {
        await loadWorkspaceDetail(updated[0].id);
      } else {
        setActiveWorkspace(null);
        setLogs([]);
        setApiLogs([]);
      }
    }
  };

  const isBuilding = activeWorkspace?.status === 'building';
  const canLaunchPreview =
    activeWorkspace?.status === 'succeeded' && Boolean(activeWorkspace.previewUrl);

  // Full-Screen Mounted App Runner Mode
  if (fullScreenApp && activeWorkspace && activeWorkspace.previewUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <iframe
          key={`full-${activeWorkspace.id}-${fullScreenReloadKey}`}
          src={`${activeWorkspace.previewUrl}?_fs=${fullScreenReloadKey}`}
          title={`${activeWorkspace.owner}/${activeWorkspace.repoName}`}
          className="w-full h-full border-0 flex-1"
        />

        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/95 dark:bg-[#0B0F17]/95 border border-slate-200 dark:border-slate-700 shadow-xl text-xs text-slate-800 dark:text-slate-200">
          <span className="font-mono font-semibold text-slate-900 dark:text-slate-300 mr-1 max-w-44 truncate">
            {activeWorkspace.owner}/{activeWorkspace.repoName}
          </span>
          <button
            type="button"
            onClick={() => setFullScreenReloadKey((k) => k + 1)}
            title="Reload application"
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setFullScreenApp(false);
              navigateTo('/', 'code');
            }}
            title="Edit source code"
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setFullScreenApp(false)}
            className="px-2.5 py-1 rounded-md bg-orange-500 hover:bg-orange-600 text-white font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>Studio Inspector</span>
          </button>
        </div>
      </div>
    );
  }

  const studioTabs: Array<{ id: NavTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'docs', label: 'README & Workflows' },
    { id: 'code', label: 'Code & Env' },
    { id: 'build', label: 'Build & API' },
    { id: 'preview', label: 'Live Preview' },
    { id: 'diff', label: 'Branch Diff' },
  ];

  const topNavLinks: Array<{
    key: string;
    label: string;
    href: string;
    isActive: boolean;
    onSelect: () => void;
  }> = [
    {
      key: 'workspace',
      label: 'Workspace',
      href: '/',
      isActive: routeView === 'studio' && activeTab !== 'diff',
      onSelect: () => navigateTo('/', activeTab === 'diff' ? 'overview' : activeTab),
    },
    {
      key: 'diff',
      label: 'Branch Diff',
      href: '/',
      isActive: routeView === 'studio' && activeTab === 'diff',
      onSelect: () => navigateTo('/', 'diff'),
    },
    {
      key: 'upgrades',
      label: 'Suggested Upgrades',
      href: '/upgrades',
      isActive: routeView === 'upgrades',
      onSelect: () => navigateTo('/upgrades'),
    },
    {
      key: 'support',
      label: 'Support',
      href: '/support',
      isActive: routeView === 'support',
      onSelect: () => navigateTo('/support'),
    },
    {
      key: 'contact',
      label: 'Contact',
      href: '/contact',
      isActive: routeView === 'contact',
      onSelect: () => navigateTo('/contact'),
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Vibrant Top Accent Hairline */}
      <div className="h-1 w-full bg-gradient-to-r from-orange-500 via-amber-400 to-cyan-500 shrink-0" />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 h-15 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B0F17]/95 backdrop-blur-xs sticky top-0 z-30">
        {/* Zone 1: Custom Brand Logo */}
        <BrandLogo
          onClick={(e) => {
            e.preventDefault();
            navigateTo('/', 'overview');
          }}
        />

        {/* Zone 2: 5 Clean Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-semibold">
          {topNavLinks.map((link) => (
            <a
              key={link.key}
              href={link.href}
              onClick={(e) => {
                e.preventDefault();
                link.onSelect();
              }}
              className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                link.isActive
                  ? 'border-orange-500 text-orange-600 dark:text-white'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center shrink-0">
          {canLaunchPreview ? (
            <button
              type="button"
              onClick={() => setFullScreenApp(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Launch Full App</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!activeWorkspace || isBuilding || isImporting}
              onClick={() => void handleTriggerBuild(false)}
              className="px-4 py-2 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Hammer className="w-3.5 h-3.5" />
              <span>{isBuilding ? 'Building...' : 'Build Project'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Navigation */}
      <div className="md:hidden flex items-center gap-4 px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E131F] overflow-x-auto text-xs font-semibold">
        {topNavLinks.map((link) => (
          <a
            key={link.key}
            href={link.href}
            onClick={(e) => {
              e.preventDefault();
              link.onSelect();
            }}
            className={`whitespace-nowrap shrink-0 cursor-pointer ${
              link.isActive
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* Studio Workspace Command Bar (shown on Studio route) */}
      {routeView === 'studio' && (
        <>
          <RepoCommandBar
            repoInput={repoInput}
            onRepoInputChange={setRepoInput}
            branchInput={branchInput}
            onBranchInputChange={setBranchInput}
            isImporting={isImporting}
            isBuilding={Boolean(isBuilding)}
            onImport={(autoBuild, overrideUrl, overrideBranch) =>
              void handleImport(autoBuild, overrideUrl, overrideBranch)
            }
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            onSelectWorkspace={(id) => {
              setErrorBanner(null);
              setRuntimeEvents([]);
              void loadWorkspaceDetail(id);
            }}
            onDeleteWorkspace={(id) => void handleDeleteWorkspace(id)}
            onSwitchSubProject={(sp) => void handleSwitchSubProject(sp)}
            githubAuth={githubAuth}
            githubDrawerOpen={githubDrawerOpen}
            onToggleGithubDrawer={() => setGithubDrawerOpen((v) => !v)}
            theme={theme}
            onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            onOpenUpgrades={() => navigateTo('/upgrades')}
            onOpenLogoModal={() => setLogoModalOpen(true)}
          />

          {githubDrawerOpen && (
            <GitHubRepoDrawer
              authStatus={githubAuth}
              onConnectClick={() => void handleConnectGitHub()}
              onDisconnectClick={() => void handleDisconnectGitHub()}
              onSelectRepoAndClone={(url, branch, autoBuild) => {
                setRepoInput(url);
                if (branch) setBranchInput(branch);
                void handleImport(Boolean(autoBuild), url, branch);
              }}
              onClose={() => setGithubDrawerOpen(false)}
              oauthNotice={oauthNotice}
            />
          )}

          {/* Studio Sub-View Switcher */}
          <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17]">
            <div className="max-w-[1440px] mx-auto px-6 flex items-center gap-6 overflow-x-auto text-xs font-semibold">
              {studioTabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-3 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'border-cyan-500 text-cyan-700 dark:text-cyan-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Main Content Canvas */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8">
        {routeView === 'upgrades' ? (
          <SuggestedUpgradesView onNavigate={(p) => navigateTo(p)} />
        ) : routeView === 'support' ? (
          <SupportPage onNavigate={(p) => navigateTo(p)} />
        ) : routeView === 'privacy' ? (
          <PrivacyPage
            onNavigate={(p) => navigateTo(p)}
            workspaces={workspaces}
            onWorkspacesPurged={async () => {
              await refreshWorkspacesList();
              await refreshGitHubAuth();
              setActiveWorkspace(null);
              setLogs([]);
              setApiLogs([]);
            }}
          />
        ) : routeView === 'contact' ? (
          <ContactPage onNavigate={(p) => navigateTo(p)} workspaces={workspaces} />
        ) : routeView === 'terms' ? (
          <TermsPage onNavigate={(p) => navigateTo(p)} />
        ) : (
          <>
            {errorBanner && (
              <div className="mb-6 p-4 rounded-xl border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 flex items-start justify-between gap-4 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Operation Failed</div>
                    <p className="mt-0.5">{errorBanner}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorBanner(null)}
                  className="text-rose-700 dark:text-rose-300 hover:underline shrink-0 cursor-pointer font-semibold"
                >
                  Dismiss
                </button>
              </div>
            )}

            {activeTab === 'diff' ? (
              <BranchDiffPanel
                workspaces={workspaces}
                activeWorkspace={activeWorkspace}
                onWorkspacesCreated={async () => {
                  await refreshWorkspacesList();
                }}
              />
            ) : !activeWorkspace ? (
              <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl p-12 text-center max-w-2xl mx-auto my-8 space-y-4 shadow-2xs">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {isImporting
                    ? 'Cloning & Indexing GitHub Repository...'
                    : 'Paste Any GitHub Repository Above to Start'}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {isImporting
                    ? 'Running git clone --depth 1 on the backend, analyzing package manifests, and preparing the workspace.'
                    : 'Enter a public or private GitHub URL to inspect its source tree, edit files, compile production bundles, test backend APIs, compare branches, and run the live application.'}
                </p>
              </div>
            ) : (
              <>
                {activeTab === 'overview' && (
                  <OverviewPanel
                    workspace={activeWorkspace}
                    isBuilding={Boolean(isBuilding)}
                    onTriggerBuild={(clean) => void handleTriggerBuild(clean)}
                    onOpenPreview={() => setActiveTab('preview')}
                    onMountFullApp={() => setFullScreenApp(true)}
                    onOpenFileInEditor={(filePath) => {
                      setEditorTargetFile(filePath);
                      setActiveTab('code');
                    }}
                    onSwitchSubProject={(sp) => void handleSwitchSubProject(sp)}
                    onRefreshWorkspace={async () => {
                      await loadWorkspaceDetail(activeWorkspace.id);
                    }}
                    onOpenDocsWorkflows={() => setActiveTab('docs')}
                  />
                )}

                {activeTab === 'docs' && (
                  <ProjectDocsWorkflowsPanel
                    workspace={activeWorkspace}
                    onRefreshWorkspace={async () => {
                      await loadWorkspaceDetail(activeWorkspace.id);
                      await refreshWorkspacesList();
                    }}
                  />
                )}

                {activeTab === 'code' && (
                  <CodeConfigPanel
                    workspace={activeWorkspace}
                    initialFilePath={editorTargetFile}
                    isBuilding={Boolean(isBuilding)}
                    onSaveEnvVars={handleSaveEnvVars}
                    onTriggerBuild={() => void handleTriggerBuild(false)}
                  />
                )}

                {activeTab === 'build' && (
                  <BuildConsolePanel
                    workspace={activeWorkspace}
                    logs={logs}
                    apiLogs={apiLogs}
                    buildOptions={buildOptions}
                    onChangeBuildOptions={setBuildOptions}
                    onTriggerBuild={() => void handleTriggerBuild(false)}
                    onOpenPreview={() => setActiveTab('preview')}
                    onMountFullApp={() => setFullScreenApp(true)}
                    onRefreshWorkspace={async () => {
                      await loadWorkspaceDetail(activeWorkspace.id);
                      await refreshWorkspacesList();
                    }}
                  />
                )}

                {activeTab === 'preview' && (
                  <LivePreviewPanel
                    workspace={activeWorkspace}
                    isBuilding={Boolean(isBuilding)}
                    runtimeEvents={runtimeEvents}
                    onClearRuntimeEvents={() => setRuntimeEvents([])}
                    onTriggerBuild={() => void handleTriggerBuild(false)}
                    onMountFullApp={() => setFullScreenApp(true)}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Global Site Footer with Direct Route Links */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] px-6 py-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLogo
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/', 'overview');
              }}
            />
            <span className="hidden sm:inline text-slate-300 dark:text-slate-700">·</span>
            <span className="hidden sm:inline">
              GitHub Repository Inspector, Compiler &amp; Branch Diff Runner
            </span>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-5 font-semibold">
            <button
              type="button"
              onClick={() => setLogoModalOpen(true)}
              className="text-cyan-700 dark:text-cyan-400 hover:underline whitespace-nowrap cursor-pointer"
            >
              Download Logo
            </button>
            <a
              href="/upgrades"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/upgrades');
              }}
              className="text-orange-600 dark:text-orange-400 hover:underline whitespace-nowrap"
            >
              Suggested Upgrades &amp; Add-Ons
            </a>
            <a
              href="/support"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/support');
              }}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
            >
              Support
            </a>
            <a
              href="/privacy"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/privacy');
              }}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
            >
              Privacy
            </a>
            <a
              href="/contact"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/contact');
              }}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
            >
              Contact
            </a>
            <a
              href="/T&C"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/T&C');
              }}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
            >
              T&amp;C
            </a>
          </nav>
        </div>
      </footer>

      <BrandLogoModal isOpen={logoModalOpen} onClose={() => setLogoModalOpen(false)} />
    </div>
  );
}
