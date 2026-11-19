import React, { useState, useEffect } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import {
  GitMerge,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  Clock,
} from "lucide-react";
import type { MergeDiffReport, MergeDiffItem } from "../lib/types";

interface MergeEnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MergeEnvironmentModal: React.FC<MergeEnvironmentModalProps> = ({
  isOpen,
  onClose,
}) => {
  const activeProjectId = useVaultStore((s) => s.activeProjectId);
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const environments = useVaultStore((s) => s.environments);
  const refreshVariables = useVaultStore((s) => s.refreshVariables);
  const refreshEnvironments = useVaultStore((s) => s.refreshEnvironments);

  const [sourceEnvId, setSourceEnvId] = useState<string>("");
  const [targetEnvId, setTargetEnvId] = useState<string>("");
  const [diffReport, setDiffReport] = useState<MergeDiffReport | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"changes" | "all" | "new" | "modified">("changes");

  const [loadingDiff, setLoadingDiff] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize source and target envs
  useEffect(() => {
    if (isOpen && environments.length >= 2) {
      const src = activeEnvironmentId || environments[0].id;
      const tgt = environments.find((e) => e.id !== src)?.id || environments[1].id;
      setSourceEnvId(src);
      setTargetEnvId(tgt);
      setError(null);
      setSuccessMessage(null);
    }
  }, [isOpen, activeEnvironmentId, environments]);

  // Load diff whenever source or target changes
  useEffect(() => {
    if (isOpen && sourceEnvId && targetEnvId && sourceEnvId !== targetEnvId) {
      loadDiff(sourceEnvId, targetEnvId);
    } else {
      setDiffReport(null);
    }
  }, [isOpen, sourceEnvId, targetEnvId]);

  const loadDiff = async (srcId: string, tgtId: string) => {
    try {
      setLoadingDiff(true);
      setError(null);
      const report = await api.getMergeDiff(srcId, tgtId);
      setDiffReport(report);

      // Pre-select all new and modified keys
      const autoSelect = new Set<string>();
      report.items.forEach((item) => {
        if (item.status === "new" || item.status === "modified") {
          autoSelect.add(item.key);
        }
      });
      setSelectedKeys(autoSelect);
    } catch (err: any) {
      setError(err.toString());
      setDiffReport(null);
    } finally {
      setLoadingDiff(false);
    }
  };

  if (!isOpen || !activeProjectId) return null;

  const toggleSelectKey = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedKeys(next);
  };

  const selectAllChanges = () => {
    if (!diffReport) return;
    const next = new Set<string>();
    diffReport.items.forEach((item) => {
      if (item.status === "new" || item.status === "modified") {
        next.add(item.key);
      }
    });
    setSelectedKeys(next);
  };

  const deselectAll = () => {
    setSelectedKeys(new Set());
  };

  const toggleReveal = (key: string) => {
    const next = new Set(revealedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setRevealedKeys(next);
  };

  const handleApplyMerge = async () => {
    if (!sourceEnvId || !targetEnvId || selectedKeys.size === 0) return;
    try {
      setMerging(true);
      setError(null);
      const res = await api.mergeEnvironments(
        sourceEnvId,
        targetEnvId,
        Array.from(selectedKeys)
      );

      setSuccessMessage(
        `Successfully merged ${res.applied_count} variable(s) into ${res.target_env_name}!`
      );
      await refreshEnvironments(activeProjectId);
      if (activeEnvironmentId) {
        await refreshVariables(activeEnvironmentId);
      }
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setMerging(false);
    }
  };

  const filteredItems = diffReport
    ? diffReport.items.filter((item) => {
        if (filter === "changes") return item.status === "new" || item.status === "modified";
        if (filter === "new") return item.status === "new";
        if (filter === "modified") return item.status === "modified";
        return true;
      })
    : [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] border border-[#27272a] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">
                Merge Environment Variables
              </h3>
              <p className="text-xs text-zinc-500">
                Compare and cherry-pick variables to merge between branches
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-xs px-2 py-1 transition"
          >
            ✕
          </button>
        </div>

        {/* Source & Target Selector */}
        <div className="p-5 bg-[#0e0e10] border-b border-[#27272a] grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400 mb-1">
              Source Environment (Branch)
            </label>
            <select
              value={sourceEnvId}
              onChange={(e) => setSourceEnvId(e.target.value)}
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name} {env.is_production ? "(Prod)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
              <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Target Environment (Merge into)
              </label>
            </div>
            <select
              value={targetEnvId}
              onChange={(e) => setTargetEnvId(e.target.value)}
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              {environments
                .filter((e) => e.id !== sourceEnvId)
                .map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name} {env.is_production ? "(Prod)" : ""}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Diff Stats Banner */}
        {diffReport && (
          <div className="px-5 py-3 bg-[#121214] border-b border-[#27272a] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                {diffReport.new_count} New
              </span>
              <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                {diffReport.modified_count} Modified
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-zinc-600"></span>
                {diffReport.identical_count} Identical
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllChanges}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
              >
                Select All Changes
              </button>
              <span className="text-zinc-600">•</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-[11px] text-zinc-400 hover:text-zinc-300 font-medium"
              >
                Deselect All
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="m-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="m-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Diff Content / List */}
        <div className="p-5 flex-1 overflow-y-auto space-y-2.5">
          {loadingDiff ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
              <p className="text-xs">Computing cryptographic diff between environments...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs">
              {diffReport && diffReport.new_count === 0 && diffReport.modified_count === 0
                ? "Environments are completely in sync! No differing variables found."
                : "No variables match the selected filter."}
            </div>
          ) : (
            filteredItems.map((item) => {
              const isSelected = selectedKeys.has(item.key);
              const isRevealed = revealedKeys.has(item.key);

              return (
                <div
                  key={item.key}
                  className={`border rounded-lg p-3 transition ${
                    isSelected
                      ? "bg-zinc-900/80 border-indigo-500/40"
                      : "bg-[#161618] border-[#27272a] opacity-75"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectKey(item.key)}
                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-mono text-xs font-semibold text-white">
                        {item.key}
                      </span>
                    </label>

                    <div className="flex items-center gap-2">
                      {item.status === "new" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          + New Variable
                        </span>
                      )}
                      {item.status === "modified" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          ~ Modified
                        </span>
                      )}
                      {item.status === "identical" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400">
                          = Identical
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleReveal(item.key)}
                        className="text-zinc-500 hover:text-zinc-300 p-1"
                        title={isRevealed ? "Hide values" : "Reveal values"}
                      >
                        {isRevealed ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Value diff inspection */}
                  <div className="mt-2.5 pt-2 border-t border-zinc-800/60 font-mono text-[11px] space-y-1">
                    {item.status === "modified" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded bg-rose-500/5 border border-rose-500/20 text-rose-300">
                          <div className="text-[10px] text-zinc-500 mb-0.5">Target Value</div>
                          <div className="truncate">
                            {isRevealed
                              ? item.target_value || "<empty>"
                              : "••••••••••••"}
                          </div>
                        </div>
                        <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/20 text-emerald-300">
                          <div className="text-[10px] text-zinc-500 mb-0.5">Source Value</div>
                          <div className="truncate">
                            {isRevealed
                              ? item.source_value || "<empty>"
                              : "••••••••••••"}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-zinc-400 text-xs">
                        Value:{" "}
                        <span className="text-zinc-200">
                          {isRevealed
                            ? item.source_value || "<empty>"
                            : "••••••••••••"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#0e0e10] border-t border-[#27272a] flex items-center justify-between">
          <div className="text-xs text-zinc-400">
            <span className="text-white font-medium">{selectedKeys.size}</span> variable(s) selected to merge
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={merging || selectedKeys.size === 0}
              onClick={handleApplyMerge}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5 shadow-sm"
            >
              <GitMerge className="w-3.5 h-3.5" />
              {merging ? "Merging..." : `Apply Merge (${selectedKeys.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
