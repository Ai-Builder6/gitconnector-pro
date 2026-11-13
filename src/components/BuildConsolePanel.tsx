import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Hammer,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Server,
  Square,
} from 'lucide-react';
import type { BuildOptions, WorkspaceDetail } from '../types';
import { apiFetch } from '../utils/api';
import { formatBytes, formatDuration, getStatusDisplay } from '../utils/format';

interface BuildConsolePanelProps {
  workspace: WorkspaceDetail;
  logs: string[];
  apiLogs: string[];
  buildOptions: BuildOptions;
  onChangeBuildOptions: (opts: BuildOptions) => void;
  onTriggerBuild: () => void;
  onOpenPreview: () => void;
  onMountFullApp: () => void;
  onRefreshWorkspace: () => Promise<void>;
}

export const BuildConsolePanel: React.FC<BuildConsolePanelProps> = ({
  workspace,
  logs,
  apiLogs,
  buildOptions,
  onChangeBuildOptions,
  onTriggerBuild,
  onOpenPreview,
  onMountFullApp,
  onRefreshWorkspace,
}) => {
  const [copiedLogs, setCopiedLogs] = useState(false);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const apiLogRef = useRef<HTMLDivElement | null>(null);

  // Backend API Subprocess State
  const [entryOverride, setEntryOverride] = useState(
    workspace.apiServer.detectedEntry || 'server.js'
  );
  const [togglingApi, setTogglingApi] = useState(false);

  // Sandbox API HTTP Tester State
  const [reqMethod, setReqMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');
  const [reqPath, setReqPath] = useState('/');
  const [reqBody, setReqBody] = useState('{\n  "ping": true\n}');
  const [sendingReq, setSendingReq] = useState(false);
  const [apiResponse, setApiResponse] = useState<{
    status: number;
    durationMs: number;
    body: string;
  } | null>(null);

  useEffect(() => {
    setEntryOverride(workspace.apiServer.detectedEntry || 'server.js');
    setApiResponse(null);
  }, [workspace.id, workspace.apiServer.detectedEntry]);

  const isBuilding = workspace.status === 'building';
  const statusInfo = getStatusDisplay(workspace.status);

  useEffect(() => {
    const el = logContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length, workspace.status]);

  useEffect(() => {
    const el = apiLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [apiLogs.length]);

  const totalArtifactBytes = workspace.artifacts.reduce((acc, a) => acc + a.size, 0);

  const handleStartApiServer = async () => {
    setTogglingApi(true);
    try {
      await apiFetch(`/api/workspaces/${workspace.id}/api-server/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: entryOverride.trim() || undefined }),
      });
      await onRefreshWorkspace();
    } finally {
      setTogglingApi(false);
    }
  };

  const handleStopApiServer = async () => {
    setTogglingApi(true);
    try {
      await apiFetch(`/api/workspaces/${workspace.id}/api-server/stop`, {
        method: 'POST',
      });
      await onRefreshWorkspace();
    } finally {
      setTogglingApi(false);
    }
  };

  const handleSendTestRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingReq(true);
    const t0 = performance.now();
    try {
      const cleanPath = reqPath.startsWith('/') ? reqPath : `/${reqPath}`;
      const init: RequestInit = {
        method: reqMethod,
      };
      if (reqMethod !== 'GET' && reqBody.trim()) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = reqBody;
      }
      const res = await fetch(`/sandbox-api/${workspace.id}${cleanPath}`, init);
      const rawText = await res.text();
      let formatted = rawText;
      try {
        formatted = JSON.stringify(JSON.parse(rawText), null, 2);
      } catch {
        // Keep raw text
      }
      setApiResponse({
        status: res.status,
        durationMs: Math.round(performance.now() - t0),
        body: formatted,
      });
    } catch (err) {
      setApiResponse({
        status: 0,
        durationMs: Math.round(performance.now() - t0),
        body: err instanceof Error ? err.message : 'Request failed',
      });
    } finally {
      setSendingReq(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Build Controls Header */}
      <div className="border border-slate-800 bg-[#111827] rounded-xl p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <span className={`font-medium ${statusInfo.colorClass}`}>{statusInfo.label}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-slate-400 font-mono">
              {workspace.owner}/{workspace.repoName}
              {workspace.targetSubPath ? `/${workspace.targetSubPath}` : ''}
            </span>
            {workspace.buildDurationMs !== undefined && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono tabular-nums text-slate-400">
                  {formatDuration(workspace.buildDurationMs)}
                </span>
              </>
            )}
          </div>
          <h2 className="text-base font-semibold text-white">
            Full Project Build Pipeline &amp; Sandbox API Runner
          </h2>
          {workspace.errorMessage && (
            <p className="text-xs text-rose-400 pt-1">{workspace.errorMessage}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={buildOptions.autoNormalize}
              onChange={(e) =>
                onChangeBuildOptions({ ...buildOptions, autoNormalize: e.target.checked })
              }
              className="rounded border-slate-700 bg-slate-900 text-blue-600"
            />
            <span>Auto-normalize lockfiles &amp; base paths</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={buildOptions.cleanInstall}
              onChange={(e) =>
                onChangeBuildOptions({ ...buildOptions, cleanInstall: e.target.checked })
              }
              className="rounded border-slate-700 bg-slate-900 text-blue-600"
            />
            <span>Clean install</span>
          </label>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isBuilding}
              onClick={onTriggerBuild}
              className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isBuilding ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : workspace.status === 'succeeded' ? (
                <RotateCcw className="w-3.5 h-3.5" />
              ) : (
                <Hammer className="w-3.5 h-3.5" />
              )}
              <span>
                {isBuilding
                  ? 'Compiling...'
                  : workspace.status === 'succeeded'
                  ? 'Rebuild Project'
                  : 'Build Project'}
              </span>
            </button>

            {workspace.status === 'succeeded' && workspace.previewUrl && (
              <>
                <button
                  type="button"
                  onClick={onOpenPreview}
                  className="h-10 px-3.5 rounded-lg border border-emerald-600/50 bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Open Preview</span>
                </button>
                <button
                  type="button"
                  onClick={onMountFullApp}
                  className="h-10 px-3.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Full-Screen App</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Streaming Build Terminal */}
      <div className="border border-slate-800 bg-[#111827] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
            {isBuilding && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />}
            <span>Build Output Stream</span>
            <span className="text-slate-500">·</span>
            <span className="font-mono tabular-nums text-slate-400">{logs.length} lines</span>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(logs.join('\n'));
              setCopiedLogs(true);
              setTimeout(() => setCopiedLogs(false), 1500);
            }}
            className="h-7 px-2.5 rounded-md border border-slate-700 bg-slate-800/70 hover:bg-slate-800 text-xs text-slate-300 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLogs ? 'Copied' : 'Copy Log'}</span>
          </button>
        </div>

        <div
          ref={logContainerRef}
          className="p-5 bg-[#090D14] font-mono text-xs leading-relaxed h-[320px] overflow-y-auto space-y-1"
        >
          {logs.length === 0 ? (
            <div className="text-slate-500">
              No build logs recorded yet. Click Build Project above to install dependencies and compile the repository.
            </div>
          ) : (
            logs.map((line, i) => {
              const isErr = /error|failed|err!/i.test(line);
              const isWarn = /warn|warning/i.test(line);
              const isSuccess = /succeeded|successfully|healthy/i.test(line);
              return (
                <div
                  key={i}
                  className={
                    isErr
                      ? 'text-rose-400 break-words'
                      : isWarn
                      ? 'text-amber-300 break-words'
                      : isSuccess
                      ? 'text-emerald-400 break-words'
                      : 'text-slate-300 break-words'
                  }
                >
                  {line}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* SUGGESTION 4: Backend API Subprocess Runner & Reverse Proxy Tester */}
      <div className="border border-slate-800 bg-[#111827] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-xs">
              <Server className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-semibold text-slate-100">
                Backend API Subprocess Proxy
              </span>
              <span className="text-slate-600">·</span>
              <span
                className={
                  workspace.apiServer.status === 'running'
                    ? 'text-emerald-400 font-medium'
                    : workspace.apiServer.status === 'error'
                    ? 'text-rose-400'
                    : 'text-slate-400'
                }
              >
                Status: {workspace.apiServer.status}
              </span>
              {workspace.apiServer.port && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="font-mono tabular-nums text-slate-400">
                    127.0.0.1:{workspace.apiServer.port} → /sandbox-api/{workspace.id}/*
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Spawn Express, Fastify, Hono, or custom Node API entrypoints on an isolated localhost port and send live requests through <code>/sandbox-api/{workspace.id}/*</code>.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <input
              type="text"
              value={entryOverride}
              onChange={(e) => setEntryOverride(e.target.value)}
              disabled={workspace.apiServer.status === 'running' || togglingApi}
              placeholder="Entry file (e.g. server.ts)"
              className="w-48 h-9 px-3 rounded-lg bg-[#0B0F17] border border-slate-700 font-mono text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />

            {workspace.apiServer.status === 'running' ? (
              <button
                type="button"
                disabled={togglingApi}
                onClick={() => void handleStopApiServer()}
                className="h-9 px-3.5 rounded-lg border border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/50 text-rose-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop Subprocess</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={togglingApi}
                onClick={() => void handleStartApiServer()}
                className="h-9 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {togglingApi ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>Start API Subprocess</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          {/* Subprocess Logs */}
          <div className="lg:col-span-6 p-4 bg-[#090D14] flex flex-col h-64">
            <div className="text-xs text-slate-400 mb-2 font-medium">
              Subprocess Console Output
            </div>
            <div
              ref={apiLogRef}
              className="flex-1 overflow-y-auto font-mono text-xs text-slate-300 space-y-1"
            >
              {apiLogs.length === 0 ? (
                <span className="text-slate-600">
                  {workspace.apiServer.capable
                    ? `Detected entrypoint "${workspace.apiServer.detectedEntry || 'npm start'}". Click Start API Subprocess to launch.`
                    : 'No default backend server entrypoint detected — specify any .js/.ts file above (or create one in Code & Env) to launch.'}
                </span>
              ) : (
                apiLogs.map((l, idx) => <div key={idx}>{l}</div>)
              )}
            </div>
          </div>

          {/* Interactive HTTP Request Client */}
          <div className="lg:col-span-6 p-4 space-y-3">
            <form onSubmit={(e) => void handleSendTestRequest(e)} className="flex items-center gap-2">
              <select
                value={reqMethod}
                onChange={(e) => setReqMethod(e.target.value as 'GET' | 'POST' | 'PUT' | 'DELETE')}
                className="h-8 px-2 rounded-md bg-[#0B0F17] border border-slate-700 text-xs font-mono text-slate-200"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
              <input
                type="text"
                value={reqPath}
                onChange={(e) => setReqPath(e.target.value)}
                placeholder="/api/health"
                className="flex-1 h-8 px-3 rounded-md bg-[#0B0F17] border border-slate-700 font-mono text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={sendingReq || workspace.apiServer.status !== 'running'}
                className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Send className="w-3 h-3" />
                <span>Send</span>
              </button>
            </form>

            {reqMethod !== 'GET' && (
              <textarea
                value={reqBody}
                onChange={(e) => setReqBody(e.target.value)}
                rows={2}
                className="w-full p-2 rounded-md bg-[#0B0F17] border border-slate-800 font-mono text-xs text-slate-300 focus:outline-none"
              />
            )}

            <div className="p-3 rounded-lg bg-[#090D14] border border-slate-800/80 h-36 overflow-y-auto font-mono text-xs">
              {!apiResponse ? (
                <span className="text-slate-600">
                  Response payload from /sandbox-api/{workspace.id}{reqPath} will render here.
                </span>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-slate-400 tabular-nums">
                    HTTP {apiResponse.status} · {apiResponse.durationMs} ms
                  </div>
                  <pre className="text-slate-200 whitespace-pre-wrap">{apiResponse.body}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Compiled Bundle Artifacts Breakdown */}
      {workspace.artifacts.length > 0 && (
        <div className="border border-slate-800 bg-[#111827] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Compiled Output Artifacts ({workspace.outputDirRelative})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
                {workspace.artifacts.length} files · Total bundle footprint: {formatBytes(totalArtifactBytes)}
              </p>
            </div>
            <a
              href={`/api/workspaces/${workspace.id}/download?mode=dist`}
              className="h-9 px-3.5 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-800 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Production Bundle (.tar.gz)</span>
            </a>
          </div>

          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#0B0F17] text-slate-400 border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="py-2.5 px-5 font-medium">Artifact Path</th>
                  <th className="py-2.5 px-4 font-medium">Type</th>
                  <th className="py-2.5 px-5 font-medium text-right">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {workspace.artifacts.map((art) => (
                  <tr key={art.path} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-5 font-mono text-slate-200">{art.path}</td>
                    <td className="py-2.5 px-4 text-slate-400">{art.category}</td>
                    <td className="py-2.5 px-5 text-right font-mono tabular-nums text-slate-300">
                      {formatBytes(art.size)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
