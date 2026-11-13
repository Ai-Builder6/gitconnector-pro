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
import { RepoCommandBar } from './components/RepoCommandBar';
import { GitHubRepoDrawer } from './components/GitHubRepoDrawer';
import { OverviewPanel } from './components/OverviewPanel';
import { CodeConfigPanel } from './components/CodeConfigPanel';
import { BuildConsolePanel } from './components/BuildConsolePanel';
import { LivePreviewPanel } from './components/LivePreviewPanel';
import { BranchDiffPanel } from './components/BranchDiffPanel';

type NavTab = 'overview' | 'code' | 'build' | 'preview' | 'diff';

export default function App() {
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

  const [buildOptions, setBuildOptions] = useState<BuildOptions>({
    autoNormalize: true,
    cleanInstall: false,
  });

  const bootCheckedRef = useRef(false);

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
        setOauthNotice('Browser blocked the OAuth popup. Allow popups for this site and click Connect again.');
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
    setActiveTab('build');

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

        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0B0F17]/95 border border-slate-700 shadow-xl text-xs text-slate-200">
          <span className="font-mono text-slate-300 mr-1 max-w-44 truncate">
            {activeWorkspace.owner}/{activeWorkspace.repoName}
          </span>
          <button
            type="button"
            onClick={() => setFullScreenReloadKey((k) => k + 1)}
            title="Reload application"
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setFullScreenApp(false);
              setActiveTab('code');
            }}
            title="Edit source code"
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setFullScreenApp(false)}
            className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>Studio Inspector</span>
          </button>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: NavTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'code', label: 'Code & Env' },
    { id: 'build', label: 'Build & API' },
    { id: 'preview', label: 'Live Preview' },
    { id: 'diff', label: 'Branch Diff' },
  ];

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 h-14 border-b border-slate-800 bg-[#0B0F17] sticky top-0 z-30">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('overview');
          }}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          RepoForge Studio
        </a>

        {/* Zone 2: 5 Clean Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center shrink-0">
          {canLaunchPreview ? (
            <button
              type="button"
              onClick={() => setFullScreenApp(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Launch Full App</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!activeWorkspace || isBuilding || isImporting}
              onClick={() => void handleTriggerBuild(false)}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Hammer className="w-3.5 h-3.5" />
              <span>{isBuilding ? 'Building...' : 'Build Project'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Navigation */}
      <div className="md:hidden flex items-center gap-4 px-6 py-2.5 border-b border-slate-800 bg-[#0E131F] overflow-x-auto text-xs font-medium">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === item.id ? 'text-blue-400 font-semibold' : 'text-slate-400'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Repository URL Paste & Workspace Switcher Bar */}
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
      />

      {/* Collapsible GitHub OAuth & Private Repository Browser */}
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

      {/* Main Content Canvas */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8">
        {errorBanner && (
          <div className="mb-6 p-4 rounded-xl border border-rose-500/40 bg-rose-950/30 text-rose-200 flex items-start justify-between gap-4 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-rose-200">Operation Failed</div>
                <p className="text-rose-300/90 mt-0.5">{errorBanner}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-rose-300 hover:text-white shrink-0 cursor-pointer"
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
          <div className="border border-slate-800 bg-[#111827] rounded-xl p-12 text-center max-w-2xl mx-auto my-8 space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {isImporting
                ? 'Cloning & Indexing GitHub Repository...'
                : 'Paste Any GitHub Repository Above to Start'}
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
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
      </main>

      <footer className="border-t border-slate-800/80 px-6 py-4 text-xs text-slate-500">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>RepoForge Studio · GitHub Repository Inspector, Compiler &amp; Diff Runner</span>
          <span>OAuth Private Clone · Branch Diff · API Subprocess Proxy · Smoke Prober</span>
        </div>
      </footer>
    </div>
  );
}
