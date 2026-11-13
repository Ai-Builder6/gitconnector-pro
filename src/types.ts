export type BuildStatus = 'idle' | 'cloning' | 'ready' | 'building' | 'succeeded' | 'failed';

export interface SubProjectInfo {
  subPath: string;
  label: string;
  framework: string;
  hasBuildScript: boolean;
  hasIndexHtml: boolean;
  dependencyCount: number;
}

export interface FileEntry {
  path: string;
  type: 'file' | 'dir';
  size: number;
}

export interface DependencyItem {
  name: string;
  version: string;
  kind: 'runtime' | 'dev';
  note?: string;
}

export interface NormalizationAction {
  id: string;
  title: string;
  detail: string;
  severity: 'info' | 'warning';
}

export interface BuildArtifact {
  path: string;
  size: number;
  category: 'script' | 'style' | 'markup' | 'asset';
}

export interface EnvVarItem {
  key: string;
  value: string;
  source: 'example' | 'detected' | 'custom';
}

export interface LanguageStat {
  language: string;
  files: number;
  bytes: number;
}

export interface SmokeProbeCheck {
  id: string;
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  metric?: string;
}

export interface SmokeProbeReport {
  ranAt: string;
  overallStatus: 'healthy' | 'degraded' | 'failed';
  responseTimeMs: number;
  entryTitle: string;
  totalJsBytes: number;
  totalCssBytes: number;
  verifiedAssets: number;
  missingAssets: string[];
  missingEnvKeys: string[];
  checks: SmokeProbeCheck[];
}

export interface DetectedSchemaField {
  name: string;
  type: string;
  isPrimary?: boolean;
  isOptional?: boolean;
}

export interface DetectedSchemaModel {
  name: string;
  sourceFile: string;
  orm: 'Prisma' | 'Drizzle' | 'SQL' | 'Mongoose';
  fields: DetectedSchemaField[];
}

export interface DatabaseSchemaSummary {
  detected: boolean;
  ormType: string;
  sourceFiles: string[];
  models: DetectedSchemaModel[];
}

export interface ApiServerState {
  capable: boolean;
  detectedEntry: string | null;
  startCommand: string | null;
  status: 'stopped' | 'starting' | 'running' | 'error';
  port?: number;
  proxyBaseUrl?: string;
  startedAt?: string;
  errorMessage?: string;
  logs: string[];
}

export interface WorkspaceDetail {
  id: string;
  repoUrl: string;
  owner: string;
  repoName: string;
  branch: string;
  isPrivate?: boolean;
  commitHash: string;
  commitShort: string;
  commitAuthor: string;
  commitRelativeTime: string;
  commitMessage: string;
  createdAt: string;
  targetSubPath: string;
  status: BuildStatus;
  errorMessage?: string;
  framework: string;
  packageManager: string;
  buildStrategy: string;
  totalFiles: number;
  totalBytes: number;
  scripts: Record<string, string>;
  dependencies: DependencyItem[];
  normalizations: NormalizationAction[];
  subProjects: SubProjectInfo[];
  files: FileEntry[];
  languages: LanguageStat[];
  envVars: EnvVarItem[];
  readme: string;
  buildDurationMs?: number;
  builtAt?: string;
  previewUrl?: string;
  outputDirRelative?: string;
  artifacts: BuildArtifact[];
  logs: string[];
  smokeProbe?: SmokeProbeReport;
  databaseSchema: DatabaseSchemaSummary;
  apiServer: ApiServerState;
}

export interface WorkspaceSummary {
  id: string;
  owner: string;
  repoName: string;
  branch: string;
  commitShort: string;
  targetSubPath: string;
  framework: string;
  status: BuildStatus;
  totalFiles: number;
  totalBytes: number;
  buildDurationMs?: number;
  previewUrl?: string;
  apiRunning?: boolean;
  probeStatus?: 'healthy' | 'degraded' | 'failed';
  createdAt: string;
}

export interface BuildOptions {
  autoNormalize: boolean;
  cleanInstall: boolean;
}

export interface RuntimePreviewEvent {
  id: string;
  level: 'log' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export interface GitHubAuthStatus {
  configured: boolean;
  connected: boolean;
  user: GitHubUser | null;
  callbackUrl: string;
}

export interface GitHubRepoItem {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  updated_at: string;
}

export interface GitHubBranchItem {
  name: string;
  commitSha: string;
}

export interface GitHubPullRequestItem {
  number: number;
  title: string;
  headRef: string;
  baseRef: string;
  author: string;
}

export interface DiffFileChange {
  path: string;
  changeType: 'added' | 'removed' | 'modified';
  baseSize: number;
  headSize: number;
  deltaBytes: number;
}

export interface WorkspaceDiffReport {
  baseId: string;
  headId: string;
  baseLabel: string;
  headLabel: string;
  baseTotalArtifactBytes: number;
  headTotalArtifactBytes: number;
  artifactDeltaBytes: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchangedCount: number;
  changes: DiffFileChange[];
}
