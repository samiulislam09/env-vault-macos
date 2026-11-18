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
  ClipboardPaste,
  Search,
  ShieldAlert,
  Share2,
} from "lucide-react";
import { EditVariableModal } from "./EditVariableModal";
import { SecurityAuditModal } from "./SecurityAuditModal";
import { QuickExportModal } from "./QuickExportModal";
import { DuplicateEnvironmentModal } from "./DuplicateEnvironmentModal";
import { ConfirmModal } from "./ConfirmModal";
import type { VariableSummary, VarType } from "../lib/types";

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
  const deleteProject = useVaultStore((s) => s.deleteProject);
  const environments = useVaultStore((s) => s.environments);
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const selectEnvironment = useVaultStore((s) => s.selectEnvironment);
  const refreshEnvironments = useVaultStore((s) => s.refreshEnvironments);
  const variables = useVaultStore((s) => s.variables);
  const refreshVariables = useVaultStore((s) => s.refreshVariables);

  // Variable reveal states (ephemeral in React state, cleared immediately on navigation)
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Search & Type Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Sub-Modals
  const [editingVar, setEditingVar] = useState<VariableSummary | null>(null);
  const [isQuickExportOpen, setIsQuickExportOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isDuplicateEnvOpen, setIsDuplicateEnvOpen] = useState(false);

  // Variable form modal
  const [isAddingVar, setIsAddingVar] = useState(false);
  const [addVarMode, setAddVarMode] = useState<"single" | "bulk">("single");
  const [varKey, setVarKey] = useState("");
  const [varValue, setVarValue] = useState("");
  const [varType, setVarType] = useState<VarType>("secret");
  const [varDescription, setVarDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Bulk .env import
  const [bulkContent, setBulkContent] = useState("");
  const [bulkStrategy, setBulkStrategy] = useState<"overwrite" | "skip">("overwrite");
  const [bulkLoading, setBulkLoading] = useState(false);

  // In-app confirmation dialog state
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "Delete",
    onConfirm: async () => {},
  });
  const [isDeletingLoading, setIsDeletingLoading] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeEnv = environments.find((e) => e.id === activeEnvironmentId);

  const handleDeleteEnvironment = () => {
    if (!activeEnvironmentId || !activeProjectId || !activeEnv) return;
    setConfirmConfig({
      isOpen: true,
      title: "Delete Environment",
      message: `Are you sure you want to delete environment "${activeEnv.name}" and all its encrypted secrets?`,
      confirmLabel: "Delete Environment",
      onConfirm: async () => {
        await api.deleteEnvironment(activeEnvironmentId);
        await refreshEnvironments(activeProjectId);
      },
    });
  };

  const handleDeleteCurrentProject = () => {
    if (!activeProject || !activeProjectId) return;
    setConfirmConfig({
      isOpen: true,
      title: "Delete Project",
      message: `Are you sure you want to permanently delete project "${activeProject.name}" and all its encrypted environments? This action cannot be undone.`,
      confirmLabel: "Delete Project",
      onConfirm: async () => {
        await deleteProject(activeProjectId);
      },
    });
  };

  const filteredVariables = variables.filter((v) => {
    const matchesSearch =
      v.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.description && v.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      v.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = typeFilter === "all" || v.var_type === typeFilter;

    return matchesSearch && matchesType;
  });

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

  const detectedBulkCount = bulkContent
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("=")).length;

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEnvironmentId) {
      setFormError("No environment selected. Please select an environment first.");
      return;
    }
    if (!bulkContent.trim()) {
      setFormError("Please enter or paste at least one environment variable (e.g. KEY=VALUE).");
      return;
    }
    setFormError(null);

    try {
      setBulkLoading(true);
      const count = await api.executeImport(
        activeEnvironmentId,
        bulkContent,
        "dotenv",
        bulkStrategy || "overwrite"
      );
      if (count === 0) {
        setFormError(
          "No valid variables were found. Ensure each line follows KEY=VALUE format (e.g. PORT=3000)."
        );
        return;
      }
      setIsAddingVar(false);
      setBulkContent("");
      await refreshVariables(activeEnvironmentId);
    } catch (err: any) {
      setFormError(err.toString());
    } finally {
      setBulkLoading(false);
    }
  };

  const handleDeleteVariable = (varId: string, varKey: string) => {
    if (!activeEnvironmentId) return;
    setConfirmConfig({
      isOpen: true,
      title: "Delete Variable",
      message: `Are you sure you want to delete the variable "${varKey}"?`,
      confirmLabel: "Delete Variable",
      onConfirm: async () => {
        await api.deleteVariable(activeEnvironmentId, varId);
        await refreshVariables(activeEnvironmentId);
      },
    });
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
            onClick={() => setIsAuditOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 rounded-lg text-xs font-medium transition"
            title="Scan secrets for security risks & weak defaults"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Audit</span>
          </button>

          <button
            type="button"
            onClick={() => setIsQuickExportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 rounded-lg text-xs font-medium transition"
            title="Quick copy as Docker -e, Shell export, JSON or .env"
          >
            <Share2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Quick Copy</span>
          </button>

          <button
            type="button"
            onClick={onImport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Import</span>
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
            onClick={() => {
              setAddVarMode("bulk");
              setFormError(null);
              setIsAddingVar(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-medium transition"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-indigo-400" />
            <span>Paste .env</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAddVarMode("single");
              setFormError(null);
              setIsAddingVar(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition shadow-md shadow-indigo-600/20"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Single</span>
          </button>

          <button
            type="button"
            onClick={handleDeleteCurrentProject}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 rounded-lg text-xs font-medium transition"
            title="Permanently delete this project"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Delete Project</span>
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

        {/* Environment Quick Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsDuplicateEnvOpen(true)}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800/60 px-2.5 py-1 rounded-md text-xs transition border border-transparent hover:border-zinc-700"
            title="Duplicate / Clone this Environment"
          >
            <Copy className="w-3.5 h-3.5 text-indigo-400" />
            <span>Clone Env</span>
          </button>
          {environments.length > 1 && (
            <button
              type="button"
              onClick={handleDeleteEnvironment}
              className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 rounded transition"
              title="Delete this Environment"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
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
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search variables (key, type, tag)..."
              className="w-full bg-[#141416] border border-[#27272a] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {["all", "secret", "public", "configuration", "url"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition uppercase tracking-wider ${
                  typeFilter === t
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
                }`}
              >
                {t}
              </button>
            ))}
            <span className="text-[11px] text-zinc-500 ml-2 font-mono shrink-0">
              {filteredVariables.length} of {variables.length}
            </span>
          </div>
        </div>

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
              {filteredVariables.map((v) => {
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
                          onClick={() => setEditingVar(v)}
                          className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition"
                          title="Edit Variable"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteVariable(v.id, v.key)}
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

              {filteredVariables.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-14 text-center">
                    <div className="max-w-xs mx-auto space-y-3">
                      <p className="text-zinc-400 text-xs">
                        {variables.length === 0
                          ? "No variables in this environment yet."
                          : "No variables match your search filter."}
                      </p>
                      {variables.length === 0 && (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setAddVarMode("single");
                              setFormError(null);
                              setIsAddingVar(true);
                            }}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
                          >
                            + Add Single
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddVarMode("bulk");
                              setFormError(null);
                              setIsAddingVar(true);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition shadow-md shadow-indigo-600/20"
                          >
                            <ClipboardPaste className="w-3.5 h-3.5" />
                            <span>Paste Full .env</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Variable Modal (Single or Bulk) */}
      {isAddingVar && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#141416] border border-[#1e1e22] rounded-xl w-full max-w-lg p-6 shadow-2xl">
            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-4 border-b border-[#27272a] pb-3 mb-4">
              <button
                type="button"
                onClick={() => {
                  setAddVarMode("single");
                  setFormError(null);
                }}
                className={`text-xs font-semibold pb-1 border-b-2 transition -mb-[13px] ${
                  addVarMode === "single"
                    ? "border-indigo-500 text-white"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Single Property
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddVarMode("bulk");
                  setFormError(null);
                }}
                className={`text-xs font-semibold pb-1 border-b-2 transition -mb-[13px] flex items-center gap-1.5 ${
                  addVarMode === "bulk"
                    ? "border-indigo-500 text-white"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-indigo-400" />
                <span>Paste Full .env</span>
              </button>
            </div>

            {formError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs mb-4">
                {formError}
              </div>
            )}

            {addVarMode === "single" ? (
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
                    rows={3}
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
                      placeholder="Database connection string"
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
            ) : (
              <form onSubmit={handleBulkImport} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-zinc-300">
                      Paste .env Content
                    </label>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {detectedBulkCount} {detectedBulkCount === 1 ? "variable" : "variables"} detected
                    </span>
                  </div>
                  <textarea
                    rows={9}
                    autoFocus
                    value={bulkContent}
                    onChange={(e) => setBulkContent(e.target.value)}
                    placeholder={`PORT=3000\nDATABASE_URL=postgres://user:secret@localhost:5432/db\nAPI_KEY=sk_live_123456789\nNEXT_PUBLIC_APP_NAME="LocalVault"`}
                    className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg p-3 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition leading-relaxed"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Supports multiline variables, double/single quotes, escapes, and comments (#).
                  </p>
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-400 bg-[#0d0d0f] p-2.5 rounded-lg border border-[#27272a]">
                  <span>If variable already exists:</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
                      <input
                        type="radio"
                        name="bulkStrategy"
                        value="overwrite"
                        checked={bulkStrategy === "overwrite"}
                        onChange={() => setBulkStrategy("overwrite")}
                        className="text-indigo-600"
                      />
                      <span>Overwrite</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
                      <input
                        type="radio"
                        name="bulkStrategy"
                        value="skip"
                        checked={bulkStrategy === "skip"}
                        onChange={() => setBulkStrategy("skip")}
                        className="text-indigo-600"
                      />
                      <span>Keep existing</span>
                    </label>
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
                    disabled={bulkLoading || detectedBulkCount === 0}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition shadow-md shadow-indigo-600/20"
                  >
                    {bulkLoading
                      ? "Saving..."
                      : `Add ${detectedBulkCount > 0 ? detectedBulkCount : ""} Variables`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Variable Modal */}
      <EditVariableModal
        variable={editingVar}
        isOpen={!!editingVar}
        onClose={() => setEditingVar(null)}
      />

      {/* Security Health & Leak Audit Modal */}
      <SecurityAuditModal
        isOpen={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
      />

      {/* Quick Export Formats Modal */}
      <QuickExportModal
        isOpen={isQuickExportOpen}
        onClose={() => setIsQuickExportOpen(false)}
      />

      {/* Duplicate Environment Modal */}
      <DuplicateEnvironmentModal
        isOpen={isDuplicateEnvOpen}
        onClose={() => setIsDuplicateEnvOpen(false)}
      />

      {/* In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmLabel={confirmConfig.confirmLabel}
        isLoading={isDeletingLoading}
        onConfirm={async () => {
          try {
            setIsDeletingLoading(true);
            await confirmConfig.onConfirm();
            setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
          } catch (err: any) {
            alert("Action failed: " + err.toString());
          } finally {
            setIsDeletingLoading(false);
          }
        }}
        onClose={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
