import React, { useState, useEffect } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import { Edit2 } from "lucide-react";
import type { VariableSummary, VarType } from "../lib/types";

interface EditVariableModalProps {
  variable: VariableSummary | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EditVariableModal: React.FC<EditVariableModalProps> = ({
  variable,
  isOpen,
  onClose,
}) => {
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const refreshVariables = useVaultStore((s) => s.refreshVariables);

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [varType, setVarType] = useState<VarType>("secret");
  const [description, setDescription] = useState("");
  const [keepCurrentValue, setKeepCurrentValue] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (variable) {
      setKey(variable.key);
      setVarType(variable.var_type);
      setDescription(variable.description || "");
      setValue("");
      setKeepCurrentValue(true);
      setError(null);
    }
  }, [variable]);

  if (!isOpen || !variable || !activeEnvironmentId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!key.trim()) return;

    try {
      setLoading(true);
      await api.updateVariable({
        envId: activeEnvironmentId,
        varId: variable.id,
        key: key.trim(),
        value: keepCurrentValue ? undefined : value,
        varType,
        description: description.trim() || undefined,
        tags: variable.tags,
      });

      await refreshVariables(activeEnvironmentId);
      onClose();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] border border-[#27272a] rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center gap-2.5 mb-4">
          <Edit2 className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-sm">Edit Variable</h3>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Key Name</label>
            <input
              type="text"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-zinc-300">Secret Value</label>
              <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepCurrentValue}
                  onChange={(e) => setKeepCurrentValue(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Keep existing secret value</span>
              </label>
            </div>

            {!keepCurrentValue ? (
              <textarea
                required
                rows={3}
                placeholder="Enter new secret value..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
              />
            ) : (
              <div className="p-2.5 bg-[#0a0a0b] border border-[#27272a] rounded-lg text-xs font-mono text-zinc-500">
                •••••••••••• (Encrypted in vault)
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Type</label>
              <select
                value={varType}
                onChange={(e) => setVarType(e.target.value as VarType)}
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
              >
                <option value="secret">Secret</option>
                <option value="public">Public</option>
                <option value="configuration">Configuration</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="url">URL</option>
                <option value="json">JSON</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Description</label>
              <input
                type="text"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-zinc-400 hover:text-white text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition shadow-md shadow-indigo-600/20"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
