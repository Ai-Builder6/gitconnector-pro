import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Hammer,
  Loader2,
  Play,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { marked } from 'marked';
import type { WorkspaceDetail } from '../types';
import { apiFetch } from '../utils/api';
import { formatBytes, formatDuration, getStatusDisplay } from '../utils/format';
import { DatabaseBridgeCard } from './DatabaseBridgeCard';
import { GoogleDriveExportCard } from './GoogleDriveExportCard';

interface OverviewPanelProps {
  workspace: WorkspaceDetail;
  isBuilding: boolean;
  onTriggerBuild: (cleanInstall?: boolean) => void;
  onOpenPreview: () => void;
  onMountFullApp: () => void;
  onOpenFileInEditor: (path: string) => void;
  onSwitchSubProject: (subPath: string) => void;
  onRefreshWorkspace: () => Promise<void>;
  onOpenDocsWorkflows: () => void;
}

export const OverviewPanel: React.FC<OverviewPanelProps> = ({
  workspace,
  isBuilding,
  onTriggerBuild,
  onOpenPreview,
  onMountFullApp,
  onOpenFileInEditor,
  onSwitchSubProject,
  onRefreshWorkspace,
  onOpenDocsWorkflows,
}) => {
  const [depFilter, setDepFilter] = useState<'all' | 'runtime' | 'dev'>('all');
  const [depSearch, setDepSearch] = useState('');
  const [runningProbe, setRunningProbe] = useState(false);

  const statusInfo = getStatusDisplay(workspace.status);

  const filteredDeps = useMemo(() => {
    return workspace.dependencies.filter((d) => {
      if (depFilter !== 'all' && d.kind !== depFilter) return false;
      if (depSearch.trim() && !d.name.toLowerCase().includes(depSearch.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [workspace.dependencies, depFilter, depSearch]);

  const renderedReadme = useMemo(() => {
    try {
      return marked.parse(workspace.readme || '') as string;
    } catch {
      return '<p>Unable to render README markdown.</p>';
    }
  }, [workspace.readme]);

  const handleRerunSmokeProbe = async () => {
    setRunningProbe(true);
    try {
      await apiFetch(`/api/workspaces/${workspace.id}/probe`, { method: 'POST' });
      await onRefreshWorkspace();
    } finally {
      setRunningProbe(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Workspace Header & Action Strip */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              <span className={statusInfo.colorClass}>{statusInfo.label}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{workspace.branch}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">commit {workspace.commitShort}</span>
              <span aria-hidden="true">·</span>
              <span>by {workspace.commitAuthor} ({workspace.commitRelativeTime})</span>
            </div>

            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
              {workspace.owner}/{workspace.repoName}
              {workspace.targetSubPath ? (
                <span className="text-cyan-600 dark:text-cyan-400 font-normal font-mono text-lg">
                  /{workspace.targetSubPath}
                </span>
              ) : null}
            </h1>

            {workspace.commitMessage && (
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl truncate">
                Latest commit: {workspace.commitMessage}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            <a
              href={workspace.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="h-10 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <span>GitHub Source</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            </a>

            <button
              type="button"
              onClick={onOpenDocsWorkflows}
              className="h-10 px-3.5 rounded-lg border border-orange-300 dark:border-orange-500/50 bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-900/40 text-orange-900 dark:text-orange-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
              <span>README &amp; Workflows</span>
            </button>

            <a
              href={`/api/workspaces/${workspace.id}/download?mode=project`}
              className="h-10 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>Export Source (.tar.gz)</span>
            </a>

            {workspace.status === 'succeeded' && workspace.previewUrl ? (
              <>
                <button
                  type="button"
                  onClick={onOpenPreview}
                  className="h-10 px-4 rounded-lg border border-emerald-300 dark:border-emerald-600/50 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Inspect Preview</span>
                </button>
                <button
                  type="button"
                  onClick={onMountFullApp}
                  className="h-10 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Launch Full-Screen App</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isBuilding}
                onClick={() => onTriggerBuild(false)}
                className="h-10 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Hammer className="w-3.5 h-3.5" />
                <span>{isBuilding ? 'Building Project...' : 'Build Whole Project'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Factual Repository Telemetry Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 pt-6 mt-6 border-t border-slate-100 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Detected Stack</div>
            <div className="text-sm font-bold text-orange-600 dark:text-orange-400 mt-1">
              {workspace.framework}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Package Manager</div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">
              {workspace.packageManager}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Indexed Files &amp; Size</div>
            <div className="text-sm font-bold text-cyan-700 dark:text-cyan-400 font-mono tabular-nums mt-1">
              {workspace.totalFiles.toLocaleString()} files · {formatBytes(workspace.totalBytes)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Database Models</div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-1">
              {workspace.databaseSchema.detected
                ? `${workspace.databaseSchema.models.length} (${workspace.databaseSchema.ormType})`
                : 'None detected'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Last Build Time</div>
            <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 font-mono tabular-nums mt-1">
              {formatDuration(workspace.buildDurationMs)}
            </div>
          </div>
        </div>
      </div>

      {/* Full Project Google Drive Folder Uploader */}
      <GoogleDriveExportCard
        workspace={workspace}
        onWorkspaceUpdated={onRefreshWorkspace}
      />

      {/* Automated Post-Build Smoke Prober Report */}
      {workspace.smokeProbe && (
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl overflow-hidden shadow-2xs">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Automated Post-Build Smoke Prober
              </span>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span
                className={
                  workspace.smokeProbe.overallStatus === 'healthy'
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : workspace.smokeProbe.overallStatus === 'degraded'
                    ? 'text-amber-600 dark:text-amber-300 font-semibold'
                    : 'text-rose-600 dark:text-rose-400 font-semibold'
                }
              >
                {workspace.smokeProbe.overallStatus === 'healthy'
                  ? 'All checks healthy'
                  : workspace.smokeProbe.overallStatus === 'degraded'
                  ? 'Passed with warnings'
                  : 'Action required'}
              </span>
            </div>

            <button
              type="button"
              disabled={runningProbe}
              onClick={() => void handleRerunSmokeProbe()}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              {runningProbe ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              )}
              <span>Re-run Smoke Probe</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
            {workspace.smokeProbe.checks.map((chk) => (
              <div
                key={chk.id}
                className="p-4 flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800/60 last:border-b-0"
              >
                <div className="flex items-start gap-2.5">
                  {chk.status === 'pass' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : chk.status === 'warn' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-200">
                      {chk.name}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {chk.detail}
                    </p>
                  </div>
                </div>
                {chk.metric && (
                  <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 shrink-0">
                    {chk.metric}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Database Schema & Cloud Provisioning Bridge */}
      <DatabaseBridgeCard
        workspace={workspace}
        onOpenFileInEditor={onOpenFileInEditor}
        onRefreshWorkspace={onRefreshWorkspace}
      />

      {/* Two-Column Inspection Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Normalization Rules, Scripts, Languages */}
        <div className="lg:col-span-5 space-y-8">
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl overflow-hidden shadow-2xs">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Build Normalization Plan
              </h2>
              <span className="text-xs text-orange-600 dark:text-orange-400 font-mono tabular-nums font-semibold">
                {workspace.buildStrategy}
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {workspace.normalizations.map((item) => (
                <div key={item.id} className="px-5 py-3.5 flex items-start gap-3">
                  {item.severity === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-200">
                      {item.title}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl overflow-hidden shadow-2xs">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Declared Scripts
              </h2>
              <button
                type="button"
                onClick={() =>
                  onOpenFileInEditor(
                    workspace.targetSubPath
                      ? `${workspace.targetSubPath}/package.json`
                      : 'package.json'
                  )
                }
                className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>Edit package.json</span>
              </button>
            </div>
            {Object.keys(workspace.scripts).length === 0 ? (
              <div className="px-5 py-6 text-xs text-slate-500 dark:text-slate-400">
                No npm scripts declared in this target directory. Static HTML/JS assets will be served directly.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {Object.entries(workspace.scripts).map(([name, cmd]) => (
                  <div
                    key={name}
                    className="px-5 py-2.5 flex items-baseline justify-between gap-4 text-xs"
                  >
                    <span className="font-mono font-semibold text-orange-600 dark:text-orange-400 shrink-0">
                      {name}
                    </span>
                    <span
                      className="font-mono text-slate-700 dark:text-slate-300 truncate text-right"
                      title={cmd}
                    >
                      {cmd}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {workspace.languages.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl overflow-hidden shadow-2xs">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Language Composition
                </h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {workspace.languages.slice(0, 8).map((lang) => {
                  const pct =
                    workspace.totalBytes > 0
                      ? Math.min(100, (lang.bytes / workspace.totalBytes) * 100)
                      : 0;
                  return (
                    <div
                      key={lang.language}
                      className="px-5 py-2.5 flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-800 dark:text-slate-200 font-semibold">
                        {lang.language}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {lang.files} files · {formatBytes(lang.bytes)} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Monorepo Sub-Projects, Dependencies, README */}
        <div className="lg:col-span-7 space-y-8">
          {workspace.subProjects.length > 1 && (
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl overflow-hidden shadow-2xs">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Discovered Sub-Projects ({workspace.subProjects.length})
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Select any package to inspect &amp; build independently
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {workspace.subProjects.map((sp) => {
                  const active = sp.subPath === workspace.targetSubPath;
                  return (
                    <div
                      key={sp.subPath || '__root__'}
                      className={`px-5 py-2.5 flex items-center justify-between gap-4 text-xs transition-colors ${
                        active
                          ? 'bg-orange-50/70 dark:bg-orange-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">
                          {sp.label}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600 mx-2">·</span>
                        <span className="text-slate-600 dark:text-slate-400">{sp.framework}</span>
                        <span className="text-slate-300 dark:text-slate-600 mx-2">·</span>
                        <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {sp.dependencyCount} deps
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={active || isBuilding}
                        onClick={() => onSwitchSubProject(sp.subPath)}
                        className={`px-3 py-1 rounded-md font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          active
                            ? 'text-orange-600 dark:text-orange-400 cursor-default'
                            : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {active ? 'Active Target' : 'Select Target'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl overflow-hidden shadow-2xs">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#0B0F17] rounded-lg border border-slate-200 dark:border-slate-800">
                {(['all', 'runtime', 'dev'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setDepFilter(tab)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      depFilter === tab
                        ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab === 'all'
                      ? `All (${workspace.dependencies.length})`
                      : tab === 'runtime'
                      ? 'Dependencies'
                      : 'DevDependencies'}
                  </button>
                ))}
              </div>

              <div className="relative sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={depSearch}
                  onChange={(e) => setDepSearch(e.target.value)}
                  placeholder="Filter packages..."
                  className="w-full h-8 pl-8 pr-3 rounded-md bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            {filteredDeps.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                {workspace.dependencies.length === 0
                  ? 'Zero external npm dependencies required.'
                  : 'No packages match the active filter.'}
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 dark:bg-[#0B0F17] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-5 font-semibold">Package</th>
                      <th className="py-2.5 px-4 font-semibold">Scope</th>
                      <th className="py-2.5 px-5 font-semibold text-right">Version Spec</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredDeps.map((dep) => (
                      <tr
                        key={`${dep.kind}-${dep.name}`}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
                      >
                        <td className="py-2.5 px-5">
                          <div className="font-mono font-medium text-slate-900 dark:text-slate-200">
                            {dep.name}
                          </div>
                          {dep.note && (
                            <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                              {dep.note}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">
                          {dep.kind === 'runtime' ? 'runtime' : 'dev'}
                        </td>
                        <td className="py-2.5 px-5 text-right font-mono tabular-nums text-cyan-700 dark:text-slate-300">
                          {dep.version}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl overflow-hidden shadow-2xs">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Repository Documentation
              </h2>
              <button
                type="button"
                onClick={onOpenDocsWorkflows}
                className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Generate README &amp; Workflows</span>
              </button>
            </div>
            <div
              className="p-6 text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-h-[540px] overflow-y-auto space-y-3 [&_h1]:text-xl [&_h1]:font-extrabold [&_h1]:text-slate-900 dark:[&_h1]:text-white [&_h1]:mb-3 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100 [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-800 dark:[&_h3]:text-slate-200 [&_a]:text-orange-600 dark:[&_a]:text-cyan-400 [&_a]:underline [&_code]:font-mono [&_code]:text-xs [&_code]:bg-slate-100 dark:[&_code]:bg-[#0B0F17] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-slate-800 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
              dangerouslySetInnerHTML={{ __html: renderedReadme }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
