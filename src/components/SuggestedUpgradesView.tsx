import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  Loader2,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import type { UpgradeCategory, UpgradeItem } from '../types';
import { apiFetch } from '../utils/api';

interface SuggestedUpgradesViewProps {
  onNavigate: (path: string) => void;
}

const CATEGORIES: Array<'All' | UpgradeCategory> = [
  'All',
  'Build & Runtime',
  'Cloud & Data',
  'Developer UX',
  'Automation',
];

function getCategoryAccent(category: UpgradeCategory): string {
  switch (category) {
    case 'Automation':
      return 'text-orange-600 dark:text-orange-400';
    case 'Build & Runtime':
      return 'text-cyan-600 dark:text-cyan-400';
    case 'Cloud & Data':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'Developer UX':
    default:
      return 'text-blue-600 dark:text-sky-400';
  }
}

export const SuggestedUpgradesView: React.FC<SuggestedUpgradesViewProps> = ({ onNavigate }) => {
  const [upgrades, setUpgrades] = useState<UpgradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'All' | UpgradeCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [votedIds, setVotedIds] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('rf_voted_upgrades');
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New Upgrade Proposal Form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<UpgradeCategory>('Developer UX');
  const [scope, setScope] = useState('');
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadUpgrades = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/upgrades');
      if (res.ok) {
        const data = (await res.json()) as { upgrades: UpgradeItem[] };
        setUpgrades(data.upgrades || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUpgrades();
  }, [loadUpgrades]);

  const handleToggleVote = async (id: string) => {
    const alreadyVoted = Boolean(votedIds[id]);
    const delta = alreadyVoted ? -1 : 1;
    const nextVoted = { ...votedIds, [id]: !alreadyVoted };
    setVotedIds(nextVoted);
    try {
      localStorage.setItem('rf_voted_upgrades', JSON.stringify(nextVoted));
    } catch {
      // Ignore storage quota
    }

    const res = await apiFetch(`/api/upgrades/${id}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta }),
    });
    if (res.ok) {
      const data = (await res.json()) as { upgrades: UpgradeItem[] };
      setUpgrades(data.upgrades);
    }
  };

  const handleProposeUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !summary.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitNotice(null);
    try {
      const res = await apiFetch('/api/upgrades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category,
          scope: scope.trim() || undefined,
          summary: summary.trim(),
        }),
      });
      const data = (await res.json()) as {
        upgrade?: UpgradeItem;
        upgrades?: UpgradeItem[];
        error?: string;
      };
      if (!res.ok || !data.upgrades) {
        throw new Error(data.error || 'Unable to save suggested upgrade.');
      }
      setUpgrades(data.upgrades);
      setTitle('');
      setScope('');
      setSummary('');
      setSubmitNotice(`Added "${data.upgrade?.title}" to Suggested Upgrades & Add-Ons.`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUpgrades = useMemo(() => {
    return upgrades.filter((item) => {
      if (activeCategory !== 'All' && item.category !== activeCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.summary.toLowerCase().includes(q) ||
          item.scope.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [upgrades, activeCategory, searchQuery]);

  const totalVotes = useMemo(
    () => upgrades.reduce((sum, item) => sum + item.votes, 0),
    [upgrades]
  );

  return (
    <div className="space-y-8">
      {/* Bright Header Banner */}
      <div className="rounded-2xl border border-orange-200/80 dark:border-slate-800 bg-gradient-to-r from-orange-50 via-amber-50/70 to-cyan-50 dark:from-[#131B2E] dark:via-[#111827] dark:to-[#0F1E2E] p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-orange-600 dark:text-orange-400">
              <Sparkles className="w-4 h-4" />
              <span>Product Roadmap · Suggested Updates &amp; Studio Add-Ons</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Suggested Upgrades, Updates &amp; Add-Ons
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Prioritize upcoming capabilities for RepoForge Studio, copy ready-to-build engineering specs with one click, or submit your own custom add-on request below.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="h-10 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Studio Workspace</span>
            </button>
            <a
              href="#propose-upgrade"
              className="h-10 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Submit New Add-On</span>
            </a>
          </div>
        </div>

        {/* Inline Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-6 mt-6 border-t border-orange-200/60 dark:border-slate-800 text-xs">
          <div>
            <div className="text-slate-500 dark:text-slate-400">Available Upgrades</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
              {upgrades.length}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Priority Upvotes</div>
            <div className="text-lg font-bold text-orange-600 dark:text-orange-400 font-mono tabular-nums mt-0.5">
              {totalVotes}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">High-Impact Modules</div>
            <div className="text-lg font-bold text-cyan-600 dark:text-cyan-400 font-mono tabular-nums mt-0.5">
              {upgrades.filter((u) => u.impact === 'High Impact').length}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Community Submissions</div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-0.5">
              {upgrades.filter((u) => u.isCustom).length}
            </div>
          </div>
        </div>
      </div>

      {/* Category Filter & Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          {CATEGORIES.map((cat) => {
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-orange-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <div className="relative md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search upgrades or add-ons..."
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {/* Suggested Upgrades Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
          <span>Loading suggested upgrades and add-ons...</span>
        </div>
      ) : filteredUpgrades.length === 0 ? (
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-xl p-10 text-center text-xs text-slate-500 dark:text-slate-400">
          No upgrades match your current filter. Try another category or submit a custom idea below.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredUpgrades.map((item) => {
            const hasVoted = Boolean(votedIds[item.id]);
            const isCopied = copiedId === item.id;
            return (
              <div
                key={item.id}
                className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-xl p-6 flex flex-col justify-between gap-5 shadow-2xs hover:border-orange-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span className={`font-semibold ${getCategoryAccent(item.category)}`}>
                        {item.category}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 font-medium">
                        {item.impact}
                      </span>
                      {item.isCustom && (
                        <>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                            ·
                          </span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            Community Add-On
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleToggleVote(item.id)}
                      className={`h-8 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer font-mono tabular-nums ${
                        hasVoted
                          ? 'border-orange-500 bg-orange-500 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:border-orange-400 text-slate-700 dark:text-slate-200'
                      }`}
                      title={hasVoted ? 'Remove vote' : 'Upvote this upgrade'}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                      <span>{item.votes}</span>
                    </button>
                  </div>

                  <h2 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                    {item.title}
                  </h2>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.summary}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Scope: {item.scope}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(item.prompt);
                      setCopiedId(item.id);
                      setTimeout(() => setCopiedId(null), 1800);
                    }}
                    className="h-8 px-3 rounded-lg border border-cyan-300 dark:border-cyan-700/60 bg-cyan-50 dark:bg-cyan-950/30 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 text-cyan-800 dark:text-cyan-300 font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                  >
                    {isCopied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{isCopied ? 'Copied Build Spec' : 'Copy Upgrade Prompt'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit Custom Suggested Upgrade / Add-On Form */}
      <div
        id="propose-upgrade"
        className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] rounded-2xl p-6 sm:p-8 space-y-5"
      >
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Propose a Suggested Upgrade, Update, or Add-On
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Have an integration, framework adapter, or automation tool you want added next? Submit it here to pin it to the roadmap board.
          </p>
        </div>

        {submitNotice && (
          <div className="p-3.5 rounded-xl border border-emerald-300 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{submitNotice}</span>
          </div>
        )}

        {submitError && (
          <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-300">
            {submitError}
          </div>
        )}

        <form onSubmit={(e) => void handleProposeUpgrade(e)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Upgrade or Add-On Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Automatic Tailwind v4 Config Migrator"
                className="w-full h-10 px-3.5 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as UpgradeCategory)}
                className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500"
              >
                <option value="Developer UX">Developer UX</option>
                <option value="Build & Runtime">Build &amp; Runtime</option>
                <option value="Cloud & Data">Cloud &amp; Data</option>
                <option value="Automation">Automation</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Technical Scope (Optional)
              </label>
              <input
                type="text"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="e.g. Build pipeline + AST codemod"
                className="w-full h-10 px-3.5 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              How should this upgrade work?
            </label>
            <textarea
              required
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Describe what this update or add-on should inspect, automate, or unlock for imported GitHub repositories..."
              className="w-full p-3.5 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !title.trim() || !summary.trim()}
              className="h-10 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Add to Suggested Upgrades</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
