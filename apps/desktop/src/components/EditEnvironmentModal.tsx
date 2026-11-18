import React, { useState, useEffect } from "react";
import { useVaultStore } from "../stores/vault-store";
import { Layers, AlertTriangle } from "lucide-react";
import type { EnvironmentRecord } from "../lib/types";

interface EditEnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  environment: EnvironmentRecord | null;
}

export const EditEnvironmentModal: React.FC<EditEnvironmentModalProps> = ({
  isOpen,
  onClose,
  environment,
}) => {
  const updateEnvironment = useVaultStore((s) => s.updateEnvironment);

  const [name, setName] = useState("");
  const [isProduction, setIsProduction] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (environment) {
      setName(environment.name);
      setIsProduction(environment.is_production);
      setError(null);
    }
  }, [environment, isOpen]);

  if (!isOpen || !environment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);

    try {
      setLoading(true);
      await updateEnvironment(environment.id, name.trim(), isProduction);
      onClose();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] border border-[#1e1e22] rounded-xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex items-center gap-2.5 mb-4">
          <Layers className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-sm">Edit Environment</h3>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Environment Name
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production, Staging, Local"
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Rename this environment so it is clean, organized, and easy to find.
            </p>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={isProduction}
              onChange={(e) => setIsProduction(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-rose-500 focus:ring-rose-500"
            />
            <span className="flex items-center gap-1.5">
              <span>Mark as Production</span>
              {isProduction && (
                <span className="text-[10px] px-1 py-0.2 bg-rose-500/20 text-rose-400 font-bold rounded">
                  PROD
                </span>
              )}
            </span>
          </label>

          {isProduction && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-[11px] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                Production environments display warning badges and guard sensitive credentials.
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs font-medium transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition cursor-pointer"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
