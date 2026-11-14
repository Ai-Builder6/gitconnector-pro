import React, { useState } from 'react';
import {
  ChevronDown,
  FolderGit2,
  Github,
  Hammer,
  Loader2,
  Moon,
  Search,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import type {
  GitHubAuthStatus,
  WorkspaceDetail,
  WorkspaceSummary,
} from '../types';
import { formatBytes, getStatusDisplay } from '../utils/format';

interface RepoCommandBarProps {
  repoInput: string;
  onRepoInputChange: (val: string) => void;
  branchInput: string;
  onBranchInputChange: (val: string) => void;
  isImporting: boolean;
  isBuilding: boolean;
  onImport: (autoBuild: boolean, overrideUrl?: string, overrideBranch?: string) => void;
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceDetail | null;
  onSelectWorkspace: (id: string) => void;
  onDeleteWorkspace: (id: string) => void;
  onSwitchSubProject: (subPath: string) => void;
  githubAuth: GitHubAuthStatus | null;
  githubDrawerOpen: boolean;
  onToggleGithubDrawer: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenUpgrades: () => void;
}

const VERIFIED_PRESETS = [
  {
    label: '2048 Game (HTML5/JS)',
    url: 'https://github.com/gabrielecirulli/2048',
  },
  {
    label: 'Vite + React + TS Starter',
    url: 'https://github.com/TheSwordBreaker/vite-reactts-eslint-prettier',
  },
  {
    label: 'Svelte App Template',
    url: 'https://github.com/sveltejs/template',
  },
  {
    label: 'TodoMVC Monorepo',
    url: 'https://github.com/tastejs/todomvc',
  },
];

export const RepoCommandBar: React.FC<RepoCommandBarProps> = ({
  repoInput,
  onRepoInputChange,
  branchInput,
  onBranchInputChange,
  isImporting,
  isBuilding,
  onImport,
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onDeleteWorkspace,
  onSwitchSubProject,
  githubAuth,
  githubDrawerOpen,
  onToggleGithubDrawer,
  theme,
  onToggleTheme,
  onOpenUpgrades,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const busy = isImporting || isBuilding;

  return (
    <section className="border-b border-orange-200/70 dark:border-slate-800 bg-gradient-to-r from-orange-50/70 via-white to-cyan-50/70 dark:from-[#0E131F] dark:via-[#0E131F] dark:to-[#0E131F]">
      <div className="max-w-[1440px] mx-auto px-6 py-5 space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onImport(true);
          }}
          className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3"
        >
          <div className="relative flex-1 flex items-center">
            <FolderGit2 className="w-4 h-4 text-orange-500 dark:text-orange-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={repoInput}
              onChange={(e) => onRepoInputChange(e.target.value)}
              placeholder="Paste GitHub URL or owner/repo (supports /tree/branch/subdir)"
              aria-label="GitHub Repository URL"
              className="w-full h-11 pl-10 pr-24 bg-white dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700/90 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-mono shadow-2xs focus:outline-none focus:border-orange-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="absolute right-2.5 px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-slate-200 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showAdvanced ? 'Hide Branch' : 'Branch'}
            </button>
          </div>

          {showAdvanced && (
            <input
              type="text"
              value={branchInput}
              onChange={(e) => onBranchInputChange(e.target.value)}
              placeholder="Branch (optional, e.g. main)"
              aria-label="Git Branch"
              className="lg:w-48 h-11 px-3.5 bg-white dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700/90 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-mono focus:outline-none focus:border-orange-500 transition-colors"
            />
          )}

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onToggleGithubDrawer}
              className={`h-11 px-3.5 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                githubDrawerOpen || githubAuth?.connected
                  ? 'border-cyan-400 dark:border-cyan-500/60 bg-cyan-50 dark:bg-cyan-950/30 text-cyan-800 dark:text-cyan-200'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Github className="w-4 h-4" />
              <span>
                {githubAuth?.connected && githubAuth.user
                  ? `@${githubAuth.user.login}`
                  : 'Private Repos'}
              </span>
            </button>

            <button
              type="button"
              disabled={busy || !repoInput.trim()}
              onClick={() => onImport(false)}
              className="h-11 px-4 rounded-lg border border-cyan-300 dark:border-slate-700 bg-cyan-50/80 dark:bg-slate-800/70 hover:bg-cyan-100/80 dark:hover:bg-slate-800 disabled:opacity-50 text-cyan-900 dark:text-slate-200 text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-cyan-600 dark:text-slate-300" />
              ) : (
                <Search className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              )}
              <span>Clone &amp; Inspect</span>
            </button>

            <button
              type="submit"
              disabled={busy || !repoInput.trim()}
              className="h-11 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Hammer className="w-4 h-4" />
              )}
              <span>Clone &amp; Build Project</span>
            </button>
          </div>
        </form>

        {/* Secondary Row: Sample Presets + Monorepo Sub-Target Selector + Suggested Upgrades & Theme Switch */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-1 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-500 dark:text-slate-400 font-medium shrink-0">
              Sample repositories:
            </span>
            {VERIFIED_PRESETS.map((preset) => (
              <button
                key={preset.url}
                type="button"
                disabled={busy}
                onClick={() => {
                  onRepoInputChange(preset.url);
                  onImport(true, preset.url);
                }}
                className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-800/70 hover:bg-orange-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-orange-700 dark:hover:text-white border border-slate-200 dark:border-slate-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {activeWorkspace && activeWorkspace.subProjects.length > 1 && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="subproject-select"
                  className="text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0"
                >
                  Target ({activeWorkspace.subProjects.length}):
                </label>
                <div className="relative">
                  <select
                    id="subproject-select"
                    value={activeWorkspace.targetSubPath}
                    disabled={busy}
                    onChange={(e) => onSwitchSubProject(e.target.value)}
                    className="appearance-none h-8 pl-3 pr-8 rounded-md bg-white dark:bg-[#0B0F17] border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono text-xs focus:outline-none focus:border-orange-500 cursor-pointer"
                  >
                    {activeWorkspace.subProjects.map((sp) => (
                      <option key={sp.subPath || '__root__'} value={sp.subPath}>
                        {sp.label} — {sp.framework}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onOpenUpgrades}
              className="h-8 px-3 rounded-md border border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-300 font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-orange-500 dark:text-amber-400" />
              <span>Suggested Upgrades &amp; Add-Ons</span>
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Bright Mode'}
              className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0F17] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                  <span>Dark</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Bright</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Workspace Switcher */}
        {workspaces.length > 0 && (
          <div className="pt-3 border-t border-orange-200/50 dark:border-slate-800/80 flex items-center gap-2 overflow-x-auto">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0 mr-1">
              Workspaces:
            </span>
            {workspaces.map((ws) => {
              const isSelected = activeWorkspace?.id === ws.id;
              const st = getStatusDisplay(ws.status);
              return (
                <div
                  key={ws.id}
                  className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors shrink-0 ${
                    isSelected
                      ? 'bg-white dark:bg-slate-800 border-orange-400 dark:border-orange-500/70 text-slate-900 dark:text-white shadow-2xs'
                      : 'bg-white/70 dark:bg-[#0B0F17] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectWorkspace(ws.id)}
                    className="flex items-center gap-2 text-left whitespace-nowrap cursor-pointer"
                  >
                    <span className="font-semibold text-slate-900 dark:text-slate-200">
                      {ws.owner}/{ws.repoName}@{ws.branch}
                    </span>
                    {ws.targetSubPath && (
                      <span className="font-mono text-slate-500 dark:text-slate-400">
                        /{ws.targetSubPath}
                      </span>
                    )}
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                      ·
                    </span>
                    <span className={st.colorClass}>{ws.status}</span>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                      ·
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {formatBytes(ws.totalBytes)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteWorkspace(ws.id);
                    }}
                    title="Remove workspace"
                    className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors p-0.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
