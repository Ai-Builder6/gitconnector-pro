import React, { useEffect, useState } from 'react';
import {
  GitCompare,
  Loader2,
  RefreshCw,
  RotateCw,
} from 'lucide-react';
import type {
  GitHubBranchItem,
  WorkspaceDetail,
  WorkspaceDiffReport,
  WorkspaceSummary,
} from '../types';
import { apiFetch } from '../utils/api';
import { formatBytes } from '../utils/format';

interface BranchDiffPanelProps {
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceDetail | null;
  onWorkspacesCreated: () => Promise<void>;
}

export const BranchDiffPanel: React.FC<BranchDiffPanelProps> = ({
  workspaces,
  activeWorkspace,
  onWorkspacesCreated,
}) => {
  // Quick Two-Branch Clone & Compare Form
  const [compareUrl, setCompareUrl] = useState(
    activeWorkspace?.repoUrl || 'https://github.com/gabrielecirulli/2048'
  );
  const [discoveredBranches, setDiscoveredBranches] = useState<GitHubBranchItem[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [baseBranch, setBaseBranch] = useState('master');
  const [headBranch, setHeadBranch] = useState('gh-pages');
  const [cloningPair, setCloningPair] = useState(false);

  // Existing Workspace Pair Diff State
  const [baseWsId, setBaseWsId] = useState<string>('');
  const [headWsId, setHeadWsId] = useState<string>('');
  const [diffReport, setDiffReport] = useState<WorkspaceDiffReport | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Synchronized Live Preview Controls
  const [syncSubRoute, setSyncSubRoute] = useState('');
  const [syncReloadKey, setSyncReloadKey] = useState(0);

  // File-level Source Diff Inspector
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null);
  const [filePair, setFilePair] = useState<{ baseContent: string; headContent: string } | null>(null);
  const [loadingFilePair, setLoadingFilePair] = useState(false);

  useEffect(() => {
    if (workspaces.length >= 2 && !baseWsId && !headWsId) {
      setHeadWsId(workspaces[0].id);
      setBaseWsId(workspaces[1].id);
    } else if (workspaces.length === 1 && !baseWsId) {
      setBaseWsId(workspaces[0].id);
      setHeadWsId(workspaces[0].id);
    }
  }, [workspaces, baseWsId, headWsId]);

  const fetchBranchesForUrl = async (rawUrl: string) => {
    const cleaned = rawUrl
      .trim()
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '');
    const parts = cleaned.split('/').filter(Boolean);
    if (parts.length < 2) return;

    setLoadingBranches(true);
    setDiffError(null);
    try {
      const res = await apiFetch(`/api/github/repos/${parts[0]}/${parts[1]}/refs`);
      if (res.ok) {
        const data = (await res.json()) as { branches: GitHubBranchItem[] };
        setDiscoveredBranches(data.branches || []);
        if (data.branches.length >= 2) {
          const def =
            data.branches.find((b) => b.name === 'main' || b.name === 'master') ||
            data.branches[0];
          const alt = data.branches.find((b) => b.name !== def.name) || data.branches[0];
          setBaseBranch(def.name);
          setHeadBranch(alt.name);
        } else if (data.branches.length === 1) {
          setBaseBranch(data.branches[0].name);
          setHeadBranch(data.branches[0].name);
        }
      }
    } finally {
      setLoadingBranches(false);
    }
  };

  useEffect(() => {
    void fetchBranchesForUrl(compareUrl);
  }, []);

  const runWorkspacePairDiff = async (bId: string, hId: string) => {
    if (!bId || !hId) return;
    setLoadingDiff(true);
    setDiffError(null);
    setSelectedDiffPath(null);
    setFilePair(null);
    try {
      const res = await apiFetch(
        `/api/workspaces/diff?baseId=${encodeURIComponent(bId)}&headId=${encodeURIComponent(hId)}`
      );
      const data = (await res.json()) as { diff?: WorkspaceDiffReport; error?: string };
      if (!res.ok || !data.diff) {
        throw new Error(data.error || 'Unable to compute workspace diff.');
      }
      setDiffReport(data.diff);
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : 'Diff failed');
    } finally {
      setLoadingDiff(false);
    }
  };

  useEffect(() => {
    if (baseWsId && headWsId) {
      void runWorkspacePairDiff(baseWsId, headWsId);
    }
  }, [baseWsId, headWsId]);

  const handleCloneAndCompareBranches = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compareUrl.trim() || !baseBranch.trim() || !headBranch.trim()) return;
    setCloningPair(true);
    setDiffError(null);
    try {
      const res = await apiFetch('/api/workspaces/compare-branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: compareUrl.trim(),
          baseBranch: baseBranch.trim(),
          headBranch: headBranch.trim(),
        }),
      });
      const data = (await res.json()) as {
        baseWorkspace?: WorkspaceDetail;
        headWorkspace?: WorkspaceDetail;
        diff?: WorkspaceDiffReport;
        error?: string;
      };
      if (!res.ok || !data.baseWorkspace || !data.headWorkspace || !data.diff) {
        throw new Error(data.error || 'Failed to clone comparison branches.');
      }
      await onWorkspacesCreated();
      setBaseWsId(data.baseWorkspace.id);
      setHeadWsId(data.headWorkspace.id);
      setDiffReport(data.diff);
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : 'Branch comparison failed.');
    } finally {
      setCloningPair(false);
    }
  };

  const inspectChangedFile = async (filePath: string) => {
    if (!diffReport) return;
    setSelectedDiffPath(filePath);
    setLoadingFilePair(true);
    try {
      const res = await apiFetch(
        `/api/workspaces/diff-file?baseId=${encodeURIComponent(diffReport.baseId)}&headId=${encodeURIComponent(
          diffReport.headId
        )}&path=${encodeURIComponent(filePath)}`
      );
      if (res.ok) {
        const data = (await res.json()) as { baseContent: string; headContent: string };
        setFilePair({ baseContent: data.baseContent, headContent: data.headContent });
      }
    } finally {
      setLoadingFilePair(false);
    }
  };

  const baseWsSummary = workspaces.find((w) => w.id === baseWsId);
  const headWsSummary = workspaces.find((w) => w.id === headWsId);
  const cleanSub = syncSubRoute.replace(/^\/+/, '');

  return (
    <div className="space-y-8">
      {/* Top Card: Clone & Compare Any Two Branches/PRs */}
      <div className="border border-slate-800 bg-[#111827] rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">
            Side-by-Side Branch &amp; Pull Request Diff Runner
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Clone and build two branches in parallel sandboxes to compare live previews side-by-side, measure bundle deltas, and inspect file changes.
          </p>
        </div>

        <form
          onSubmit={(e) => void handleCloneAndCompareBranches(e)}
          className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end"
        >
          <div className="lg:col-span-5 space-y-1">
            <label className="text-xs text-slate-400">Repository URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={compareUrl}
                onChange={(e) => setCompareUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="flex-1 h-10 px-3 rounded-lg bg-[#0B0F17] border border-slate-700 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                disabled={loadingBranches}
                onClick={() => void fetchBranchesForUrl(compareUrl)}
                className="h-10 px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Load branches from GitHub"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingBranches ? 'animate-spin' : ''}`} />
                <span>Load Branches</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-1">
            <label className="text-xs text-slate-400">Base Branch</label>
            {discoveredBranches.length > 0 ? (
              <select
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                className="w-full h-10 px-2.5 rounded-lg bg-[#0B0F17] border border-slate-700 text-xs text-slate-200 font-mono"
              >
                {discoveredBranches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                placeholder="main"
                className="w-full h-10 px-3 rounded-lg bg-[#0B0F17] border border-slate-700 text-xs text-slate-200 font-mono"
              />
            )}
          </div>

          <div className="lg:col-span-2 space-y-1">
            <label className="text-xs text-slate-400">Head Branch</label>
            {discoveredBranches.length > 0 ? (
              <select
                value={headBranch}
                onChange={(e) => setHeadBranch(e.target.value)}
                className="w-full h-10 px-2.5 rounded-lg bg-[#0B0F17] border border-slate-700 text-xs text-slate-200 font-mono"
              >
                {discoveredBranches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={headBranch}
                onChange={(e) => setHeadBranch(e.target.value)}
                placeholder="feature-branch"
                className="w-full h-10 px-3 rounded-lg bg-[#0B0F17] border border-slate-700 text-xs text-slate-200 font-mono"
              />
            )}
          </div>

          <div className="lg:col-span-3">
            <button
              type="submit"
              disabled={cloningPair}
              className="w-full h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              {cloningPair ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <GitCompare className="w-4 h-4" />
              )}
              <span>{cloningPair ? 'Cloning & Building Pair...' : 'Clone, Build & Compare'}</span>
            </button>
          </div>
        </form>

        {/* Or Compare Already-Imported Workspaces */}
        {workspaces.length >= 1 && (
          <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <span className="text-slate-400">Or compare existing imported workspaces:</span>
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={baseWsId}
                onChange={(e) => setBaseWsId(e.target.value)}
                className="h-8 px-2.5 rounded-md bg-[#0B0F17] border border-slate-700 text-slate-200 font-mono text-xs"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    Base: {w.owner}/{w.repoName}@{w.branch} ({w.commitShort})
                  </option>
                ))}
              </select>
              <span className="text-slate-500">vs.</span>
              <select
                value={headWsId}
                onChange={(e) => setHeadWsId(e.target.value)}
                className="h-8 px-2.5 rounded-md bg-[#0B0F17] border border-slate-700 text-slate-200 font-mono text-xs"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    Head: {w.owner}/{w.repoName}@{w.branch} ({w.commitShort})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void runWorkspacePairDiff(baseWsId, headWsId)}
                className="h-8 px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer"
              >
                Refresh Diff
              </button>
            </div>
          </div>
        )}
      </div>

      {diffError && (
        <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/30 text-xs text-rose-200">
          {diffError}
        </div>
      )}

      {/* Side-by-Side Live Preview Viewports */}
      {baseWsSummary && headWsSummary && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">
              Synchronized Side-by-Side Live Previews
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={syncSubRoute}
                onChange={(e) => setSyncSubRoute(e.target.value)}
                placeholder="/synchronized-sub-route"
                className="h-8 w-56 px-3 rounded-md bg-[#111827] border border-slate-800 font-mono text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setSyncReloadKey((k) => k + 1)}
                className="h-8 px-3 rounded-md border border-slate-800 bg-[#111827] hover:bg-slate-800 text-xs text-slate-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Sync Reload</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              { role: 'Base', ws: baseWsSummary },
              { role: 'Head', ws: headWsSummary },
            ].map(({ role, ws }) => (
              <div
                key={`${role}-${ws.id}`}
                className="border border-slate-800 bg-[#111827] rounded-xl overflow-hidden flex flex-col"
              >
                <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-200 truncate">
                    {role}: {ws.owner}/{ws.repoName}@{ws.branch} ({ws.commitShort})
                  </span>
                  <span className="text-slate-400 shrink-0">{ws.status}</span>
                </div>
                <div className="h-[420px] bg-white">
                  {ws.status === 'succeeded' && ws.previewUrl ? (
                    <iframe
                      key={`${ws.id}-${syncReloadKey}`}
                      src={`${ws.previewUrl}${cleanSub}?_sync=${syncReloadKey}`}
                      title={`${role} preview`}
                      className="w-full h-full border-0"
                    />
                  ) : (
                    <div className="h-full bg-[#090D14] flex items-center justify-center text-xs text-slate-400 px-6 text-center">
                      {ws.status === 'building'
                        ? 'Building branch preview — live frame will mount automatically when compilation finishes...'
                        : 'Workspace not built yet. Build this workspace to view its live preview.'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Telemetry & File Diff Table */}
      {loadingDiff ? (
        <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          <span>Computing file hashes &amp; bundle deltas...</span>
        </div>
      ) : (
        diffReport && (
          <div className="space-y-6">
            {/* Quantitative Delta Summary */}
            <div className="border border-slate-800 bg-[#111827] rounded-xl p-5 grid grid-cols-2 md:grid-cols-5 gap-6 text-xs">
              <div>
                <div className="text-slate-400">Added Files</div>
                <div className="text-base font-semibold text-emerald-400 font-mono tabular-nums mt-1">
                  +{diffReport.addedCount}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Modified Files</div>
                <div className="text-base font-semibold text-amber-400 font-mono tabular-nums mt-1">
                  {diffReport.modifiedCount}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Removed Files</div>
                <div className="text-base font-semibold text-rose-400 font-mono tabular-nums mt-1">
                  -{diffReport.removedCount}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Unchanged Files</div>
                <div className="text-base font-semibold text-slate-200 font-mono tabular-nums mt-1">
                  {diffReport.unchangedCount}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Compiled Bundle Delta</div>
                <div
                  className={`text-base font-semibold font-mono tabular-nums mt-1 ${
                    diffReport.artifactDeltaBytes > 0
                      ? 'text-amber-300'
                      : diffReport.artifactDeltaBytes < 0
                      ? 'text-emerald-400'
                      : 'text-slate-200'
                  }`}
                >
                  {diffReport.artifactDeltaBytes > 0 ? '+' : ''}
                  {formatBytes(Math.abs(diffReport.artifactDeltaBytes))}
                  {diffReport.artifactDeltaBytes < 0 ? ' saved' : ''}
                </div>
              </div>
            </div>

            {/* Changed Files List & Side-by-Side Code Comparison */}
            <div className="border border-slate-800 bg-[#111827] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">
                  Changed Files ({diffReport.changes.length})
                </h3>
                <span className="text-xs text-slate-400">
                  Click any file row to inspect side-by-side source contents
                </span>
              </div>

              {diffReport.changes.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Both workspaces contain identical source trees (0 file differences).
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-[#0B0F17] text-slate-400 border-b border-slate-800 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-5 font-medium">File Path</th>
                        <th className="py-2.5 px-4 font-medium">Change</th>
                        <th className="py-2.5 px-5 font-medium text-right">Byte Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {diffReport.changes.map((ch) => {
                        const selected = selectedDiffPath === ch.path;
                        return (
                          <tr
                            key={ch.path}
                            onClick={() => void inspectChangedFile(ch.path)}
                            className={`cursor-pointer transition-colors ${
                              selected ? 'bg-blue-950/40' : 'hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-2.5 px-5 font-mono text-slate-200">{ch.path}</td>
                            <td
                              className={`py-2.5 px-4 font-medium ${
                                ch.changeType === 'added'
                                  ? 'text-emerald-400'
                                  : ch.changeType === 'removed'
                                  ? 'text-rose-400'
                                  : 'text-amber-300'
                              }`}
                            >
                              {ch.changeType}
                            </td>
                            <td className="py-2.5 px-5 text-right font-mono tabular-nums text-slate-300">
                              {ch.deltaBytes > 0 ? `+${formatBytes(ch.deltaBytes)}` : ch.deltaBytes < 0 ? `-${formatBytes(Math.abs(ch.deltaBytes))}` : '0 B'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedDiffPath && (
              <div className="border border-slate-800 bg-[#111827] rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800 text-xs font-mono text-slate-200">
                  Side-by-Side Source Diff: {selectedDiffPath}
                </div>
                {loadingFilePair ? (
                  <div className="p-8 text-center text-xs text-slate-400">Loading file contents...</div>
                ) : (
                  filePair && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
                      <div className="p-4 bg-[#090D14] max-h-96 overflow-auto">
                        <div className="text-[11px] text-slate-500 font-mono mb-2">
                          Base ({diffReport.baseLabel})
                        </div>
                        <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
                          {filePair.baseContent || '(File absent in Base)'}
                        </pre>
                      </div>
                      <div className="p-4 bg-[#090D14] max-h-96 overflow-auto">
                        <div className="text-[11px] text-slate-500 font-mono mb-2">
                          Head ({diffReport.headLabel})
                        </div>
                        <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
                          {filePair.headContent || '(File absent in Head)'}
                        </pre>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};
