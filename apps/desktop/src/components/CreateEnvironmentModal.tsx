import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import { Layers } from "lucide-react";

interface CreateEnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateEnvironmentModal: React.FC<CreateEnvironmentModalProps> = ({
  isOpen,
  onClose,
}) => {
  const activeProjectId = useVaultStore((s) => s.activeProjectId);
  const refreshEnvironments = useVaultStore((s) => s.refreshEnvironments);
  const selectEnvironment = useVaultStore((s) => s.selectEnvironment);

  const [name, setName] = useState("");
  const [isProduction, setIsProduction] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !activeProjectId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;

    try {
      setLoading(true);
      const env = await api.createEnvironment({
        projectId: activeProjectId,
        name: name.trim(),
        isDefault: false,
        isProduction,
        templateId: templateId || undefined,
      });

      await refreshEnvironments(activeProjectId);
      await selectEnvironment(env.id);
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
          <h3 className="font-semibold text-white text-sm">Add Environment</h3>
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
              placeholder="e.g. Staging, Production, GPU Server"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.toLowerCase().includes("prod")) {
                  setIsProduction(true);
                }
              }}
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Starter Template (Optional)
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">None (Empty Environment)</option>
              <option value="nextjs">Next.js Template</option>
              <option value="nodejs">Node.js / Express Template</option>
              <option value="python">Python / FastAPI Template</option>
              <option value="ai_llm">AI & LLM Services Template</option>
            </select>
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
              {loading ? "Adding..." : "Add Environment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
