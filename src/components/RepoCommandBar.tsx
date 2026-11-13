import React, { useState } from 'react';
import {
  ChevronDown,
  FolderGit2,
  Github,
  Hammer,
  Loader2,
  Search,
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
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const busy = isImporting || isBuilding;

  return (
    <section className="border-b border-slate-800 bg-[#0E131F]">
      <div className="max-w-[1440px] mx-auto px-6 py-5 space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onImport(true);
          }}
          className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3"
        >
          <div className="relative flex-1 flex items-center">
            <FolderGit2 className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={repoInput}
              onChange={(e) => onRepoInputChange(e.target.value)}
              placeholder="Paste GitHub URL or owner/repo (supports /tree/branch/subdir)"
              aria-label="GitHub Repository URL"
              className="w-full h-11 pl-10 pr-24 bg-[#0B0F17] border border-slate-700/90 rounded-lg text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="absolute right-2.5 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
              className="lg:w-48 h-11 px-3.5 bg-[#0B0F17] border border-slate-700/90 rounded-lg text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500 transition-colors"
            />
          )}

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onToggleGithubDrawer}
              className={`h-11 px-3.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                githubDrawerOpen || githubAuth?.connected
                  ? 'border-blue-500/60 bg-blue-950/30 text-blue-200'
                  : 'border-slate-700 bg-[#0B0F17] hover:bg-slate-800 text-slate-300'
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
              className="h-11 px-4 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-800 disabled:opacity-50 text-slate-200 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
              ) : (
                <Search className="w-4 h-4 text-slate-300" />
              )}
              <span>Clone &amp; Inspect</span>
            </button>

            <button
              type="submit"
              disabled={busy || !repoInput.trim()}
              className="h-11 px-5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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

        {/* Secondary Row: Sample Presets + Monorepo Sub-Target Selector */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-1 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 shrink-0">Sample repositories:</span>
            {VERIFIED_PRESETS.map((preset) => (
              <button
                key={preset.url}
                type="button"
                disabled={busy}
                onClick={() => {
                  onRepoInputChange(preset.url);
                  onImport(true, preset.url);
                }}
                className="px-2.5 py-1 rounded-md bg-slate-800/70 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {activeWorkspace && activeWorkspace.subProjects.length > 1 && (
            <div className="flex items-center gap-2.5">
              <label htmlFor="subproject-select" className="text-slate-400 whitespace-nowrap shrink-0">
                Build target ({activeWorkspace.subProjects.length} detected):
              </label>
              <div className="relative">
                <select
                  id="subproject-select"
                  value={activeWorkspace.targetSubPath}
                  disabled={busy}
                  onChange={(e) => onSwitchSubProject(e.target.value)}
                  className="appearance-none h-8 pl-3 pr-8 rounded-md bg-[#0B0F17] border border-slate-700 text-slate-200 font-mono text-xs focus:outline-none focus:border-blue-500 cursor-pointer"
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
        </div>

        {/* Workspace Switcher */}
        {workspaces.length > 0 && (
          <div className="pt-3 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-slate-500 shrink-0 mr-1">Workspaces:</span>
            {workspaces.map((ws) => {
              const isSelected = activeWorkspace?.id === ws.id;
              const st = getStatusDisplay(ws.status);
              return (
                <div
                  key={ws.id}
                  className={`group flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs transition-colors shrink-0 ${
                    isSelected
                      ? 'bg-slate-800 border-slate-600 text-white'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectWorkspace(ws.id)}
                    className="flex items-center gap-2 text-left whitespace-nowrap cursor-pointer"
                  >
                    <span className="font-medium text-slate-200">
                      {ws.owner}/{ws.repoName}@{ws.branch}
                    </span>
                    {ws.targetSubPath && (
                      <span className="font-mono text-slate-400">/{ws.targetSubPath}</span>
                    )}
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className={st.colorClass}>{ws.status}</span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
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
                    className="text-slate-500 hover:text-rose-400 transition-colors p-0.5 cursor-pointer"
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
