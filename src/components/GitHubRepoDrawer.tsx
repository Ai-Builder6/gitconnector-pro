import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  GitBranch,
  Lock,
  Loader2,
  LogOut,
  Search,
  Unlock,
  X,
} from 'lucide-react';
import type {
  GitHubAuthStatus,
  GitHubBranchItem,
  GitHubPullRequestItem,
  GitHubRepoItem,
} from '../types';
import { apiFetch } from '../utils/api';

interface GitHubRepoDrawerProps {
  authStatus: GitHubAuthStatus | null;
  onConnectClick: () => void;
  onDisconnectClick: () => void;
  onSelectRepoAndClone: (repoUrl: string, branch?: string, autoBuild?: boolean) => void;
  onClose: () => void;
  oauthNotice: string | null;
}

export const GitHubRepoDrawer: React.FC<GitHubRepoDrawerProps> = ({
  authStatus,
  onConnectClick,
  onDisconnectClick,
  onSelectRepoAndClone,
  onClose,
  oauthNotice,
}) => {
  const [repos, setRepos] = useState<GitHubRepoItem[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoFilter, setRepoFilter] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoItem | null>(null);
  const [branches, setBranches] = useState<GitHubBranchItem[]>([]);
  const [pulls, setPulls] = useState<GitHubPullRequestItem[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [chosenBranch, setChosenBranch] = useState('');
  const [copiedCallback, setCopiedCallback] = useState(false);

  useEffect(() => {
    if (!authStatus?.connected) return;
    setLoadingRepos(true);
    void (async () => {
      try {
        const res = await apiFetch('/api/github/repos');
        if (res.ok) {
          const data = (await res.json()) as { repos: GitHubRepoItem[] };
          setRepos(data.repos || []);
        }
      } finally {
        setLoadingRepos(false);
      }
    })();
  }, [authStatus?.connected]);

  const handlePickRepo = async (repo: GitHubRepoItem) => {
    setSelectedRepo(repo);
    setChosenBranch(repo.default_branch);
    setLoadingRefs(true);
    try {
      const res = await apiFetch(`/api/github/repos/${repo.owner.login}/${repo.name}/refs`);
      if (res.ok) {
        const data = (await res.json()) as {
          branches: GitHubBranchItem[];
          pulls: GitHubPullRequestItem[];
        };
        setBranches(data.branches || []);
        setPulls(data.pulls || []);
      }
    } finally {
      setLoadingRefs(false);
    }
  };

  const filteredRepos = useMemo(() => {
    if (!repoFilter.trim()) return repos;
    const q = repoFilter.trim().toLowerCase();
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
    );
  }, [repos, repoFilter]);

  const callbackUrl = authStatus?.callbackUrl || `${window.location.origin}/auth/callback`;

  return (
    <div className="border-b border-slate-800 bg-[#0B0F17]">
      <div className="max-w-[1440px] mx-auto px-6 py-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">
              GitHub Account &amp; Private Repository Browser
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Authenticate via GitHub OAuth popup to browse private repositories, branches, and open pull requests.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {oauthNotice && (
          <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/30 text-xs text-amber-200">
            {oauthNotice}
          </div>
        )}

        {!authStatus?.connected ? (
          <div className="border border-slate-800 bg-[#111827] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-2 max-w-2xl">
              <div className="text-xs font-medium text-slate-200">
                {authStatus?.configured
                  ? 'GitHub OAuth credentials detected — ready to connect.'
                  : 'Configure GitHub OAuth App Secrets to enable private repository login'}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Register an OAuth App at <code>https://github.com/settings/developers</code> with the callback URL below, then add <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code> in your AI Studio Secrets panel.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <code className="px-3 py-1.5 rounded-md bg-[#0B0F17] border border-slate-800 text-xs text-slate-300 font-mono truncate">
                  {callbackUrl}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(callbackUrl);
                    setCopiedCallback(true);
                    setTimeout(() => setCopiedCallback(false), 1800);
                  }}
                  className="h-8 px-2.5 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {copiedCallback ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCallback ? 'Copied URI' : 'Copy Callback URI'}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={onConnectClick}
              className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Connect GitHub Account</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Connected User Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-[#111827] border border-slate-800 text-xs">
              <div className="flex items-center gap-3">
                <img
                  src={authStatus.user?.avatar_url}
                  alt={authStatus.user?.login || 'GitHub User'}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-full bg-slate-800"
                />
                <span className="text-slate-200 font-medium">
                  Connected as @{authStatus.user?.login}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400 font-mono tabular-nums">
                  {repos.length} accessible repositories
                </span>
              </div>
              <button
                type="button"
                onClick={onDisconnectClick}
                className="text-slate-400 hover:text-rose-400 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>

            {/* Repo Picker + Branch/PR Selector */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 border border-slate-800 bg-[#111827] rounded-xl overflow-hidden flex flex-col h-72">
                <div className="p-3 border-b border-slate-800 relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-6 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={repoFilter}
                    onChange={(e) => setRepoFilter(e.target.value)}
                    placeholder="Filter private and organization repositories..."
                    className="w-full h-8 pl-8 pr-3 rounded-md bg-[#0B0F17] border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
                  {loadingRepos ? (
                    <div className="h-full flex items-center justify-center gap-2 text-xs text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                      <span>Fetching repositories from GitHub...</span>
                    </div>
                  ) : filteredRepos.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No matching repositories found.
                    </div>
                  ) : (
                    filteredRepos.map((repo) => {
                      const active = selectedRepo?.id === repo.id;
                      return (
                        <button
                          key={repo.id}
                          type="button"
                          onClick={() => void handlePickRepo(repo)}
                          className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer ${
                            active ? 'bg-blue-950/40 text-white' : 'hover:bg-slate-800/40 text-slate-300'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {repo.private ? (
                                <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              )}
                              <span className="font-mono font-medium truncate">
                                {repo.full_name}
                              </span>
                            </div>
                            {repo.description && (
                              <p className="text-[11px] text-slate-500 truncate mt-0.5 pl-5">
                                {repo.description}
                              </p>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {repo.private ? 'Private' : 'Public'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 border border-slate-800 bg-[#111827] rounded-xl p-4 flex flex-col justify-between h-72">
                {!selectedRepo ? (
                  <div className="h-full flex items-center justify-center text-center text-xs text-slate-500 px-4">
                    Select any repository on the left to choose a branch or open pull request to clone and build.
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 overflow-y-auto pr-1">
                      <div>
                        <div className="text-xs font-semibold text-white font-mono">
                          {selectedRepo.full_name}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Default branch: <code>{selectedRepo.default_branch}</code>
                        </div>
                      </div>

                      {loadingRefs ? (
                        <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                          <span>Loading branches &amp; pull requests...</span>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <label className="text-xs text-slate-400 flex items-center gap-1.5">
                              <GitBranch className="w-3.5 h-3.5" />
                              <span>Target Branch ({branches.length})</span>
                            </label>
                            <select
                              value={chosenBranch}
                              onChange={(e) => setChosenBranch(e.target.value)}
                              className="w-full h-8 px-2.5 rounded-md bg-[#0B0F17] border border-slate-700 text-xs text-slate-200 font-mono"
                            >
                              {branches.map((b) => (
                                <option key={b.name} value={b.name}>
                                  {b.name} ({b.commitSha})
                                </option>
                              ))}
                            </select>
                          </div>

                          {pulls.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-xs text-slate-400">
                                Open Pull Requests ({pulls.length})
                              </div>
                              <div className="space-y-1 max-h-24 overflow-y-auto">
                                {pulls.map((pr) => (
                                  <button
                                    key={pr.number}
                                    type="button"
                                    onClick={() => setChosenBranch(pr.headRef)}
                                    className={`w-full px-2.5 py-1 rounded text-left text-[11px] font-mono truncate cursor-pointer ${
                                      chosenBranch === pr.headRef
                                        ? 'bg-blue-950/60 text-blue-300'
                                        : 'bg-[#0B0F17] text-slate-300 hover:bg-slate-800'
                                    }`}
                                  >
                                    #{pr.number} {pr.title} ({pr.headRef})
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectRepoAndClone(selectedRepo.html_url, chosenBranch, false);
                          onClose();
                        }}
                        className="flex-1 h-9 px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap"
                      >
                        Inspect Only
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectRepoAndClone(selectedRepo.html_url, chosenBranch, true);
                          onClose();
                        }}
                        className="flex-1 h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                      >
                        Clone &amp; Build
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
