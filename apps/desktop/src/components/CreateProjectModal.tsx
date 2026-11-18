import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import { FolderGit2 } from "lucide-react";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [envName, setEnvName] = useState("Development");
  const [isProduction, setIsProduction] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useVaultStore((s) => s.refreshProjects);
  const selectProject = useVaultStore((s) => s.selectProject);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;

    try {
      setLoading(true);
      const proj = await api.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
      });

      // Auto-create initial environment for the project with chosen name
      await api.createEnvironment({
        projectId: proj.id,
        name: envName.trim() || "Development",
        isDefault: true,
        isProduction,
      });

      await refreshProjects();
      await selectProject(proj.id);
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
          <FolderGit2 className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-sm">Create New Project</h3>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Project Name
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. SeloraX, Piku, Voice AI"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              placeholder="E-commerce microservices, API backend..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="pt-2 border-t border-zinc-800/80">
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Starter Environment Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Development, Production, Staging, Local"
              value={envName}
              onChange={(e) => {
                setEnvName(e.target.value);
                if (e.target.value.toLowerCase().includes("prod")) {
                  setIsProduction(true);
                }
              }}
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Customize the initial environment name (e.g. &apos;Development&apos;, &apos;Production&apos;, &apos;Local&apos;).
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={isProduction}
              onChange={(e) => setIsProduction(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500"
            />
            <span>Mark starter environment as Production</span>
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
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
