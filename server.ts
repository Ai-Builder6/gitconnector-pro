import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as esbuild from 'esbuild';
import dotenv from 'dotenv';
import type {
  ApiServerState,
  BuildArtifact,
  ContactTicket,
  DatabaseSchemaSummary,
  DependencyItem,
  DetectedSchemaField,
  DetectedSchemaModel,
  DiffFileChange,
  EnvVarItem,
  FileEntry,
  GitHubBranchItem,
  GitHubPullRequestItem,
  GitHubRepoItem,
  GitHubUser,
  LanguageStat,
  NormalizationAction,
  SmokeProbeCheck,
  SmokeProbeReport,
  SubProjectInfo,
  UpgradeCategory,
  UpgradeItem,
  WorkspaceDetail,
  WorkspaceDiffReport,
  WorkspaceSummary,
} from './src/types.ts';

dotenv.config();

const PORT = 3000;
const WORKSPACES_ROOT = '/tmp/repoforge-workspaces';

interface InternalWorkspace extends WorkspaceDetail {
  rootDir: string;
  repoDir: string;
  outputDir?: string;
}

interface GitHubSession {
  sessionId: string;
  token: string;
  user: GitHubUser;
  createdAt: number;
}

const workspaces = new Map<string, InternalWorkspace>();
const sseClients = new Map<string, Set<Response>>();
const apiProcesses = new Map<string, ChildProcess>();
const githubSessions = new Map<string, GitHubSession>();
const pendingOAuthStates = new Map<string, { redirectUri: string; createdAt: number }>();
let lastActivePreviewId: string | null = null;

const UPGRADES_FILE = path.join(WORKSPACES_ROOT, 'suggested-upgrades.json');
const CONTACT_FILE = path.join(WORKSPACES_ROOT, 'contact-tickets.json');

const SEEDED_UPGRADES: UpgradeItem[] = [
  {
    id: 'gh-webhook-autorebuild',
    title: 'GitHub Push & PR Webhook Auto-Builder',
    category: 'Automation',
    summary:
      'Receive signed GitHub push and pull_request webhooks so imported workspaces automatically pull commits, re-run builds, and refresh Smoke Probe checks.',
    scope: 'Express /api/webhooks/github + HMAC SHA-256 verification',
    impact: 'High Impact',
    votes: 42,
    prompt:
      'Add a /api/webhooks/github endpoint with X-Hub-Signature-256 verification that triggers git pull and automatic workspace rebuilds on push events.',
  },
  {
    id: 'commit-and-open-pr',
    title: 'Commit Edits & Open GitHub Pull Request from Studio',
    category: 'Developer UX',
    summary:
      'Push live code and package.json fixes made inside RepoForge Studio directly to a new GitHub branch and open a Pull Request via OAuth.',
    scope: 'Git branch/commit/push + GitHub Pulls REST API',
    impact: 'High Impact',
    votes: 38,
    prompt:
      'Add a Commit & Open PR modal in Code & Env that commits modified workspace files to a new branch and opens a Pull Request using the connected GitHub OAuth session.',
  },
  {
    id: 'cloud-run-dockerfile-pack',
    title: 'One-Click Cloud Run Dockerfile & Deploy Bundle',
    category: 'Cloud & Data',
    summary:
      'Generate a production multi-stage Node 22 Dockerfile, .dockerignore, and Cloud Run deploy script tailored to the detected framework and build output.',
    scope: 'Dockerfile generator + downloadable deploy bundle',
    impact: 'Core Add-On',
    votes: 31,
    prompt:
      'Add a Cloud Run Export generator that writes a multi-stage Node 22 Dockerfile and cloudbuild.yaml into the workspace based on its detected build output.',
  },
  {
    id: 'visual-snapshot-diff',
    title: 'Automated Headless Browser Visual Regression Diff',
    category: 'Build & Runtime',
    summary:
      'Capture desktop and mobile screenshots of Base vs. Head branch builds and highlight layout shifts alongside bundle size deltas.',
    scope: 'Branch Diff Runner + viewport screenshot comparison',
    impact: 'High Impact',
    votes: 29,
    prompt:
      'Enhance Branch Diff Runner with automated viewport rendering checks and DOM metric comparison between Base and Head previews.',
  },
  {
    id: 'npm-security-license-audit',
    title: 'Dependency Vulnerability & OSS License Scanner',
    category: 'Build & Runtime',
    summary:
      'Run non-blocking npm audit and license classification during workspace inspection to flag CVEs, deprecated packages, and copyleft licenses.',
    scope: 'Overview Panel + /api/workspaces/:id/audit endpoint',
    impact: 'Quick Win',
    votes: 24,
    prompt:
      'Add an npm audit and SPDX license scanner endpoint /api/workspaces/:id/audit and surface vulnerability counts in the Overview dependency table.',
  },
  {
    id: 'live-collab-review-notes',
    title: 'Pinpointed Preview Review Notes & Share Links',
    category: 'Developer UX',
    summary:
      'Drop coordinate-pinned QA comments onto any route inside Live Preview and persist team review checklists to Firestore.',
    scope: 'Live Preview overlay + Firestore review notes sync',
    impact: 'Core Add-On',
    votes: 21,
    prompt:
      'Add an interactive QA annotation layer on Live Preview that saves route-specific review notes to Firestore.',
  },
  {
    id: 'openapi-swagger-explorer',
    title: 'Auto-Discovered Express / OpenAPI Route Explorer',
    category: 'Developer UX',
    summary:
      'Parse Express, Fastify, and Hono router files in the cloned repo to pre-populate all REST endpoints inside the Sandbox API Tester.',
    scope: 'Static AST route scanner + Build & API HTTP client',
    impact: 'Quick Win',
    votes: 19,
    prompt:
      'Scan cloned backend files for app.get/post/put/delete route patterns and list clickable endpoint presets in the Sandbox API Subprocess tester.',
  },
  {
    id: 'scheduled-nightly-smoke',
    title: 'Scheduled Branch Health Matrix & Exportable Badge',
    category: 'Automation',
    summary:
      'Generate embeddable SVG build-health badges for README files and run scheduled smoke probes across multiple release branches.',
    scope: 'SVG badge endpoint /api/workspaces/:id/badge.svg',
    impact: 'Quick Win',
    votes: 16,
    prompt:
      'Create a dynamic SVG build & smoke-probe status badge endpoint /api/workspaces/:id/badge.svg with markdown copy snippets.',
  },
];

function loadUpgradesStore(): UpgradeItem[] {
  ensureWorkspacesRoot();
  try {
    if (fs.existsSync(UPGRADES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(UPGRADES_FILE, 'utf-8')) as UpgradeItem[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Fallback to seed
  }
  fs.writeFileSync(UPGRADES_FILE, JSON.stringify(SEEDED_UPGRADES, null, 2), 'utf-8');
  return [...SEEDED_UPGRADES];
}

function saveUpgradesStore(items: UpgradeItem[]) {
  ensureWorkspacesRoot();
  try {
    fs.writeFileSync(UPGRADES_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch {
    // Ignore transient /tmp write issues
  }
}

function loadContactStore(): ContactTicket[] {
  ensureWorkspacesRoot();
  try {
    if (fs.existsSync(CONTACT_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONTACT_FILE, 'utf-8')) as ContactTicket[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore
  }
  return [];
}

function saveContactStore(tickets: ContactTicket[]) {
  ensureWorkspacesRoot();
  try {
    fs.writeFileSync(CONTACT_FILE, JSON.stringify(tickets, null, 2), 'utf-8');
  } catch {
    // Ignore
  }
}

function ensureWorkspacesRoot() {
  fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      const k = part.slice(0, eq).trim();
      const v = decodeURIComponent(part.slice(eq + 1).trim());
      out[k] = v;
    }
  }
  return out;
}

function getGitHubSession(req: Request): GitHubSession | null {
  const headerSid = req.headers['x-rf-session'];
  if (typeof headerSid === 'string' && githubSessions.has(headerSid)) {
    return githubSessions.get(headerSid) || null;
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.rf_gh_session && githubSessions.has(cookies.rf_gh_session)) {
    return githubSessions.get(cookies.rf_gh_session) || null;
  }
  return null;
}

function resolveCallbackUrl(clientOrigin?: string): string {
  if (
    clientOrigin &&
    (clientOrigin.endsWith('.run.app') || clientOrigin.startsWith('http://localhost:'))
  ) {
    return `${clientOrigin.replace(/\/+$/, '')}/auth/callback`;
  }
  const appUrl = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
  return `${appUrl}/auth/callback`;
}

function broadcastLog(workspaceId: string, line: string) {
  const ws = workspaces.get(workspaceId);
  if (!ws) return;
  const timestamp = new Date().toISOString().slice(11, 19);
  const formatted = `[${timestamp}] ${line}`;
  ws.logs.push(formatted);
  if (ws.logs.length > 1500) {
    ws.logs.splice(0, ws.logs.length - 1500);
  }

  const clients = sseClients.get(workspaceId);
  if (clients) {
    const payload = JSON.stringify({ type: 'log', line: formatted, status: ws.status });
    for (const res of clients) {
      res.write(`data: ${payload}\n\n`);
    }
  }
}

function broadcastApiLog(workspaceId: string, line: string) {
  const ws = workspaces.get(workspaceId);
  if (!ws) return;
  const timestamp = new Date().toISOString().slice(11, 19);
  const formatted = `[${timestamp}] ${line}`;
  ws.apiServer.logs.push(formatted);
  if (ws.apiServer.logs.length > 600) {
    ws.apiServer.logs.splice(0, ws.apiServer.logs.length - 600);
  }
  const clients = sseClients.get(workspaceId);
  if (clients) {
    const payload = JSON.stringify({
      type: 'api-log',
      line: formatted,
      apiServer: ws.apiServer,
    });
    for (const res of clients) {
      res.write(`data: ${payload}\n\n`);
    }
  }
}

function broadcastStatus(workspaceId: string) {
  const ws = workspaces.get(workspaceId);
  if (!ws) return;
  const clients = sseClients.get(workspaceId);
  if (clients) {
    const payload = JSON.stringify({
      type: 'status',
      status: ws.status,
      previewUrl: ws.previewUrl,
      buildDurationMs: ws.buildDurationMs,
      errorMessage: ws.errorMessage,
      smokeProbe: ws.smokeProbe,
      apiServer: ws.apiServer,
    });
    for (const res of clients) {
      res.write(`data: ${payload}\n\n`);
    }
  }
}

async function saveWorkspaceMeta(ws: InternalWorkspace) {
  try {
    const metaPath = path.join(ws.rootDir, 'workspace-meta.json');
    await fsp.writeFile(metaPath, JSON.stringify(ws, null, 2), 'utf-8');
  } catch {
    // Ignore transient /tmp errors
  }
}

async function rehydrateWorkspaces() {
  ensureWorkspacesRoot();
  try {
    const entries = await fsp.readdir(WORKSPACES_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(WORKSPACES_ROOT, entry.name, 'workspace-meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          const raw = await fsp.readFile(metaPath, 'utf-8');
          const parsed = JSON.parse(raw) as InternalWorkspace;
          if (parsed && parsed.id && fs.existsSync(parsed.repoDir)) {
            if (parsed.status === 'building' || parsed.status === 'cloning') {
              parsed.status = 'ready';
            }
            if (!parsed.databaseSchema) {
              parsed.databaseSchema = { detected: false, ormType: 'None', sourceFiles: [], models: [] };
            }
            if (!parsed.apiServer) {
              parsed.apiServer = {
                capable: false,
                detectedEntry: null,
                startCommand: null,
                status: 'stopped',
                logs: [],
              };
            } else {
              parsed.apiServer.status = 'stopped';
            }
            workspaces.set(parsed.id, parsed);
          }
        } catch {
          // Skip invalid metadata
        }
      }
    }
  } catch {
    // Empty directory
  }
}

interface ParsedGitHubTarget {
  owner: string;
  repoName: string;
  cloneUrl: string;
  canonicalUrl: string;
  branch?: string;
  subPath: string;
}

function parseGitHubInput(
  rawInput: string,
  explicitBranch?: string,
  explicitSubPath?: string
): ParsedGitHubTarget | null {
  let cleaned = rawInput.trim();
  if (!cleaned) return null;

  cleaned = cleaned.replace(/^git\+/, '');
  if (cleaned.startsWith('git@github.com:')) {
    cleaned = 'https://github.com/' + cleaned.slice('git@github.com:'.length);
  } else if (cleaned.startsWith('github.com/')) {
    cleaned = 'https://' + cleaned;
  } else if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://github.com/' + cleaned.replace(/^\/+/, '');
  }

  let urlObj: URL;
  try {
    urlObj = new URL(cleaned);
  } catch {
    return null;
  }

  if (urlObj.hostname !== 'github.com' && urlObj.hostname !== 'www.github.com') {
    return null;
  }

  const segments = urlObj.pathname
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean);

  if (segments.length < 2) return null;

  const owner = segments[0];
  const repoName = segments[1].replace(/\.git$/, '');
  if (!owner || !repoName) return null;

  let branch = explicitBranch?.trim() || undefined;
  let subPath = explicitSubPath?.trim().replace(/^\/+|\/+$/g, '') || '';

  if ((segments[2] === 'tree' || segments[2] === 'blob') && segments.length >= 4) {
    if (!branch) {
      branch = segments[3];
    }
    if (!subPath && segments.length > 4) {
      const remainder = segments.slice(4);
      if (segments[2] === 'blob') {
        remainder.pop();
      }
      subPath = remainder.join('/');
    }
  }

  return {
    owner,
    repoName,
    cloneUrl: `https://github.com/${owner}/${repoName}.git`,
    canonicalUrl: `https://github.com/${owner}/${repoName}`,
    branch,
    subPath,
  };
}

function runCommandStreaming(
  cmd: string,
  args: string[],
  cwd: string,
  envOverrides: Record<string, string>,
  onLine?: (line: string) => void,
  timeoutMs = 180_000
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        CI: 'false',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        BROWSER: 'none',
        ...envOverrides,
      },
    });

    let stdout = '';
    let stderr = '';
    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        onLine?.(`Command timed out after ${Math.round(timeoutMs / 1000)}s — terminating process.`);
        child.kill('SIGKILL');
        resolve({ code: 124, stdout, stderr: stderr + '\nTimed out' });
      }
    }, timeoutMs);

    const flushLines = (chunkStr: string, isErr: boolean) => {
      if (isErr) {
        stderr += chunkStr;
        stderrBuf += chunkStr;
        const lines = stderrBuf.split(/\r?\n/);
        stderrBuf = lines.pop() ?? '';
        for (const l of lines) {
          if (l.trim()) onLine?.(l);
        }
      } else {
        stdout += chunkStr;
        stdoutBuf += chunkStr;
        const lines = stdoutBuf.split(/\r?\n/);
        stdoutBuf = lines.pop() ?? '';
        for (const l of lines) {
          if (l.trim()) onLine?.(l);
        }
      }
    };

    child.stdout.on('data', (d: Buffer) => flushLines(d.toString('utf-8'), false));
    child.stderr.on('data', (d: Buffer) => flushLines(d.toString('utf-8'), true));

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        onLine?.(`Process error: ${err.message}`);
        resolve({ code: 1, stdout, stderr: err.message });
      }
    });

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (stdoutBuf.trim()) onLine?.(stdoutBuf.trim());
        if (stderrBuf.trim()) onLine?.(stderrBuf.trim());
        resolve({ code: code ?? 0, stdout, stderr });
      }
    });
  });
}

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.repoforge-dist',
  'bower_components',
  'vendor',
  'coverage',
  '.turbo',
  '.cache',
]);

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.astro': 'Astro',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sass': 'Sass',
  '.less': 'Less',
  '.html': 'HTML',
  '.json': 'JSON',
  '.md': 'Markdown',
  '.prisma': 'Prisma',
  '.sql': 'SQL',
  '.py': 'Python',
  '.go': 'Go',
  '.rs': 'Rust',
};

function parsePrismaModels(content: string, sourceFile: string): DetectedSchemaModel[] {
  const models: DetectedSchemaModel[] = [];
  const modelRegex = /model\s+([A-Za-z0-9_]+)\s*\{([^}]*)\}/g;
  for (const match of content.matchAll(modelRegex)) {
    const modelName = match[1];
    const body = match[2];
    const fields: DetectedSchemaField[] = [];
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const tokens = line.split(/\s+/);
      if (tokens.length >= 2) {
        const fname = tokens[0];
        const ftype = tokens[1];
        fields.push({
          name: fname,
          type: ftype.replace(/\?$/, ''),
          isOptional: ftype.endsWith('?'),
          isPrimary: line.includes('@id'),
        });
      }
    }
    models.push({ name: modelName, sourceFile, orm: 'Prisma', fields: fields.slice(0, 25) });
  }
  return models;
}

function parseDrizzleModels(content: string, sourceFile: string): DetectedSchemaModel[] {
  const models: DetectedSchemaModel[] = [];
  const tableRegex = /(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*,\s*\{([\s\S]*?)\}\s*(?:,|\))/g;
  for (const match of content.matchAll(tableRegex)) {
    const tableName = match[1];
    const body = match[2];
    const fields: DetectedSchemaField[] = [];
    const colRegex = /([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_]+)\s*\(/g;
    for (const cm of body.matchAll(colRegex)) {
      const slice = body.slice(cm.index || 0, (cm.index || 0) + 120);
      fields.push({
        name: cm[1],
        type: cm[2],
        isPrimary: slice.includes('primaryKey'),
        isOptional: !slice.includes('notNull') && !slice.includes('primaryKey'),
      });
    }
    models.push({ name: tableName, sourceFile, orm: 'Drizzle', fields: fields.slice(0, 25) });
  }
  return models;
}

function parseSqlModels(content: string, sourceFile: string): DetectedSchemaModel[] {
  const models: DetectedSchemaModel[] = [];
  const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z0-9_]+)["`]?\s*\(([\s\S]*?)\);/gi;
  for (const match of content.matchAll(createRegex)) {
    const tableName = match[1];
    const body = match[2];
    const fields: DetectedSchemaField[] = [];
    for (const rawLine of body.split(',')) {
      const line = rawLine.trim();
      if (!line || /^(PRIMARY|FOREIGN|UNIQUE|CONSTRAINT|CHECK|KEY|INDEX)\b/i.test(line)) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        fields.push({
          name: parts[0].replace(/["`]/g, ''),
          type: parts[1].toUpperCase(),
          isPrimary: /PRIMARY\s+KEY/i.test(line),
          isOptional: !/NOT\s+NULL/i.test(line),
        });
      }
    }
    if (fields.length > 0) {
      models.push({ name: tableName, sourceFile, orm: 'SQL', fields: fields.slice(0, 25) });
    }
  }
  return models;
}

function detectApiServerCapability(
  pkg: Record<string, unknown> | null,
  targetDir: string
): ApiServerState {
  const deps: Record<string, string> = {
    ...((pkg?.dependencies as Record<string, string>) || {}),
    ...((pkg?.devDependencies as Record<string, string>) || {}),
  };
  const scripts = ((pkg?.scripts as Record<string, string>) || {});

  const entryCandidates = [
    'server.ts',
    'server.js',
    'server.mjs',
    'src/server.ts',
    'src/server.js',
    'app.ts',
    'app.js',
    'api/index.ts',
    'api/index.js',
    'backend/server.js',
    'src/index.ts',
    'src/index.js',
    'index.ts',
    'index.js',
  ];

  const hasBackendDep =
    'express' in deps ||
    'fastify' in deps ||
    'koa' in deps ||
    'hono' in deps ||
    '@hono/node-server' in deps ||
    '@nestjs/core' in deps ||
    'polka' in deps;

  let detectedEntry: string | null = null;
  for (const cand of entryCandidates) {
    const abs = path.join(targetDir, cand);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      // Avoid picking pure frontend src/index.tsx or React DOM entrypoints
      try {
        const text = fs.readFileSync(abs, 'utf-8').slice(0, 4000);
        if (
          text.includes('express(') ||
          text.includes('fastify(') ||
          text.includes('createServer(') ||
          text.includes('.listen(') ||
          text.includes('Hono(') ||
          cand.startsWith('server.') ||
          cand.startsWith('src/server.')
        ) {
          detectedEntry = cand;
          break;
        }
      } catch {
        // Ignore
      }
    }
  }

  let startCommand: string | null = null;
  if (detectedEntry) {
    startCommand = `npx tsx ${detectedEntry}`;
  } else if (
    hasBackendDep &&
    scripts.start &&
    !scripts.start.includes('react-scripts') &&
    !scripts.start.includes('vite')
  ) {
    startCommand = 'npm start';
  }

  return {
    capable: Boolean(detectedEntry || startCommand),
    detectedEntry,
    startCommand,
    status: 'stopped',
    logs: [],
  };
}

function detectFrameworkFromPkg(
  pkg: Record<string, unknown> | null,
  dirPath: string
): { framework: string; buildStrategy: string } {
  const deps: Record<string, string> = {
    ...((pkg?.dependencies as Record<string, string>) || {}),
    ...((pkg?.devDependencies as Record<string, string>) || {}),
  };
  const scripts = ((pkg?.scripts as Record<string, string>) || {});

  const hasIndexHtml =
    fs.existsSync(path.join(dirPath, 'index.html')) ||
    fs.existsSync(path.join(dirPath, 'public', 'index.html'));

  if ('next' in deps) return { framework: 'Next.js', buildStrategy: 'npm run build' };
  if ('@sveltejs/kit' in deps) return { framework: 'SvelteKit', buildStrategy: 'vite build' };
  if ('svelte' in deps) {
    return { framework: 'Svelte', buildStrategy: scripts.build ? 'npm run build' : 'Rollup / Vite Bundle' };
  }
  if ('nuxt' in deps) return { framework: 'Nuxt', buildStrategy: 'npm run build' };
  if ('astro' in deps) return { framework: 'Astro', buildStrategy: 'astro build' };
  if ('@angular/core' in deps) return { framework: 'Angular', buildStrategy: 'npm run build' };
  if ('vite' in deps) {
    if ('vue' in deps) return { framework: 'Vite + Vue', buildStrategy: 'vite build --base=./' };
    if ('react' in deps || 'preact' in deps) {
      return { framework: 'Vite + React', buildStrategy: 'vite build --base=./' };
    }
    return { framework: 'Vite Web App', buildStrategy: 'vite build --base=./' };
  }
  if ('react-scripts' in deps) {
    return { framework: 'Create React App', buildStrategy: 'PUBLIC_URL=. react-scripts build' };
  }
  if ('vue' in deps) {
    return { framework: 'Vue SPA', buildStrategy: scripts.build ? 'npm run build' : 'esbuild / Static' };
  }
  if ('react' in deps) {
    return {
      framework: 'React Application',
      buildStrategy: scripts.build ? 'npm run build' : 'esbuild JSX/TSX Bundler',
    };
  }
  if ('express' in deps || 'fastify' in deps || 'koa' in deps || 'hono' in deps) {
    return {
      framework: hasIndexHtml ? 'Full-Stack Node + Web' : 'Node.js API Server',
      buildStrategy: scripts.build ? 'npm run build + API Proxy' : 'Sandbox API Subprocess Proxy',
    };
  }
  if (scripts.build) {
    return { framework: 'Node.js / Bundled Web', buildStrategy: 'npm run build' };
  }
  if (hasIndexHtml) {
    return {
      framework: pkg ? 'Static HTML + npm Assets' : 'Static HTML / CSS / JS',
      buildStrategy: pkg ? 'npm install + Static Serve' : 'Direct Static Serve',
    };
  }
  return { framework: pkg ? 'Node.js Package' : 'Generic Repository', buildStrategy: 'Source & Asset Inspection' };
}

async function discoverSubProjects(repoDir: string): Promise<SubProjectInfo[]> {
  const results: SubProjectInfo[] = [];

  const inspectDir = async (relDir: string, depth: number) => {
    const absDir = relDir ? path.join(repoDir, relDir) : repoDir;
    const pkgPath = path.join(absDir, 'package.json');
    const htmlPath = path.join(absDir, 'index.html');
    const pubHtmlPath = path.join(absDir, 'public', 'index.html');

    let pkg: Record<string, unknown> | null = null;
    if (fs.existsSync(pkgPath)) {
      try {
        pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf-8'));
      } catch {
        pkg = null;
      }
    }

    const hasIndexHtml = fs.existsSync(htmlPath) || fs.existsSync(pubHtmlPath);
    const scripts = (pkg?.scripts as Record<string, string>) || {};
    const depsCount =
      Object.keys((pkg?.dependencies as Record<string, string>) || {}).length +
      Object.keys((pkg?.devDependencies as Record<string, string>) || {}).length;

    if (relDir === '' || pkg !== null || hasIndexHtml) {
      const { framework } = detectFrameworkFromPkg(pkg, absDir);
      results.push({
        subPath: relDir,
        label: relDir || '(Repository Root)',
        framework,
        hasBuildScript: Boolean(scripts.build),
        hasIndexHtml,
        dependencyCount: depsCount,
      });
    }

    if (depth >= 2) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = await fsp.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const lower = entry.name.toLowerCase();
      if (
        lower === 'test' ||
        lower === 'tests' ||
        lower === '__tests__' ||
        lower === 'cypress' ||
        lower === 'docs' ||
        lower === 'scripts' ||
        lower === 'tooling'
      ) {
        continue;
      }
      const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
      await inspectDir(childRel, depth + 1);
    }
  };

  await inspectDir('', 0);
  return results.slice(0, 60);
}

async function analyzeWorkspaceTarget(
  repoDir: string,
  targetSubPath: string
): Promise<{
  framework: string;
  packageManager: string;
  buildStrategy: string;
  totalFiles: number;
  totalBytes: number;
  scripts: Record<string, string>;
  dependencies: DependencyItem[];
  normalizations: NormalizationAction[];
  files: FileEntry[];
  languages: LanguageStat[];
  envVars: EnvVarItem[];
  readme: string;
  databaseSchema: DatabaseSchemaSummary;
  apiServer: ApiServerState;
}> {
  const targetDir = targetSubPath ? path.join(repoDir, targetSubPath) : repoDir;
  const files: FileEntry[] = [];
  const langMap = new Map<string, { files: number; bytes: number }>();
  const detectedEnvKeys = new Set<string>();
  const schemaModels: DetectedSchemaModel[] = [];
  const schemaFiles = new Set<string>();
  let totalFiles = 0;
  let totalBytes = 0;

  const walk = async (absCurrent: string, relFromRepo: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = await fsp.readdir(absCurrent, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name) || entry.name === '.DS_Store') continue;

      const absChild = path.join(absCurrent, entry.name);
      const relChild = relFromRepo ? `${relFromRepo}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (files.length < 800) {
          files.push({ path: relChild, type: 'dir', size: 0 });
        }
        await walk(absChild, relChild);
      } else if (entry.isFile()) {
        let size = 0;
        try {
          const st = await fsp.stat(absChild);
          size = st.size;
        } catch {
          size = 0;
        }
        totalFiles += 1;
        totalBytes += size;
        if (files.length < 800) {
          files.push({ path: relChild, type: 'file', size });
        }

        const ext = path.extname(entry.name).toLowerCase();
        const lang = EXT_TO_LANG[ext];
        if (lang) {
          const prev = langMap.get(lang) || { files: 0, bytes: 0 };
          prev.files += 1;
          prev.bytes += size;
          langMap.set(lang, prev);
        }

        if (size > 0 && size < 180_000) {
          if (ext === '.prisma') {
            try {
              const content = await fsp.readFile(absChild, 'utf-8');
              const parsedModels = parsePrismaModels(content, relChild);
              if (parsedModels.length > 0) {
                schemaFiles.add(relChild);
                schemaModels.push(...parsedModels);
              }
            } catch {
              // Ignore
            }
          } else if (ext === '.sql') {
            try {
              const content = await fsp.readFile(absChild, 'utf-8');
              const parsedModels = parseSqlModels(content, relChild);
              if (parsedModels.length > 0) {
                schemaFiles.add(relChild);
                schemaModels.push(...parsedModels);
              }
            } catch {
              // Ignore
            }
          } else if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx' || ext === '.mjs') {
            try {
              const content = await fsp.readFile(absChild, 'utf-8');
              const procMatches = content.matchAll(/process\.env\.([A-Z][A-Z0-9_]{2,})/g);
              for (const m of procMatches) {
                if (m[1] !== 'NODE_ENV' && m[1] !== 'PUBLIC_URL' && m[1] !== 'CI' && m[1] !== 'PORT') {
                  detectedEnvKeys.add(m[1]);
                }
              }
              const viteMatches = content.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g);
              for (const m of viteMatches) {
                detectedEnvKeys.add(m[1]);
              }

              if (
                content.includes('pgTable') ||
                content.includes('mysqlTable') ||
                content.includes('sqliteTable')
              ) {
                const parsedModels = parseDrizzleModels(content, relChild);
                if (parsedModels.length > 0) {
                  schemaFiles.add(relChild);
                  schemaModels.push(...parsedModels);
                }
              }
            } catch {
              // Ignore
            }
          }
        }
      }
    }
  };

  await walk(repoDir, '');

  const pkgPath = path.join(targetDir, 'package.json');
  let pkg: Record<string, unknown> | null = null;
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf-8'));
    } catch {
      pkg = null;
    }
  }

  let packageManager = 'npm';
  const normalizations: NormalizationAction[] = [];

  if (
    fs.existsSync(path.join(targetDir, 'pnpm-lock.yaml')) ||
    fs.existsSync(path.join(repoDir, 'pnpm-lock.yaml'))
  ) {
    packageManager = 'pnpm → npm';
    normalizations.push({
      id: 'pnpm-lock',
      title: 'Convert pnpm lockfile to npm',
      detail: 'Removes pnpm-lock.yaml and workspace:* protocol specifiers prior to npm install.',
      severity: 'info',
    });
  } else if (
    fs.existsSync(path.join(targetDir, 'yarn.lock')) ||
    fs.existsSync(path.join(repoDir, 'yarn.lock'))
  ) {
    packageManager = 'yarn → npm';
    normalizations.push({
      id: 'yarn-lock',
      title: 'Normalize Yarn scripts & lockfile',
      detail: 'Replaces yarn invocations in build scripts with npm run equivalents.',
      severity: 'info',
    });
  } else if (
    fs.existsSync(path.join(targetDir, 'bun.lockb')) ||
    fs.existsSync(path.join(targetDir, 'bun.lock'))
  ) {
    packageManager = 'bun → npm';
    normalizations.push({
      id: 'bun-lock',
      title: 'Normalize Bun lockfile for Node 22',
      detail: 'Strips bun lockfiles and installs dependencies with npm.',
      severity: 'info',
    });
  } else if (!pkg) {
    packageManager = 'None (Static)';
  }

  const { framework, buildStrategy } = detectFrameworkFromPkg(pkg, targetDir);
  const apiServer = detectApiServerCapability(pkg, targetDir);

  if (apiServer.capable) {
    normalizations.push({
      id: 'api-proxy',
      title: `Backend server entrypoint detected (${apiServer.detectedEntry || 'npm start'})`,
      detail: 'Can be spawned in an isolated subprocess and queried via /sandbox-api/:id/* in Build & API.',
      severity: 'info',
    });
  }

  const scripts: Record<string, string> = {};
  if (pkg?.scripts && typeof pkg.scripts === 'object') {
    for (const [k, v] of Object.entries(pkg.scripts as Record<string, unknown>)) {
      if (typeof v === 'string') scripts[k] = v;
    }
  }

  const NATIVE_NOTES: Record<string, string> = {
    bcrypt: 'Auto-swapped to pure-JS bcryptjs during normalization',
    'node-sass': 'Auto-swapped to Dart sass during normalization',
    'better-sqlite3': 'Native C++ addon — stripped if gyp fails',
    canvas: 'Native Cairo addon — optional strip recommended',
    puppeteer: 'Headless browser binary — skipped in container build',
    prisma: 'Database ORM — models parsed in Schema Bridge below',
    '@prisma/client': 'Database client — models parsed in Schema Bridge below',
    'drizzle-orm': 'Drizzle ORM — tables parsed in Schema Bridge below',
    mongoose: 'MongoDB ODM — configure MONGODB_URI in Env Config',
    pg: 'PostgreSQL driver — configure DATABASE_URL in Env Config',
  };

  const dependencies: DependencyItem[] = [];
  for (const kind of ['dependencies', 'devDependencies'] as const) {
    const depObj = pkg?.[kind] as Record<string, unknown> | undefined;
    if (!depObj || typeof depObj !== 'object') continue;
    for (const [name, version] of Object.entries(depObj)) {
      const note = NATIVE_NOTES[name];
      if (note && (name === 'bcrypt' || name === 'node-sass' || name === 'better-sqlite3')) {
        normalizations.push({
          id: `dep-${kind}-${name}`,
          title: `Native package detected: ${name}`,
          detail: note,
          severity: 'warning',
        });
      }
      dependencies.push({
        name,
        version: String(version),
        kind: kind === 'dependencies' ? 'runtime' : 'dev',
        note,
      });
    }
  }

  normalizations.push({
    id: 'relative-base',
    title: 'Rewrite asset base paths & run post-build Smoke Prober',
    detail: 'Injects relative asset resolution and verifies HTTP 200 bundle integrity automatically after every build.',
    severity: 'info',
  });

  const envVars: EnvVarItem[] = [];
  const seenKeys = new Set<string>();
  const envExampleCandidates = [
    path.join(targetDir, '.env.example'),
    path.join(targetDir, '.env.sample'),
    path.join(repoDir, '.env.example'),
  ];

  for (const envCandidate of envExampleCandidates) {
    if (fs.existsSync(envCandidate)) {
      try {
        const rawEnv = await fsp.readFile(envCandidate, 'utf-8');
        for (const line of rawEnv.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
            if (key && !seenKeys.has(key)) {
              seenKeys.add(key);
              envVars.push({ key, value: val, source: 'example' });
            }
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  for (const key of detectedEnvKeys) {
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      envVars.push({ key, value: '', source: 'detected' });
    }
  }

  let readme = '';
  for (const candidate of [
    path.join(targetDir, 'README.md'),
    path.join(targetDir, 'readme.md'),
    path.join(repoDir, 'README.md'),
    path.join(repoDir, 'readme.md'),
  ]) {
    if (fs.existsSync(candidate)) {
      try {
        readme = await fsp.readFile(candidate, 'utf-8');
        break;
      } catch {
        // Ignore
      }
    }
  }
  if (!readme) {
    readme = `# ${path.basename(repoDir)}\n\nNo README.md file was found in this repository.`;
  }

  const languages: LanguageStat[] = Array.from(langMap.entries())
    .map(([language, stat]) => ({ language, files: stat.files, bytes: stat.bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  const ormSet = new Set(schemaModels.map((m) => m.orm));
  const databaseSchema: DatabaseSchemaSummary = {
    detected: schemaModels.length > 0,
    ormType: schemaModels.length > 0 ? Array.from(ormSet).join(' + ') : 'None',
    sourceFiles: Array.from(schemaFiles),
    models: schemaModels.slice(0, 30),
  };

  return {
    framework,
    packageManager,
    buildStrategy,
    totalFiles,
    totalBytes,
    scripts,
    dependencies,
    normalizations,
    files,
    languages,
    envVars,
    readme,
    databaseSchema,
    apiServer,
  };
}

async function normalizePackageForBuild(targetDir: string, workspaceId: string) {
  const lockFiles = ['pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', '.npmrc', '.yarnrc', '.yarnrc.yml'];
  for (const lf of lockFiles) {
    const lfPath = path.join(targetDir, lf);
    if (fs.existsSync(lfPath)) {
      await fsp.rm(lfPath, { force: true });
      broadcastLog(workspaceId, `Removed ${lf} to standardize on npm.`);
    }
  }

  const pkgPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  try {
    const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf-8')) as Record<string, unknown>;
    let modified = false;

    if ('packageManager' in pkg) {
      delete pkg.packageManager;
      modified = true;
    }
    if ('engines' in pkg) {
      delete pkg.engines;
      modified = true;
    }

    for (const field of ['dependencies', 'devDependencies'] as const) {
      const depObj = pkg[field] as Record<string, string> | undefined;
      if (!depObj || typeof depObj !== 'object') continue;

      if ('bcrypt' in depObj) {
        delete depObj.bcrypt;
        depObj.bcryptjs = '^2.4.3';
        modified = true;
        broadcastLog(workspaceId, `Swapped native 'bcrypt' -> 'bcryptjs' in ${field}.`);
      }
      if ('node-sass' in depObj) {
        delete depObj['node-sass'];
        depObj.sass = '^1.77.0';
        modified = true;
        broadcastLog(workspaceId, `Swapped 'node-sass' -> 'sass' in ${field}.`);
      }
      for (const [k, v] of Object.entries(depObj)) {
        if (typeof v === 'string' && (v.startsWith('workspace:') || v.startsWith('catalog:'))) {
          depObj[k] = '*';
          modified = true;
        }
      }
    }

    if (pkg.scripts && typeof pkg.scripts === 'object') {
      const scripts = pkg.scripts as Record<string, string>;
      if (scripts.preinstall && scripts.preinstall.includes('only-allow')) {
        delete scripts.preinstall;
        modified = true;
      }
      for (const [k, v] of Object.entries(scripts)) {
        if (typeof v === 'string' && (v.includes('pnpm ') || v.includes('yarn '))) {
          scripts[k] = v
            .replace(/\bpnpm\s+run\b/g, 'npm run')
            .replace(/\bpnpm\s+exec\b/g, 'npx')
            .replace(/\byarn\s+run\b/g, 'npm run')
            .replace(/\byarn\s+([a-zA-Z0-9:_-]+)/g, 'npm run $1');
          modified = true;
        }
      }
    }

    if (modified) {
      await fsp.writeFile(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
      broadcastLog(workspaceId, `Updated package.json for Node.js 22 compatibility.`);
    }
  } catch (err) {
    broadcastLog(workspaceId, `Warning: Could not normalize package.json (${String(err)}).`);
  }
}

async function scanBuildArtifacts(outputDir: string): Promise<BuildArtifact[]> {
  const artifacts: BuildArtifact[] = [];
  const walk = async (dir: string, rel: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, childRel);
      } else if (entry.isFile()) {
        try {
          const st = await fsp.stat(abs);
          const ext = path.extname(entry.name).toLowerCase();
          let category: BuildArtifact['category'] = 'asset';
          if (ext === '.js' || ext === '.mjs' || ext === '.cjs') category = 'script';
          else if (ext === '.css') category = 'style';
          else if (ext === '.html') category = 'markup';
          artifacts.push({ path: childRel, size: st.size, category });
        } catch {
          // Skip
        }
      }
    }
  };
  await walk(outputDir, '');
  artifacts.sort((a, b) => b.size - a.size);
  return artifacts.slice(0, 100);
}

async function runPostBuildSmokeProbe(ws: InternalWorkspace): Promise<SmokeProbeReport> {
  const t0 = Date.now();
  const checks: SmokeProbeCheck[] = [];
  const missingAssets: string[] = [];
  let verifiedAssets = 0;
  let entryTitle = '(Untitled)';

  const targetDir = ws.targetSubPath ? path.join(ws.repoDir, ws.targetSubPath) : ws.repoDir;
  const outputDir = ws.outputDir || targetDir;
  const indexHtmlPath = path.join(outputDir, 'index.html');

  // Check 1: Entrypoint HTML Presence & Root Mount Verification
  if (fs.existsSync(indexHtmlPath)) {
    const rawHtml = await fsp.readFile(indexHtmlPath, 'utf-8');
    const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch?.[1]) {
      entryTitle = titleMatch[1].trim();
    }
    const hasBody = /<body[\s>]/i.test(rawHtml) || /<div\b/i.test(rawHtml) || /<script\b/i.test(rawHtml);
    checks.push({
      id: 'entry-html',
      name: 'Entrypoint HTML & DOM Structure',
      status: hasBody ? 'pass' : 'warn',
      detail: hasBody
        ? `Verified index.html (${Buffer.byteLength(rawHtml, 'utf-8')} B) · Title: "${entryTitle}"`
        : 'index.html exists but has minimal body markup.',
      metric: `${Date.now() - t0} ms`,
    });

    // Check 2: Local Asset Reference Resolution (scripts, stylesheets, images)
    const assetRefs = new Set<string>();
    for (const m of rawHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
      const ref = m[1].trim();
      if (
        !ref ||
        ref.startsWith('http://') ||
        ref.startsWith('https://') ||
        ref.startsWith('//') ||
        ref.startsWith('data:') ||
        ref.startsWith('#') ||
        ref.startsWith('mailto:')
      ) {
        continue;
      }
      const cleanRef = ref.split('?')[0].split('#')[0].replace(/^\.?\/+/, '');
      if (cleanRef) assetRefs.add(cleanRef);
    }

    for (const ref of assetRefs) {
      const inOut = path.resolve(outputDir, ref);
      const inTarget = path.resolve(targetDir, ref);
      if (
        (inOut.startsWith(path.resolve(outputDir)) && fs.existsSync(inOut)) ||
        (inTarget.startsWith(path.resolve(targetDir)) && fs.existsSync(inTarget))
      ) {
        verifiedAssets += 1;
      } else {
        // Ignore standard optional browser favicons/manifest if missing
        if (!/favicon|apple-touch-icon|manifest\.json/i.test(ref)) {
          missingAssets.push(ref);
        }
      }
    }

    checks.push({
      id: 'asset-integrity',
      name: 'Static Asset Resolution',
      status: missingAssets.length === 0 ? 'pass' : 'fail',
      detail:
        missingAssets.length === 0
          ? `All ${verifiedAssets} local script/stylesheet/media asset references resolved on disk.`
          : `${missingAssets.length} referenced asset(s) missing on disk: ${missingAssets.slice(0, 3).join(', ')}`,
      metric: `${verifiedAssets}/${verifiedAssets + missingAssets.length} resolved`,
    });
  } else {
    checks.push({
      id: 'entry-html',
      name: 'Entrypoint HTML & DOM Structure',
      status: 'fail',
      detail: 'No index.html found in compiled output directory.',
    });
  }

  // Check 3: Bundle Footprint & Chunk Size Health
  const totalJsBytes = ws.artifacts
    .filter((a) => a.category === 'script')
    .reduce((sum, a) => sum + a.size, 0);
  const totalCssBytes = ws.artifacts
    .filter((a) => a.category === 'style')
    .reduce((sum, a) => sum + a.size, 0);
  const largestJs = ws.artifacts.find((a) => a.category === 'script')?.size || 0;

  checks.push({
    id: 'bundle-budget',
    name: 'JavaScript & Stylesheet Footprint',
    status: largestJs > 1_200_000 ? 'warn' : 'pass',
    detail:
      largestJs > 1_200_000
        ? `Large unsplit JS bundle detected (${(largestJs / 1024).toFixed(1)} KB); consider code-splitting.`
        : `JS payload ${(totalJsBytes / 1024).toFixed(1)} KB · CSS payload ${(totalCssBytes / 1024).toFixed(1)} KB`,
    metric: `${((totalJsBytes + totalCssBytes) / 1024).toFixed(1)} KB`,
  });

  // Check 4: Environment Variable Completeness
  const missingEnvKeys = ws.envVars
    .filter((e) => !e.value.trim())
    .map((e) => e.key);

  checks.push({
    id: 'env-completeness',
    name: 'Environment Variable Readiness',
    status: missingEnvKeys.length === 0 ? 'pass' : 'warn',
    detail:
      missingEnvKeys.length === 0
        ? ws.envVars.length > 0
          ? `All ${ws.envVars.length} detected environment variable(s) have values assigned.`
          : 'Zero external environment variables required.'
        : `${missingEnvKeys.length} detected variable(s) have empty values: ${missingEnvKeys.slice(0, 4).join(', ')}`,
    metric: `${ws.envVars.length - missingEnvKeys.length}/${ws.envVars.length} set`,
  });

  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');

  return {
    ranAt: new Date().toISOString(),
    overallStatus: hasFail ? 'failed' : hasWarn ? 'degraded' : 'healthy',
    responseTimeMs: Math.max(1, Date.now() - t0),
    entryTitle,
    totalJsBytes,
    totalCssBytes,
    verifiedAssets,
    missingAssets,
    missingEnvKeys,
    checks,
  };
}

async function generateModuleSummaryHtml(ws: InternalWorkspace, targetDir: string, outDir: string) {
  await fsp.mkdir(outDir, { recursive: true });
  const scriptRows = Object.entries(ws.scripts)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #1e293b;font-family:monospace;color:#60a5fa">${k}</td><td style="padding:8px 12px;border-bottom:1px solid #1e293b;font-family:monospace;color:#cbd5e1">${v}</td></tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${ws.owner}/${ws.repoName} — Package Build Verification</title>
  <style>
    body { margin: 0; padding: 32px; background: #0f172a; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; }
    .container { max-width: 780px; margin: 0 auto; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { color: #94a3b8; font-size: 14px; margin: 0 0 24px; }
    table { width: 100%; border-collapse: collapse; background: #1e293b40; border: 1px solid #1e293b; border-radius: 8px; overflow: hidden; font-size: 13px; }
    th { text-align: left; padding: 10px 12px; background: #1e293b80; color: #94a3b8; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${ws.owner}/${ws.repoName} compiled successfully</h1>
    <p>This repository is a ${ws.framework} without a standalone browser HTML entrypoint. Dependencies were installed in <code>${path.basename(targetDir)}</code>. If this repository exposes an HTTP API, start it from the Build &amp; API tab.</p>
    <table>
      <thead><tr><th>Script</th><th>Command</th></tr></thead>
      <tbody>${scriptRows || '<tr><td colspan="2" style="padding:12px;color:#94a3b8">No npm scripts declared</td></tr>'}</tbody>
    </table>
  </div>
</body>
</html>`;
  await fsp.writeFile(path.join(outDir, 'index.html'), html, 'utf-8');
}

async function bundleFallbackWithEsbuild(
  targetDir: string,
  outDir: string,
  workspaceId: string
): Promise<boolean> {
  const entryCandidates = [
    'src/main.tsx',
    'src/index.tsx',
    'src/main.jsx',
    'src/index.jsx',
    'src/main.ts',
    'src/index.ts',
    'src/main.js',
    'src/index.js',
    'index.tsx',
    'index.jsx',
  ];

  let foundEntry: string | null = null;
  for (const c of entryCandidates) {
    if (fs.existsSync(path.join(targetDir, c))) {
      foundEntry = path.join(targetDir, c);
      break;
    }
  }

  if (!foundEntry) return false;

  broadcastLog(workspaceId, `Bundling ${path.relative(targetDir, foundEntry)} with esbuild...`);
  await fsp.mkdir(outDir, { recursive: true });

  try {
    await esbuild.build({
      entryPoints: [foundEntry],
      bundle: true,
      outfile: path.join(outDir, 'bundle.js'),
      format: 'iife',
      platform: 'browser',
      target: ['es2020'],
      jsx: 'automatic',
      loader: {
        '.js': 'jsx',
        '.ts': 'ts',
        '.tsx': 'tsx',
        '.svg': 'dataurl',
        '.png': 'dataurl',
        '.jpg': 'dataurl',
        '.gif': 'dataurl',
        '.woff': 'dataurl',
        '.woff2': 'dataurl',
      },
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    });

    const hasCss = fs.existsSync(path.join(outDir, 'bundle.css'));
    const htmlTemplatePath = fs.existsSync(path.join(targetDir, 'public', 'index.html'))
      ? path.join(targetDir, 'public', 'index.html')
      : fs.existsSync(path.join(targetDir, 'index.html'))
      ? path.join(targetDir, 'index.html')
      : null;

    let html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Compiled App</title>${
      hasCss ? '<link rel="stylesheet" href="./bundle.css"/>' : ''
    }</head><body><div id="root"></div><div id="app"></div><script src="./bundle.js"></script></body></html>`;

    if (htmlTemplatePath) {
      const rawHtml = await fsp.readFile(htmlTemplatePath, 'utf-8');
      const cleaned = rawHtml.replace(/<script\b[^>]*type=["']module["'][^>]*><\/script>/gi, '');
      html = cleaned.replace(
        /<\/body>/i,
        `${hasCss ? '<link rel="stylesheet" href="./bundle.css"/>' : ''}<script src="./bundle.js"></script></body>`
      );
    }

    await fsp.writeFile(path.join(outDir, 'index.html'), html, 'utf-8');
    broadcastLog(workspaceId, `esbuild bundle created successfully.`);
    return true;
  } catch (err) {
    broadcastLog(workspaceId, `esbuild fallback error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function runWorkspaceBuild(
  ws: InternalWorkspace,
  options: { autoNormalize: boolean; cleanInstall: boolean }
) {
  const startTime = Date.now();
  ws.status = 'building';
  ws.errorMessage = undefined;
  ws.logs = [];
  broadcastStatus(ws.id);

  const targetDir = ws.targetSubPath ? path.join(ws.repoDir, ws.targetSubPath) : ws.repoDir;
  broadcastLog(ws.id, `Starting build for ${ws.owner}/${ws.repoName}${ws.targetSubPath ? ` (${ws.targetSubPath})` : ''}`);
  broadcastLog(ws.id, `Detected stack: ${ws.framework} · Strategy: ${ws.buildStrategy}`);

  try {
    if (!fs.existsSync(targetDir)) {
      throw new Error(`Target directory "${ws.targetSubPath}" does not exist in repository.`);
    }

    if (options.cleanInstall) {
      const nmPath = path.join(targetDir, 'node_modules');
      if (fs.existsSync(nmPath)) {
        broadcastLog(ws.id, `Cleaning existing node_modules directory...`);
        await fsp.rm(nmPath, { recursive: true, force: true });
      }
    }

    const envOverrides: Record<string, string> = {
      PUBLIC_URL: '.',
    };
    const nonEmptyEnvLines: string[] = [];
    for (const item of ws.envVars) {
      if (item.key && item.value) {
        envOverrides[item.key] = item.value;
        nonEmptyEnvLines.push(`${item.key}=${item.value}`);
      }
    }
    if (nonEmptyEnvLines.length > 0) {
      await fsp.writeFile(path.join(targetDir, '.env'), nonEmptyEnvLines.join('\n') + '\n', 'utf-8');
      broadcastLog(ws.id, `Injected ${nonEmptyEnvLines.length} environment variable(s) into .env.`);
    }

    if (options.autoNormalize) {
      await normalizePackageForBuild(targetDir, ws.id);
    }

    const pkgPath = path.join(targetDir, 'package.json');
    let pkg: Record<string, unknown> | null = null;
    if (fs.existsSync(pkgPath)) {
      pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf-8'));
    }

    const hasDeps =
      pkg &&
      (Object.keys((pkg.dependencies as Record<string, unknown>) || {}).length > 0 ||
        Object.keys((pkg.devDependencies as Record<string, unknown>) || {}).length > 0);

    if (hasDeps) {
      const nmExists = fs.existsSync(path.join(targetDir, 'node_modules'));
      if (!nmExists || options.cleanInstall) {
        broadcastLog(ws.id, `Running npm install --include=dev --legacy-peer-deps...`);
        const installRes = await runCommandStreaming(
          'npm',
          ['install', '--include=dev', '--legacy-peer-deps', '--no-audit', '--no-fund'],
          targetDir,
          { ...envOverrides, NODE_ENV: 'development' },
          (line) => broadcastLog(ws.id, line),
          180_000
        );
        if (installRes.code !== 0) {
          broadcastLog(ws.id, `Warning: npm install exited with code ${installRes.code}. Checking if build can proceed...`);
        } else {
          broadcastLog(ws.id, `Dependencies installed successfully.`);
        }
      } else {
        broadcastLog(ws.id, `Reusing cached node_modules (enable Clean Install to force reinstall).`);
      }
    }

    const scripts = ((pkg?.scripts as Record<string, string>) || {});
    const deps: Record<string, string> = {
      ...((pkg?.dependencies as Record<string, string>) || {}),
      ...((pkg?.devDependencies as Record<string, string>) || {}),
    };

    let resolvedOutputDir: string | null = null;

    if (scripts.build) {
      const isViteBuild = scripts.build.includes('vite build') || 'vite' in deps;
      const buildArgs =
        isViteBuild && scripts.build.trim() === 'vite build'
          ? ['run', 'build', '--', '--base=./']
          : ['run', 'build'];

      broadcastLog(ws.id, `Executing: npm ${buildArgs.join(' ')}`);
      const buildRes = await runCommandStreaming(
        'npm',
        buildArgs,
        targetDir,
        envOverrides,
        (line) => broadcastLog(ws.id, line),
        180_000
      );

      if (buildRes.code !== 0 && isViteBuild && fs.existsSync(path.join(targetDir, 'node_modules', '.bin', 'vite'))) {
        broadcastLog(
          ws.id,
          `Primary build exited with code ${buildRes.code} (strict tsc checks). Attempting resilient Vite bundle...`
        );
        const recoveryRes = await runCommandStreaming(
          'npx',
          ['vite', 'build', '--base=./'],
          targetDir,
          envOverrides,
          (line) => broadcastLog(ws.id, line),
          120_000
        );
        if (recoveryRes.code !== 0) {
          throw new Error(`Vite build failed with exit code ${recoveryRes.code}. Check build console logs for details.`);
        }
      } else if (buildRes.code !== 0) {
        const fallbackDir = path.join(targetDir, '.repoforge-dist');
        const bundled = await bundleFallbackWithEsbuild(targetDir, fallbackDir, ws.id);
        if (bundled) {
          resolvedOutputDir = fallbackDir;
        } else {
          throw new Error(`Build script exited with code ${buildRes.code}. Inspect the logs above or edit source files.`);
        }
      }
    } else if (pkg && ('react' in deps || 'preact' in deps) && !fs.existsSync(path.join(targetDir, 'dist', 'index.html'))) {
      const rootHtml = path.join(targetDir, 'index.html');
      let needsBundler = true;
      if (fs.existsSync(rootHtml)) {
        const raw = await fsp.readFile(rootHtml, 'utf-8');
        if (!raw.includes('type="module"') && !raw.includes('.tsx') && (raw.includes('node_modules/') || raw.includes('.js'))) {
          needsBundler = false;
        }
      }
      if (needsBundler) {
        const fallbackDir = path.join(targetDir, '.repoforge-dist');
        const bundled = await bundleFallbackWithEsbuild(targetDir, fallbackDir, ws.id);
        if (bundled) {
          resolvedOutputDir = fallbackDir;
        }
      }
    }

    if (!resolvedOutputDir) {
      for (const candidate of ['dist', 'build', 'out', 'public', 'www', '.next/server/app', '.next/server/pages', '.']) {
        const abs = path.join(targetDir, candidate);
        if (fs.existsSync(path.join(abs, 'index.html'))) {
          resolvedOutputDir = abs;
          break;
        }
      }
    }

    if (!resolvedOutputDir) {
      const fallbackDir = path.join(targetDir, '.repoforge-dist');
      await generateModuleSummaryHtml(ws, targetDir, fallbackDir);
      resolvedOutputDir = fallbackDir;
      broadcastLog(ws.id, `Generated interactive package verification summary.`);
    }

    ws.outputDir = resolvedOutputDir;
    ws.outputDirRelative = path.relative(ws.repoDir, resolvedOutputDir) || '.';
    ws.artifacts = await scanBuildArtifacts(resolvedOutputDir);
    ws.buildDurationMs = Date.now() - startTime;
    ws.builtAt = new Date().toISOString();
    ws.previewUrl = `/preview/${ws.id}/`;
    ws.status = 'succeeded';
    lastActivePreviewId = ws.id;

    // Run Automated Post-Build Smoke Prober
    ws.smokeProbe = await runPostBuildSmokeProbe(ws);
    const passCount = ws.smokeProbe.checks.filter((c) => c.status === 'pass').length;
    broadcastLog(
      ws.id,
      `Smoke Prober: ${ws.smokeProbe.overallStatus.toUpperCase()} · ${passCount}/${ws.smokeProbe.checks.length} checks passed · ${ws.smokeProbe.verifiedAssets} local assets verified`
    );

    broadcastLog(
      ws.id,
      `Build succeeded in ${(ws.buildDurationMs / 1000).toFixed(2)}s · Output: ${ws.outputDirRelative} (${ws.artifacts.length} artifacts)`
    );
    broadcastStatus(ws.id);
    await saveWorkspaceMeta(ws);
  } catch (err) {
    ws.buildDurationMs = Date.now() - startTime;
    ws.status = 'failed';
    ws.errorMessage = err instanceof Error ? err.message : String(err);
    broadcastLog(ws.id, `ERROR: ${ws.errorMessage}`);
    broadcastStatus(ws.id);
    await saveWorkspaceMeta(ws);
  }
}

function findFreeLocalPort(minPort = 4100, maxPort = 4900): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      if (port > maxPort) {
        reject(new Error('No available sandbox ports in range 4100-4900'));
        return;
      }
      const srv = net.createServer();
      srv.unref();
      srv.on('error', () => tryPort(port + 1));
      srv.listen(port, '127.0.0.1', () => {
        srv.close(() => resolve(port));
      });
    };
    tryPort(minPort + Math.floor(Math.random() * 200));
  });
}

function waitForTcpReady(port: number, timeoutMs = 6000): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const sock = net.createConnection({ port, host: '127.0.0.1' });
      sock.on('connect', () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() - start >= timeoutMs) {
          resolve(false);
        } else {
          setTimeout(check, 250);
        }
      });
    };
    check();
  });
}

function stopWorkspaceApiServer(workspaceId: string) {
  const proc = apiProcesses.get(workspaceId);
  if (proc) {
    try {
      proc.kill('SIGTERM');
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Already exited
        }
      }, 1500);
    } catch {
      // Ignore
    }
    apiProcesses.delete(workspaceId);
  }
  const ws = workspaces.get(workspaceId);
  if (ws) {
    ws.apiServer.status = 'stopped';
    ws.apiServer.port = undefined;
    broadcastStatus(workspaceId);
  }
}

async function startWorkspaceApiServer(ws: InternalWorkspace, customEntry?: string): Promise<void> {
  stopWorkspaceApiServer(ws.id);

  const targetDir = ws.targetSubPath ? path.join(ws.repoDir, ws.targetSubPath) : ws.repoDir;
  const entry = customEntry?.trim() || ws.apiServer.detectedEntry;
  const port = await findFreeLocalPort();

  ws.apiServer.status = 'starting';
  ws.apiServer.port = port;
  ws.apiServer.proxyBaseUrl = `/sandbox-api/${ws.id}`;
  ws.apiServer.errorMessage = undefined;
  ws.apiServer.logs = [];
  broadcastStatus(ws.id);

  // Ensure dependencies are installed if package.json has dependencies and node_modules is missing
  const pkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgPath) && !fs.existsSync(path.join(targetDir, 'node_modules'))) {
    broadcastApiLog(ws.id, `Installing dependencies prior to launching API server...`);
    await runCommandStreaming(
      'npm',
      ['install', '--include=dev', '--legacy-peer-deps', '--no-audit', '--no-fund'],
      targetDir,
      { NODE_ENV: 'development' },
      (line) => broadcastApiLog(ws.id, line),
      120_000
    );
  }

  const envMap: Record<string, string> = {
    PORT: String(port),
    HOST: '127.0.0.1',
  };
  for (const item of ws.envVars) {
    if (item.key && item.value) envMap[item.key] = item.value;
  }

  let cmd = 'npx';
  let args = ['tsx', entry || 'server.js'];
  if (!entry && ws.apiServer.startCommand === 'npm start') {
    cmd = 'npm';
    args = ['start'];
  }

  broadcastApiLog(ws.id, `Spawning API process on internal 127.0.0.1:${port} via "${cmd} ${args.join(' ')}"`);

  const child = spawn(cmd, args, {
    cwd: targetDir,
    env: {
      ...process.env,
      ...envMap,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });

  apiProcesses.set(ws.id, child);

  child.stdout.on('data', (d: Buffer) => {
    for (const line of d.toString('utf-8').split(/\r?\n/)) {
      if (line.trim()) broadcastApiLog(ws.id, line);
    }
  });
  child.stderr.on('data', (d: Buffer) => {
    for (const line of d.toString('utf-8').split(/\r?\n/)) {
      if (line.trim()) broadcastApiLog(ws.id, line);
    }
  });

  child.on('exit', (code) => {
    apiProcesses.delete(ws.id);
    if (ws.apiServer.status !== 'stopped') {
      ws.apiServer.status = code === 0 ? 'stopped' : 'error';
      ws.apiServer.errorMessage = `API server exited with code ${code ?? 0}`;
      broadcastApiLog(ws.id, ws.apiServer.errorMessage);
      broadcastStatus(ws.id);
    }
  });

  const ready = await waitForTcpReady(port, 6500);
  if (apiProcesses.has(ws.id)) {
    ws.apiServer.status = 'running';
    ws.apiServer.startedAt = new Date().toISOString();
    broadcastApiLog(
      ws.id,
      ready
        ? `API server listening on 127.0.0.1:${port} · Reverse proxy mounted at /sandbox-api/${ws.id}/*`
        : `Process running (PID ${child.pid}) · Proxy mounted at /sandbox-api/${ws.id}/*`
    );
    broadcastStatus(ws.id);
  }
}

async function importSingleRepo(params: {
  url: string;
  branch?: string;
  subPath?: string;
  autoBuild?: boolean;
  autoNormalize?: boolean;
  githubToken?: string;
}): Promise<InternalWorkspace> {
  const parsed = parseGitHubInput(params.url, params.branch, params.subPath);
  if (!parsed) {
    throw new Error('Invalid GitHub URL. Expected format: owner/repo or https://github.com/owner/repo');
  }

  const id = `${parsed.repoName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
  const rootDir = path.join(WORKSPACES_ROOT, id);
  const repoDir = path.join(rootDir, 'repo');
  await fsp.mkdir(rootDir, { recursive: true });

  const authGitArgs = params.githubToken
    ? [
        '-c',
        `http.extraheader=Authorization: Basic ${Buffer.from(`x-access-token:${params.githubToken}`).toString('base64')}`,
      ]
    : [];

  const cloneArgs = [...authGitArgs, 'clone', '--depth', '1'];
  if (params.branch || parsed.branch) {
    cloneArgs.push('--branch', (params.branch || parsed.branch)!);
  }
  cloneArgs.push(parsed.cloneUrl, repoDir);

  let cloneRes = await runCommandStreaming('git', cloneArgs, rootDir, {}, undefined, 90_000);

  if (cloneRes.code !== 0 && !params.branch && parsed.branch) {
    await fsp.rm(repoDir, { recursive: true, force: true });
    cloneRes = await runCommandStreaming(
      'git',
      [...authGitArgs, 'clone', '--depth', '1', parsed.cloneUrl, repoDir],
      rootDir,
      {},
      undefined,
      90_000
    );
  }

  if (cloneRes.code !== 0) {
    await fsp.rm(rootDir, { recursive: true, force: true });
    const errMsg =
      cloneRes.stderr.includes('not found') || cloneRes.stderr.includes('Authentication failed')
        ? `Repository "${parsed.owner}/${parsed.repoName}"${params.branch ? ` (branch: ${params.branch})` : ''} was not found or requires GitHub OAuth connection.`
        : `Git clone failed: ${cloneRes.stderr.trim() || 'Unable to reach GitHub'}`;
    throw new Error(errMsg);
  }

  const logRes = await runCommandStreaming(
    'git',
    ['log', '-1', '--format=%H|%h|%an|%ar|%s'],
    repoDir,
    {},
    undefined,
    10_000
  );
  const [commitHash = '', commitShort = '', commitAuthor = 'Unknown', commitRelativeTime = 'recently', commitMessage = ''] =
    logRes.stdout.trim().split('|');

  const branchRes = await runCommandStreaming(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    repoDir,
    {},
    undefined,
    10_000
  );
  const detectedBranch = branchRes.stdout.trim() || params.branch || parsed.branch || 'main';

  const subProjects = await discoverSubProjects(repoDir);

  let targetSubPath = parsed.subPath;
  if (targetSubPath && !fs.existsSync(path.join(repoDir, targetSubPath))) {
    targetSubPath = '';
  }

  if (!targetSubPath && subProjects.length > 1) {
    const rootEntry = subProjects.find((sp) => sp.subPath === '');
    if (rootEntry && !rootEntry.hasBuildScript && !rootEntry.hasIndexHtml) {
      const preferred =
        subProjects.find((sp) => sp.subPath !== '' && sp.hasBuildScript && sp.hasIndexHtml) ||
        subProjects.find((sp) => sp.subPath !== '' && sp.hasIndexHtml && sp.subPath.includes('react')) ||
        subProjects.find((sp) => sp.subPath !== '' && sp.hasIndexHtml && sp.subPath.includes('es6')) ||
        subProjects.find((sp) => sp.subPath !== '' && sp.hasIndexHtml);
      if (preferred) {
        targetSubPath = preferred.subPath;
      }
    }
  }

  const analysis = await analyzeWorkspaceTarget(repoDir, targetSubPath);

  const initialLogs = [
    `[${new Date().toISOString().slice(11, 19)}] Cloned ${parsed.canonicalUrl} (${detectedBranch} @ ${commitShort})`,
    `[${new Date().toISOString().slice(11, 19)}] Indexed ${analysis.totalFiles} files (${(analysis.totalBytes / 1024).toFixed(1)} KB) · Stack: ${analysis.framework}`,
  ];
  if (analysis.databaseSchema.detected) {
    initialLogs.push(
      `[${new Date().toISOString().slice(11, 19)}] Detected ${analysis.databaseSchema.models.length} ${analysis.databaseSchema.ormType} database model(s).`
    );
  }

  const ws: InternalWorkspace = {
    id,
    rootDir,
    repoDir,
    repoUrl: parsed.canonicalUrl,
    owner: parsed.owner,
    repoName: parsed.repoName,
    branch: detectedBranch,
    isPrivate: Boolean(params.githubToken),
    commitHash,
    commitShort,
    commitAuthor,
    commitRelativeTime,
    commitMessage,
    createdAt: new Date().toISOString(),
    targetSubPath,
    status: params.autoBuild ? 'building' : 'ready',
    ...analysis,
    subProjects,
    artifacts: [],
    logs: initialLogs,
  };

  workspaces.set(id, ws);
  await saveWorkspaceMeta(ws);

  if (params.autoBuild) {
    void runWorkspaceBuild(ws, { autoNormalize: params.autoNormalize ?? true, cleanInstall: false });
  }

  return ws;
}

async function computeWorkspaceDiff(baseWs: InternalWorkspace, headWs: InternalWorkspace): Promise<WorkspaceDiffReport> {
  const baseFiles = new Map<string, number>();
  const headFiles = new Map<string, number>();

  for (const f of baseWs.files) {
    if (f.type === 'file') baseFiles.set(f.path, f.size);
  }
  for (const f of headWs.files) {
    if (f.type === 'file') headFiles.set(f.path, f.size);
  }

  const allPaths = Array.from(new Set([...baseFiles.keys(), ...headFiles.keys()])).sort();
  const changes: DiffFileChange[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let modifiedCount = 0;
  let unchangedCount = 0;

  for (const relPath of allPaths) {
    const inBase = baseFiles.has(relPath);
    const inHead = headFiles.has(relPath);
    const bSize = baseFiles.get(relPath) ?? 0;
    const hSize = headFiles.get(relPath) ?? 0;

    if (!inBase && inHead) {
      addedCount += 1;
      changes.push({ path: relPath, changeType: 'added', baseSize: 0, headSize: hSize, deltaBytes: hSize });
    } else if (inBase && !inHead) {
      removedCount += 1;
      changes.push({ path: relPath, changeType: 'removed', baseSize: bSize, headSize: 0, deltaBytes: -bSize });
    } else if (bSize !== hSize) {
      modifiedCount += 1;
      changes.push({ path: relPath, changeType: 'modified', baseSize: bSize, headSize: hSize, deltaBytes: hSize - bSize });
    } else if (bSize < 256_000) {
      try {
        const [bBuf, hBuf] = await Promise.all([
          fsp.readFile(path.join(baseWs.repoDir, relPath)),
          fsp.readFile(path.join(headWs.repoDir, relPath)),
        ]);
        if (!bBuf.equals(hBuf)) {
          modifiedCount += 1;
          changes.push({ path: relPath, changeType: 'modified', baseSize: bSize, headSize: hSize, deltaBytes: 0 });
        } else {
          unchangedCount += 1;
        }
      } catch {
        unchangedCount += 1;
      }
    } else {
      unchangedCount += 1;
    }
  }

  const baseTotalArtifactBytes = baseWs.artifacts.reduce((s, a) => s + a.size, 0);
  const headTotalArtifactBytes = headWs.artifacts.reduce((s, a) => s + a.size, 0);

  return {
    baseId: baseWs.id,
    headId: headWs.id,
    baseLabel: `${baseWs.owner}/${baseWs.repoName}@${baseWs.branch} (${baseWs.commitShort})`,
    headLabel: `${headWs.owner}/${headWs.repoName}@${headWs.branch} (${headWs.commitShort})`,
    baseTotalArtifactBytes,
    headTotalArtifactBytes,
    artifactDeltaBytes: headTotalArtifactBytes - baseTotalArtifactBytes,
    addedCount,
    removedCount,
    modifiedCount,
    unchangedCount,
    changes: changes.slice(0, 250),
  };
}

function instrumentHtmlForPreview(rawHtml: string, workspaceId: string): string {
  const baseHref = `/preview/${workspaceId}/`;

  let html = rawHtml.replace(
    /\b(src|href)=["']\/(?!(?:\/|preview\/|api\/|sandbox-api\/))([^"']+)["']/gi,
    '$1="./$2"'
  );

  const consoleBridge = `<script>
(function(){
  if (window.__repoforgeHooked) return;
  window.__repoforgeHooked = true;
  function send(level, args) {
    try {
      var msg = Array.prototype.slice.call(args).map(function(a){
        return typeof a === 'object' ? JSON.stringify(a) : String(a);
      }).join(' ');
      window.parent.postMessage({ source: 'repoforge-preview', workspaceId: '${workspaceId}', level: level, message: msg }, '*');
    } catch (e) {}
  }
  var origErr = console.error;
  var origWarn = console.warn;
  console.error = function() { send('error', arguments); return origErr.apply(console, arguments); };
  console.warn = function() { send('warn', arguments); return origWarn.apply(console, arguments); };
  window.addEventListener('error', function(e) { send('error', [e.message || 'Runtime error']); });
})();
</script>`;

  if (!/<base\b/i.test(html)) {
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (match) => `${match}\n  <base href="${baseHref}" />\n  ${consoleBridge}`);
    } else {
      html = `<head><base href="${baseHref}" />${consoleBridge}</head>` + html;
    }
  } else {
    html = html.replace(/<\/head>/i, `${consoleBridge}</head>`);
  }

  return html;
}

function toSummary(ws: InternalWorkspace): WorkspaceSummary {
  return {
    id: ws.id,
    owner: ws.owner,
    repoName: ws.repoName,
    branch: ws.branch,
    commitShort: ws.commitShort,
    targetSubPath: ws.targetSubPath,
    framework: ws.framework,
    status: ws.status,
    totalFiles: ws.totalFiles,
    totalBytes: ws.totalBytes,
    buildDurationMs: ws.buildDurationMs,
    previewUrl: ws.previewUrl,
    apiRunning: ws.apiServer.status === 'running',
    probeStatus: ws.smokeProbe?.overallStatus,
    createdAt: ws.createdAt,
  };
}

function toPublicDetail(ws: InternalWorkspace): WorkspaceDetail {
  const { rootDir: _r, repoDir: _d, outputDir: _o, ...rest } = ws;
  return rest;
}

async function startServer() {
  await rehydrateWorkspaces();

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // =========================================================================
  // SUGGESTION 1: GitHub 3P OAuth (Popup-based flow per oauth-integration)
  // =========================================================================

  app.get('/api/auth/github/status', (req: Request, res: Response) => {
    const clientOrigin = typeof req.query.origin === 'string' ? req.query.origin : undefined;
    const session = getGitHubSession(req);
    const configured = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
    res.json({
      configured,
      connected: Boolean(session),
      user: session?.user || null,
      callbackUrl: resolveCallbackUrl(clientOrigin),
    });
  });

  app.get('/api/auth/github/url', (req: Request, res: Response) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(400).json({
        error:
          'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are not configured yet in AI Studio Secrets.',
      });
      return;
    }

    const clientOrigin = typeof req.query.origin === 'string' ? req.query.origin : undefined;
    const redirectUri = resolveCallbackUrl(clientOrigin);
    const state = crypto.randomBytes(16).toString('hex');
    pendingOAuthStates.set(state, { redirectUri, createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo read:user',
      state,
    });

    res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}` });
  });

  app.get(['/auth/callback', '/auth/callback/'], async (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    if (!code) {
      res.status(400).send('Missing OAuth authorization code.');
      return;
    }

    const pending = pendingOAuthStates.get(state);
    pendingOAuthStates.delete(state);
    const redirectUri = pending?.redirectUri || resolveCallbackUrl();

    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = (await tokenRes.json()) as { access_token?: string; error_description?: string };
      if (!tokenData.access_token) {
        throw new Error(tokenData.error_description || 'Failed to obtain GitHub access token.');
      }

      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'RepoForge-Studio',
        },
      });
      if (!userRes.ok) {
        throw new Error('Failed to fetch GitHub user profile.');
      }
      const userJson = (await userRes.json()) as GitHubUser;

      const sessionId = crypto.randomBytes(24).toString('hex');
      githubSessions.set(sessionId, {
        sessionId,
        token: tokenData.access_token,
        user: {
          login: userJson.login,
          name: userJson.name,
          avatar_url: userJson.avatar_url,
          html_url: userJson.html_url,
        },
        createdAt: Date.now(),
      });

      res.setHeader(
        'Set-Cookie',
        `rf_gh_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=86400`
      );

      res.send(`<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;background:#0b0f17;color:#f8fafc;padding:32px;text-align:center;">
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', sessionId: '${sessionId}' }, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
    <p>GitHub connected as @${userJson.login}. This window will close automatically.</p>
  </body>
</html>`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OAuth callback failed';
      res.status(500).send(`<!doctype html><html><body style="font-family:system-ui;padding:24px"><h3>Authentication Error</h3><p>${msg}</p></body></html>`);
    }
  });

  app.post('/api/auth/github/logout', (req: Request, res: Response) => {
    const session = getGitHubSession(req);
    if (session) {
      githubSessions.delete(session.sessionId);
    }
    res.setHeader(
      'Set-Cookie',
      'rf_gh_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0'
    );
    res.json({ disconnected: true });
  });

  app.get('/api/github/repos', async (req: Request, res: Response) => {
    const session = getGitHubSession(req);
    if (!session) {
      res.status(401).json({ error: 'Not connected to GitHub.' });
      return;
    }

    try {
      const ghRes = await fetch(
        'https://api.github.com/user/repos?sort=updated&per_page=60&affiliation=owner,collaborator,organization_member',
        {
          headers: {
            Authorization: `Bearer ${session.token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'RepoForge-Studio',
          },
        }
      );
      if (!ghRes.ok) {
        res.status(ghRes.status).json({ error: 'Unable to list GitHub repositories.' });
        return;
      }
      const repos = (await ghRes.json()) as GitHubRepoItem[];
      res.json({ repos });
    } catch {
      res.status(500).json({ error: 'Failed to reach GitHub API.' });
    }
  });

  // List branches & PRs for any repository (uses OAuth token if connected, or git ls-remote fallback for public repos!)
  app.get('/api/github/repos/:owner/:repo/refs', async (req: Request, res: Response) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo).replace(/\.git$/, '');
    const session = getGitHubSession(req);

    const branches: GitHubBranchItem[] = [];
    const pulls: GitHubPullRequestItem[] = [];

    if (session) {
      try {
        const [bRes, pRes] = await Promise.all([
          fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=50`, {
            headers: {
              Authorization: `Bearer ${session.token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'RepoForge-Studio',
            },
          }),
          fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=25`, {
            headers: {
              Authorization: `Bearer ${session.token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'RepoForge-Studio',
            },
          }),
        ]);
        if (bRes.ok) {
          const bData = (await bRes.json()) as Array<{ name: string; commit: { sha: string } }>;
          for (const b of bData) {
            branches.push({ name: b.name, commitSha: b.commit.sha.slice(0, 7) });
          }
        }
        if (pRes.ok) {
          const pData = (await pRes.json()) as Array<{
            number: number;
            title: string;
            head: { ref: string };
            base: { ref: string };
            user?: { login: string };
          }>;
          for (const pr of pData) {
            pulls.push({
              number: pr.number,
              title: pr.title,
              headRef: pr.head.ref,
              baseRef: pr.base.ref,
              author: pr.user?.login || 'unknown',
            });
          }
        }
      } catch {
        // Fallback to git ls-remote below
      }
    }

    if (branches.length === 0) {
      const lsRes = await runCommandStreaming(
        'git',
        ['ls-remote', '--heads', `https://github.com/${owner}/${repo}.git`],
        WORKSPACES_ROOT,
        {},
        undefined,
        15_000
      );
      if (lsRes.code === 0) {
        for (const line of lsRes.stdout.split(/\r?\n/)) {
          const [sha, ref] = line.trim().split(/\s+/);
          if (sha && ref && ref.startsWith('refs/heads/')) {
            branches.push({
              name: ref.slice('refs/heads/'.length),
              commitSha: sha.slice(0, 7),
            });
          }
        }
      }
    }

    res.json({ branches, pulls });
  });

  // =========================================================================
  // Core Workspace Routes + Diff + Smoke Probe + Backend API Proxy
  // =========================================================================

  app.get('/api/workspaces', (_req: Request, res: Response) => {
    const list = Array.from(workspaces.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toSummary);
    res.json({ workspaces: list });
  });

  // SUGGESTION 2: Side-by-Side Branch / PR Diff Endpoints
  app.get('/api/workspaces/diff', async (req: Request, res: Response) => {
    const baseId = String(req.query.baseId || '');
    const headId = String(req.query.headId || '');
    const baseWs = workspaces.get(baseId);
    const headWs = workspaces.get(headId);
    if (!baseWs || !headWs) {
      res.status(404).json({ error: 'Select both a Base workspace and a Head workspace to compare.' });
      return;
    }
    const diff = await computeWorkspaceDiff(baseWs, headWs);
    res.json({ diff });
  });

  app.get('/api/workspaces/diff-file', async (req: Request, res: Response) => {
    const baseId = String(req.query.baseId || '');
    const headId = String(req.query.headId || '');
    const relPath = String(req.query.path || '').replace(/^\/+/, '');
    const baseWs = workspaces.get(baseId);
    const headWs = workspaces.get(headId);
    if (!baseWs || !headWs || !relPath) {
      res.status(400).json({ error: 'baseId, headId, and path are required.' });
      return;
    }

    const readSafe = async (ws: InternalWorkspace) => {
      const abs = path.resolve(ws.repoDir, relPath);
      if (!abs.startsWith(path.resolve(ws.repoDir)) || !fs.existsSync(abs)) return '';
      try {
        return (await fsp.readFile(abs, 'utf-8')).slice(0, 80_000);
      } catch {
        return '';
      }
    };

    const [baseContent, headContent] = await Promise.all([readSafe(baseWs), readSafe(headWs)]);
    res.json({ path: relPath, baseContent, headContent });
  });

  app.post('/api/workspaces/compare-branches', async (req: Request, res: Response) => {
    const { url, baseBranch, headBranch, subPath } = req.body as {
      url?: string;
      baseBranch?: string;
      headBranch?: string;
      subPath?: string;
    };
    if (!url || !baseBranch || !headBranch) {
      res.status(400).json({ error: 'Repository URL, base branch, and head branch are required.' });
      return;
    }

    const session = getGitHubSession(req);
    try {
      const [baseWs, headWs] = await Promise.all([
        importSingleRepo({
          url,
          branch: baseBranch,
          subPath,
          autoBuild: true,
          autoNormalize: true,
          githubToken: session?.token,
        }),
        importSingleRepo({
          url,
          branch: headBranch,
          subPath,
          autoBuild: true,
          autoNormalize: true,
          githubToken: session?.token,
        }),
      ]);

      const diff = await computeWorkspaceDiff(baseWs, headWs);
      res.status(201).json({
        baseWorkspace: toPublicDetail(baseWs),
        headWorkspace: toPublicDetail(headWs),
        diff,
      });
    } catch (err) {
      res.status(422).json({
        error: err instanceof Error ? err.message : 'Failed to clone comparison branches.',
      });
    }
  });

  app.get('/api/workspaces/:id', (req: Request, res: Response) => {
    const ws = workspaces.get(String(req.params.id));
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({ workspace: toPublicDetail(ws) });
  });

  app.post('/api/workspaces/import', async (req: Request, res: Response) => {
    const { url, branch, subPath, autoBuild, autoNormalize = true } = req.body as {
      url?: string;
      branch?: string;
      subPath?: string;
      autoBuild?: boolean;
      autoNormalize?: boolean;
    };

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Please provide a GitHub repository URL or owner/repo.' });
      return;
    }

    const session = getGitHubSession(req);
    try {
      const ws = await importSingleRepo({
        url,
        branch,
        subPath,
        autoBuild,
        autoNormalize,
        githubToken: session?.token,
      });
      res.status(201).json({ workspace: toPublicDetail(ws) });
    } catch (err) {
      res.status(422).json({
        error: err instanceof Error ? err.message : 'Failed to import repository.',
      });
    }
  });

  app.patch('/api/workspaces/:id/target', async (req: Request, res: Response) => {
    const ws = workspaces.get(String(req.params.id));
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    const { targetSubPath = '' } = req.body as { targetSubPath?: string };
    const cleanSub = targetSubPath.trim().replace(/^\/+|\/+$/g, '');
    const candidateDir = cleanSub ? path.join(ws.repoDir, cleanSub) : ws.repoDir;
    const resolved = path.resolve(candidateDir);
    if (!resolved.startsWith(path.resolve(ws.repoDir)) || !fs.existsSync(resolved)) {
      res.status(400).json({ error: 'Specified target sub-directory does not exist in repository.' });
      return;
    }

    stopWorkspaceApiServer(ws.id);
    ws.targetSubPath = cleanSub;
    const analysis = await analyzeWorkspaceTarget(ws.repoDir, cleanSub);
    Object.assign(ws, analysis);
    ws.status = 'ready';
    ws.previewUrl = undefined;
    ws.smokeProbe = undefined;
    ws.artifacts = [];
    broadcastLog(ws.id, `Switched active target directory to "${cleanSub || '(Repository Root)'}" (${ws.framework}).`);
    await saveWorkspaceMeta(ws);
    res.json({ workspace: toPublicDetail(ws) });
  });

  app.get('/api/workspaces/:id/file', async (req: Request, res: Response) => {
    const ws = workspaces.get(String(req.params.id));
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    const relPath = String(req.query.path || '').replace(/^\/+/, '');
    if (!relPath) {
      res.status(400).json({ error: 'Missing file path parameter' });
      return;
    }

    const absPath = path.resolve(ws.repoDir, relPath);
    if (!absPath.startsWith(path.resolve(ws.repoDir))) {
      res.status(403).json({ error: 'Access denied outside repository root' });
      return;
    }

    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    try {
      const stat = await fsp.stat(absPath);
      if (stat.isDirectory()) {
        res.status(400).json({ error: 'Path refers to a directory' });
        return;
      }
      if (stat.size > 512_000) {
        res.json({
          path: relPath,
          size: stat.size,
          truncated: true,
          content:
            (await fsp.readFile(absPath, 'utf-8')).slice(0, 120_000) +
            '\n\n/* File truncated at 120 KB for editor performance */',
        });
        return;
      }
      const content = await fsp.readFile(absPath, 'utf-8');
      res.json({ path: relPath, size: stat.size, truncated: false, content });
    } catch {
      res.status(500).json({ error: 'Unable to read file content' });
    }
  });

  app.put('/api/workspaces/:id/file', async (req: Request, res: Response) => {
    const ws = workspaces.get(String(req.params.id));
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    const { path: relPath, content } = req.body as { path?: string; content?: string };
    if (!relPath || typeof content !== 'string') {
      res.status(400).json({ error: 'File path and content are required' });
      return;
    }

    const absPath = path.resolve(ws.repoDir, relPath.replace(/^\/+/, ''));
    if (!absPath.startsWith(path.resolve(ws.repoDir))) {
      res.status(403).json({ error: 'Access denied outside repository root' });
      return;
    }

    try {
      await fsp.mkdir(path.dirname(absPath), { recursive: true });
      await fsp.writeFile(absPath, content, 'utf-8');
      broadcastLog(ws.id, `Saved edits to ${relPath} (${Buffer.byteLength(content, 'utf-8')} bytes).`);
      await saveWorkspaceMeta(ws);
      res.json({ ok: true, path: relPath });
    } catch {
      res.status(500).json({ error: 'Failed to write file' });
    }
  });

  app.put('/api/workspaces/:id/env', async (req: Request, res: Response) => {
    const ws = workspaces.get(String(req.params.id));
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    const { envVars } = req.body as { envVars?: EnvVarItem[] };
    if (!Array.isArray(envVars)) {
      res.status(400).json({ error: 'envVars array is required' });
      return;
    }
    ws.envVars = envVars
      .filter((e) => Boolean(e.key?.trim()))
      .map((e) => ({
        key: e.key.trim(),
        value: String(e.value ?? ''),
        source: e.source || 'custom',
      }));
    if (ws.outputDir) {
      ws.smokeProbe = await runPostBuildSmokeProbe(ws);
    }
    await saveWorkspaceMeta(ws);
    res.json({ workspace: toPublicDetail(ws) });
  });

  app.post('/api/workspaces/:id/build', (req: Request, res: Response) => {
    const ws = workspaces.get(String(req.params.id));
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    if (ws.status === 'building') {
      res.status(409).json({ error: 'A build is already running for this workspace.' });
      return;
    }
    const { autoNormalize = true, cleanInstall = false } = (req.body || {}) as {
      autoNormalize?: boolean;
      cleanInstall?: boolean;
    };

    void runWorkspaceBuild(ws, { autoNormalize, cleanInstall });
    res.json({ started: true, workspace: toPublicDetail(ws) });
  });

  // SUGGESTION 5: On-demand Post-Build Smoke Prober endpoint
  app.post('/api/workspaces/:id/probe', async (req: Request, res: Response) => {
    const ws = workspaces.get(String(req.params.id));
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    ws.smokeProbe = await runPostBuildSmokeProbe(ws);
    await saveWorkspaceMeta(ws);
    res.json({ smokeProbe: ws.smokeProbe, workspace: toPublicDetail(ws) });
  });

  // SUGGESTION 4: Backend API Subprocess Lifecycle & Reverse Proxy
  app.post('/api/workspaces/:id/api-server/start', async (req: Request, res: Response) => {
    const ws = workspaces.get(String(req.params.id));
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    const { entry } = (req.body || {}) as { entry?: string };
    try {
      await startWorkspaceApiServer(ws, entry);
      res.json({ workspace: toPublicDetail(ws) });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to start API subprocess.',
      });
    }
  });

  app.post('/api/workspaces/:id/api-server/stop', (req: Request, res: Response) => {
    const ws = workspaces.get(String(req.params.id));
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    stopWorkspaceApiServer(ws.id);
    res.json({ workspace: toPublicDetail(ws) });
  });

  app.all('/sandbox-api/:id*', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const ws = workspaces.get(id);
    if (!ws || ws.apiServer.status !== 'running' || !ws.apiServer.port) {
      res.status(503).json({
        error: 'Workspace backend API subprocess is not running. Start it in Build & API.',
      });
      return;
    }

    const prefix = `/sandbox-api/${id}`;
    const subUrl = req.originalUrl.startsWith(prefix)
      ? req.originalUrl.slice(prefix.length) || '/'
      : '/';
    const targetUrl = `http://127.0.0.1:${ws.apiServer.port}${subUrl.startsWith('/') ? subUrl : '/' + subUrl}`;

    try {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string' && k !== 'host' && k !== 'connection' && k !== 'content-length') {
          headers[k] = v;
        }
      }

      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const upstreamRes = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: hasBody && req.body ? JSON.stringify(req.body) : undefined,
      });

      res.status(upstreamRes.status);
      const ct = upstreamRes.headers.get('content-type');
      if (ct) res.setHeader('Content-Type', ct);
      const buf = Buffer.from(await upstreamRes.arrayBuffer());
      res.send(buf);
    } catch (err) {
      res.status(502).json({
        error: `Upstream sandbox API unreachable on port ${ws.apiServer.port}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  });

  app.get('/api/workspaces/:id/logs', (req: Request, res: Response) => {
    const id = String(req.params.id);
    const ws = workspaces.get(id);
    if (!ws) {
      res.status(404).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const initPayload = JSON.stringify({
      type: 'init',
      logs: ws.logs,
      status: ws.status,
      previewUrl: ws.previewUrl,
      buildDurationMs: ws.buildDurationMs,
      smokeProbe: ws.smokeProbe,
      apiServer: ws.apiServer,
    });
    res.write(`data: ${initPayload}\n\n`);

    let set = sseClients.get(id);
    if (!set) {
      set = new Set();
      sseClients.set(id, set);
    }
    set.add(res);

    req.on('close', () => {
      set?.delete(res);
    });
  });

  app.get('/api/workspaces/:id/download', (req: Request, res: Response) => {
    const ws = workspaces.get(String(req.params.id));
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const mode = req.query.mode === 'dist' ? 'dist' : 'project';
    const sourceDir = mode === 'dist' && ws.outputDir ? ws.outputDir : ws.repoDir;
    if (!fs.existsSync(sourceDir)) {
      res.status(404).json({ error: 'Archive target directory does not exist yet. Build the project first.' });
      return;
    }

    const filename = `${ws.repoName}-${mode}-${ws.commitShort || 'export'}.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const tarProc = spawn('tar', ['-czf', '-', '--exclude=.git', '--exclude=node_modules', '-C', sourceDir, '.']);
    tarProc.stdout.pipe(res);
    tarProc.stderr.on('data', () => {});
    tarProc.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
  });

  app.delete('/api/workspaces/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const ws = workspaces.get(id);
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    stopWorkspaceApiServer(id);
    workspaces.delete(id);
    sseClients.delete(id);
    await fsp.rm(ws.rootDir, { recursive: true, force: true });
    res.json({ deleted: true });
  });

  app.delete('/api/workspaces', async (_req: Request, res: Response) => {
    const count = workspaces.size;
    for (const [id, ws] of workspaces.entries()) {
      stopWorkspaceApiServer(id);
      sseClients.delete(id);
      await fsp.rm(ws.rootDir, { recursive: true, force: true }).catch(() => {});
    }
    workspaces.clear();
    lastActivePreviewId = null;
    res.json({ purgedCount: count });
  });

  // Suggested Upgrades, Updates & Add-Ons Endpoints
  app.get('/api/upgrades', (_req: Request, res: Response) => {
    const items = loadUpgradesStore().sort((a, b) => b.votes - a.votes);
    res.json({ upgrades: items });
  });

  app.post('/api/upgrades', (req: Request, res: Response) => {
    const { title, category, summary, scope } = (req.body || {}) as {
      title?: string;
      category?: UpgradeCategory;
      summary?: string;
      scope?: string;
    };
    if (!title?.trim() || !summary?.trim()) {
      res.status(400).json({ error: 'Upgrade title and summary are required.' });
      return;
    }
    const allowedCategories: UpgradeCategory[] = [
      'Build & Runtime',
      'Cloud & Data',
      'Developer UX',
      'Automation',
    ];
    const safeCategory: UpgradeCategory =
      category && allowedCategories.includes(category) ? category : 'Developer UX';

    const items = loadUpgradesStore();
    const newItem: UpgradeItem = {
      id: `custom-${crypto.randomBytes(3).toString('hex')}`,
      title: title.trim().slice(0, 110),
      category: safeCategory,
      summary: summary.trim().slice(0, 400),
      scope: (scope?.trim() || 'Custom Studio Add-On').slice(0, 100),
      impact: 'Core Add-On',
      votes: 1,
      prompt: `Implement "${title.trim()}" (${safeCategory}): ${summary.trim()}`,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    items.unshift(newItem);
    saveUpgradesStore(items);
    res.status(201).json({ upgrade: newItem, upgrades: items.sort((a, b) => b.votes - a.votes) });
  });

  app.post('/api/upgrades/:id/vote', (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { delta = 1 } = (req.body || {}) as { delta?: number };
    const step = delta === -1 ? -1 : 1;
    const items = loadUpgradesStore();
    const target = items.find((u) => u.id === id);
    if (!target) {
      res.status(404).json({ error: 'Upgrade item not found.' });
      return;
    }
    target.votes = Math.max(0, target.votes + step);
    saveUpgradesStore(items);
    res.json({ upgrade: target, upgrades: items.sort((a, b) => b.votes - a.votes) });
  });

  // Contact & Support Ticket Endpoints
  app.get('/api/contact', (_req: Request, res: Response) => {
    const tickets = loadContactStore();
    res.json({ tickets: tickets.slice(0, 20) });
  });

  app.post('/api/contact', (req: Request, res: Response) => {
    const { name, email, category, workspaceId, message } = (req.body || {}) as {
      name?: string;
      email?: string;
      category?: string;
      workspaceId?: string;
      message?: string;
    };
    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      res.status(400).json({ error: 'Name, email, and message are required.' });
      return;
    }
    const tickets = loadContactStore();
    const ticketNumber = 1001 + tickets.length;
    const ticket: ContactTicket = {
      id: `RF-${ticketNumber}`,
      name: name.trim().slice(0, 80),
      email: email.trim().slice(0, 120),
      category: (category?.trim() || 'General Inquiry').slice(0, 60),
      workspaceId: workspaceId?.trim() || undefined,
      message: message.trim().slice(0, 1500),
      status: 'received',
      createdAt: new Date().toISOString(),
    };
    tickets.unshift(ticket);
    saveContactStore(tickets);
    res.status(201).json({ ticket, tickets: tickets.slice(0, 20) });
  });

  // Live Built App Preview Static & SPA Router
  app.use('/preview/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const ws = workspaces.get(id);
    if (!ws || !ws.outputDir || !fs.existsSync(ws.outputDir)) {
      res.status(404).send('Preview is not built yet. Run Build Project first.');
      return;
    }

    lastActivePreviewId = id;
    const targetDir = ws.targetSubPath ? path.join(ws.repoDir, ws.targetSubPath) : ws.repoDir;

    if (req.originalUrl === `/preview/${id}`) {
      res.redirect(302, `/preview/${id}/`);
      return;
    }

    const subReqPath = req.path.replace(/^\/+/, '') || 'index.html';

    for (const baseRoot of [ws.outputDir, targetDir]) {
      const candidate = path.resolve(baseRoot, subReqPath);
      if (!candidate.startsWith(path.resolve(baseRoot))) continue;
      if (fs.existsSync(candidate)) {
        const stat = await fsp.stat(candidate);
        const finalFile = stat.isDirectory() ? path.join(candidate, 'index.html') : candidate;
        if (fs.existsSync(finalFile)) {
          if (finalFile.endsWith('.html')) {
            const rawHtml = await fsp.readFile(finalFile, 'utf-8');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(instrumentHtmlForPreview(rawHtml, id));
            return;
          }
          res.sendFile(finalFile);
          return;
        }
      }
    }

    if (!path.extname(subReqPath)) {
      const indexHtml = path.join(ws.outputDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        const rawHtml = await fsp.readFile(indexHtml, 'utf-8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(instrumentHtmlForPreview(rawHtml, id));
        return;
      }
    }

    res.status(404).send(`Asset not found: ${subReqPath}`);
  });

  // Referer-aware static asset fallback
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.path.startsWith('/api/') ||
      req.path.startsWith('/auth/') ||
      req.path.startsWith('/sandbox-api/') ||
      req.path.startsWith('/preview/') ||
      req.path.startsWith('/src/') ||
      req.path.startsWith('/@') ||
      req.path.startsWith('/node_modules/.vite')
    ) {
      next();
      return;
    }

    const referer = req.headers.referer || '';
    const match = referer.match(/\/preview\/([a-zA-Z0-9_-]+)\//);
    const wsId = match?.[1] || (req.path.startsWith('/assets/') ? lastActivePreviewId : null);

    if (wsId) {
      const ws = workspaces.get(wsId);
      if (ws?.outputDir) {
        const candidate = path.resolve(ws.outputDir, req.path.replace(/^\/+/, ''));
        if (
          candidate.startsWith(path.resolve(ws.outputDir)) &&
          fs.existsSync(candidate) &&
          fs.statSync(candidate).isFile()
        ) {
          res.sendFile(candidate);
          return;
        }
      }
    }
    next();
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RepoForge Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
