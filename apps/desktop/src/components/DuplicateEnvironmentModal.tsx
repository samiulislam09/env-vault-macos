import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import { Copy, Layers } from "lucide-react";

interface DuplicateEnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DuplicateEnvironmentModal: React.FC<DuplicateEnvironmentModalProps> = ({
  isOpen,
  onClose,
}) => {
  const activeProjectId = useVaultStore((s) => s.activeProjectId);
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const environments = useVaultStore((s) => s.environments);
  const refreshEnvironments = useVaultStore((s) => s.refreshEnvironments);
  const selectEnvironment = useVaultStore((s) => s.selectEnvironment);

  const currentEnv = environments.find((e) => e.id === activeEnvironmentId);

  const [name, setName] = useState(currentEnv ? `${currentEnv.name} Copy` : "");
  const [isProduction, setIsProduction] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !activeEnvironmentId || !activeProjectId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;

    try {
      setLoading(true);
      const newEnv = await api.duplicateEnvironment(
        activeEnvironmentId,
        name.trim(),
        isProduction
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] border border-[#27272a] rounded-xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex items-center gap-2.5 mb-4">
          <Copy className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="font-semibold text-white text-sm">Duplicate Environment</h3>
            <p className="text-xs text-zinc-500">
              Cloning all variables from <span className="text-zinc-300 font-medium">{currentEnv?.name}</span>
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
            <label className="block text-xs font-medium text-zinc-300 mb-1">New Environment Name</label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Staging, Production"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={isProduction}
              onChange={(e) => setIsProduction(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-rose-600 focus:ring-rose-500"
            />
            <span>Mark as Production Environment</span>
          </label>

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
              disabled={loading || !name.trim()}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition"
            >
              {loading ? "Duplicating..." : "Clone Environment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
