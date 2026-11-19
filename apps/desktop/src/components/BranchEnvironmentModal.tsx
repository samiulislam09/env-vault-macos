import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import { GitBranch, Sparkles } from "lucide-react";

interface BranchEnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BranchEnvironmentModal: React.FC<BranchEnvironmentModalProps> = ({
  isOpen,
  onClose,
}) => {
  const activeProjectId = useVaultStore((s) => s.activeProjectId);
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const environments = useVaultStore((s) => s.environments);
  const refreshEnvironments = useVaultStore((s) => s.refreshEnvironments);
  const selectEnvironment = useVaultStore((s) => s.selectEnvironment);

  const currentEnv = environments.find((e) => e.id === activeEnvironmentId);

  const [branchName, setBranchName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !activeEnvironmentId || !activeProjectId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!branchName.trim()) return;

    try {
      setLoading(true);
      const newEnv = await api.branchEnvironment(
        activeEnvironmentId,
        branchName.trim()
      );

      await refreshEnvironments(activeProjectId);
      await selectEnvironment(newEnv.id);
      onClose();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const setPrefix = (prefix: string) => {
    if (!branchName.startsWith(prefix)) {
      setBranchName(`${prefix}${branchName.replace(/^(feat\/|fix\/|test\/|chore\/)/, "")}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] border border-[#27272a] rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">Branch Environment</h3>
            <p className="text-xs text-zinc-500">
              Create an isolated working copy branched from{" "}
              <span className="text-zinc-300 font-medium">{currentEnv?.name}</span>
            </p>
          </div>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Branch Name
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. feat/stripe-billing or fix/db-connection"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-500">Quick prefixes:</span>
            {["feat/", "fix/", "test/", "exp/"].map((prefix) => (
              <button
                key={prefix}
                type="button"
                onClick={() => setPrefix(prefix)}
                className="px-2 py-0.5 rounded text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
              >
                {prefix}
              </button>
            ))}
          </div>

          <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs text-zinc-400 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Safe & Isolated</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Branch environments inherit all encrypted variables. You can safely add, modify, or test credentials, then use{" "}
              <strong className="text-zinc-200">Merge Environments</strong> to apply diffs back.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !branchName.trim()}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5"
            >
              {loading ? "Creating..." : "Create Branch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
