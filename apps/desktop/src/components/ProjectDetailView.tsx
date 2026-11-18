import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import {
  Plus,
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  Edit2,
  FileDown,
  FileUp,
  AlertTriangle,
  Layers,
  FolderGit2,
} from "lucide-react";
import type { VarType } from "../lib/types";

interface ProjectDetailViewProps {
  onNewEnvironment: () => void;
  onImport: () => void;
  onExport: () => void;
}

export const ProjectDetailView: React.FC<ProjectDetailViewProps> = ({
  onNewEnvironment,
  onImport,
  onExport,
}) => {
  const projects = useVaultStore((s) => s.projects);
  const activeProjectId = useVaultStore((s) => s.activeProjectId);
  const environments = useVaultStore((s) => s.environments);
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const selectEnvironment = useVaultStore((s) => s.selectEnvironment);
  const variables = useVaultStore((s) => s.variables);
  const refreshVariables = useVaultStore((s) => s.refreshVariables);

  // Variable reveal states (ephemeral in React state, cleared immediately on navigation)
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Variable form modal
  const [isAddingVar, setIsAddingVar] = useState(false);
  const [varKey, setVarKey] = useState("");
  const [varValue, setVarValue] = useState("");
  const [varType, setVarType] = useState<VarType>("secret");
  const [varDescription, setVarDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeEnv = environments.find((e) => e.id === activeEnvironmentId);

  const handleToggleReveal = async (varId: string) => {
    if (!activeEnvironmentId) return;

    if (revealedValues[varId]) {
      const next = { ...revealedValues };
      delete next[varId];
      setRevealedValues(next);
    } else {
      try {
        const val = await api.revealVariableValue(activeEnvironmentId, varId);
        setRevealedValues((prev) => ({ ...prev, [varId]: val }));
      } catch (e: any) {
        console.error("Failed to reveal secret:", e);
      }
    }
  };

  const handleCopyValue = async (varId: string, fallbackValue?: string) => {
    if (!activeEnvironmentId) return;
    try {
      let textToCopy = revealedValues[varId] || fallbackValue;
      if (!textToCopy) {
        textToCopy = await api.revealVariableValue(activeEnvironmentId, varId);
      }
      await navigator.clipboard.writeText(textToCopy);
      setCopiedKey(varId);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  const handleCreateVariable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEnvironmentId) return;
    setFormError(null);

    try {
      await api.createVariable({
        envId: activeEnvironmentId,
        key: varKey.trim(),
        value: varValue,
        varType,
        description: varDescription.trim() || undefined,
        tags: [],
      });

      setIsAddingVar(false);
      setVarKey("");
      setVarValue("");
      setVarDescription("");
      await refreshVariables(activeEnvironmentId);
    } catch (err: any) {
      setFormError(err.toString());
    }
  };

  const handleDeleteVariable = async (varId: string) => {
    if (!activeEnvironmentId) return;
    if (confirm("Are you sure you want to delete this variable?")) {
      await api.deleteVariable(activeEnvironmentId, varId);
      await refreshVariables(activeEnvironmentId);
    }
  };

  if (!activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-zinc-500">
        No project selected
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Project Header */}
      <div className="h-14 px-6 border-b border-[#1e1e22] flex items-center justify-between shrink-0 bg-[#0d0d0f]">
        <div className="flex items-center gap-3">
          <FolderGit2 className="w-5 h-5 text-indigo-400" />
          <h1 className="font-semibold text-white text-sm">{activeProject.name}</h1>
          {activeProject.description && (
            <span className="text-xs text-zinc-500 max-w-sm truncate">
              — {activeProject.description}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onImport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Import .env</span>
          </button>

          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddingVar(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition shadow-md shadow-indigo-600/20"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Variable</span>
          </button>
        </div>
      </div>

      {/* Environment Selector Tabs */}
      <div className="h-11 px-6 border-b border-[#1e1e22] flex items-center justify-between bg-[#111113] shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {environments.map((env) => {
            const isSelected = activeEnvironmentId === env.id;
            return (
              <button
                key={env.id}
                type="button"
                onClick={() => selectEnvironment(env.id)}
                className={`flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium transition shrink-0 ${
                  isSelected
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/40"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    env.is_production ? "bg-rose-500" : "bg-emerald-400"
                  }`}
                />
                <span>{env.name}</span>
                {env.is_production && (
                  <span className="text-[9px] px-1 bg-rose-500/20 text-rose-300 rounded font-semibold uppercase">
                    Prod
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={onNewEnvironment}
            className="flex items-center gap-1 px-2.5 py-1 text-zinc-500 hover:text-indigo-400 hover:bg-zinc-800/40 rounded-md text-xs transition shrink-0"
            title="Create Environment"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Env</span>
          </button>
        </div>
      </div>

      {/* Production Warning Banner */}
      {activeEnv?.is_production && (
        <div className="px-6 py-2 bg-rose-950/30 border-b border-rose-900/30 flex items-center gap-2 text-rose-300 text-xs shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>
            <strong>Production Environment:</strong> Changes are sensitive and directly affect live deployment secrets.
          </span>
        </div>
      )}

      {/* Variables Table */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-[#141416] border border-[#1e1e22] rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1e1e22] bg-[#0d0d0f]/60 text-zinc-400 font-medium uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Key</th>
                <th className="py-3 px-4">Value</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e22]">
              {variables.map((v) => {
                const isRevealed = !!revealedValues[v.id];
                const displayedVal = isRevealed ? revealedValues[v.id] : "••••••••••••";

                return (
                  <tr
                    key={v.id}
                    className="hover:bg-zinc-800/20 transition group"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-white">
                      {v.key}
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-300">
                      <span className={isRevealed ? "text-indigo-300" : "text-zinc-500"}>
                        {displayedVal}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-300 uppercase font-medium">
                        {v.var_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 truncate max-w-xs">
                      {v.description || "—"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleReveal(v.id)}
                          className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition"
                          title={isRevealed ? "Hide Value" : "Reveal Value"}
                        >
                          {isRevealed ? (
                            <EyeOff className="w-3.5 h-3.5 text-indigo-400" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyValue(v.id)}
                          className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition"
                          title="Copy Value"
                        >
                          {copiedKey === v.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteVariable(v.id)}
                          className="p-1.5 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 rounded transition"
                          title="Delete Variable"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {variables.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500">
                    No variables in this environment yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Variable Modal */}
      {isAddingVar && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#141416] border border-[#1e1e22] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="font-semibold text-white text-base mb-4">Add Variable</h3>

            {formError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs mb-4">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateVariable} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Key Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="DATABASE_URL"
                  value={varKey}
                  onChange={(e) => setVarKey(e.target.value)}
                  className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Secret Value</label>
                <textarea
                  required
                  rows={2}
                  placeholder="postgres://user:pass@localhost:5432/db"
                  value={varValue}
                  onChange={(e) => setVarValue(e.target.value)}
                  className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                />
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
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Description (Optional)</label>
                  <input
                    type="text"
                    placeholder="Database conn string"
                    value={varDescription}
                    onChange={(e) => setVarDescription(e.target.value)}
                    className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingVar(false)}
                  className="px-3 py-2 text-zinc-400 hover:text-white text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition shadow-md shadow-indigo-600/20"
                >
                  Save Variable
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
