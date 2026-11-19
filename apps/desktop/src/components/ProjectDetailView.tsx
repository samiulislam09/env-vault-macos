import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import { secureCopy } from "../lib/clipboard";
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
  ChevronDown,
  ChevronRight,
  FileCode,
  History,
  GitBranch,
  GitMerge,
  Clock,
  Lock,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { EditVariableModal } from "./EditVariableModal";
import { SecurityAuditModal } from "./SecurityAuditModal";
import { QuickExportModal } from "./QuickExportModal";
import { DuplicateEnvironmentModal } from "./DuplicateEnvironmentModal";
import { ConfirmModal } from "./ConfirmModal";
import { EditEnvironmentModal } from "./EditEnvironmentModal";
import { RevisionHistoryModal } from "./RevisionHistoryModal";
import { ShareProjectModal } from "./ShareProjectModal";
import { BranchEnvironmentModal } from "./BranchEnvironmentModal";
import { MergeEnvironmentModal } from "./MergeEnvironmentModal";
import { BreachScannerModal } from "./BreachScannerModal";
import type { VariableSummary, VarType, VaultRole } from "../lib/types";

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
  const clipboardTimeoutSeconds = useVaultStore((s) => s.clipboardTimeoutSeconds);
  const activeRole = useVaultStore((s) => s.activeRole);
  const setActiveRole = useVaultStore((s) => s.setActiveRole);

  // Variable reveal states (ephemeral in React state, cleared immediately on navigation)
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedExample, setCopiedExample] = useState(false);

  // Search & Type Filter & Expiration Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showOnlyExpiring, setShowOnlyExpiring] = useState(false);

  // Sub-Modals
  const [editingVar, setEditingVar] = useState<VariableSummary | null>(null);
  const [isQuickExportOpen, setIsQuickExportOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isDuplicateEnvOpen, setIsDuplicateEnvOpen] = useState(false);
  const [isEditEnvOpen, setIsEditEnvOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isBreachModalOpen, setIsBreachModalOpen] = useState(false);
  const [groupByType, setGroupByType] = useState(false);
  const [collapsedTypes, setCollapsedTypes] = useState<Record<string, boolean>>({});

  // Variable form modal
  const [isAddingVar, setIsAddingVar] = useState(false);
  const [addVarMode, setAddVarMode] = useState<"single" | "bulk">("single");
  const [varKey, setVarKey] = useState("");
  const [varValue, setVarValue] = useState("");
  const [varType, setVarType] = useState<VarType>("secret");
  const [varDescription, setVarDescription] = useState("");
  const [varExpirationPreset, setVarExpirationPreset] = useState("never");
  const [varCustomDate, setVarCustomDate] = useState("");
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

  const now = Math.floor(Date.now() / 1000);
  const canEdit =
    activeRole === "admin" || (activeRole === "editor" && !activeEnv?.is_production);
  const canReveal =
    activeRole === "admin" || (activeRole === "editor" && !activeEnv?.is_production);
  const canDelete = activeRole === "admin";

  const expiredVars = variables.filter((v) => v.expires_at && v.expires_at < now);
  const expiringSoonVars = variables.filter(
    (v) => v.expires_at && v.expires_at >= now && v.expires_at - now <= 7 * 86400
  );

  const filteredVariables = variables.filter((v) => {
    const matchesSearch =
      v.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.description && v.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      v.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = typeFilter === "all" || v.var_type === typeFilter;

    const matchesExpiring =
      !showOnlyExpiring ||
      (v.expires_at && (v.expires_at < now || v.expires_at - now <= 7 * 86400));

    return matchesSearch && matchesType && matchesExpiring;
  });

  const handleToggleReveal = async (varId: string) => {
    if (!activeEnvironmentId) return;

    if (!canReveal) {
      alert("Viewing/revealing secrets in production is restricted to Vault Admins.");
      return;
    }

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

    if (!canReveal) {
      alert("Copying secret values in production is restricted to Vault Admins.");
      return;
    }

    try {
      let textToCopy = revealedValues[varId] || fallbackValue;
      if (!textToCopy) {
        textToCopy = await api.revealVariableValue(activeEnvironmentId, varId);
      }
      await secureCopy(textToCopy, clipboardTimeoutSeconds);
      setCopiedKey(varId);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  const handleGenerateEnvExample = async () => {
    if (variables.length === 0) return;
    const lines = variables.map((v) => {
      let placeholder = '""';
      const lowerKey = v.key.toLowerCase();
      if (lowerKey.includes("url") || lowerKey.includes("endpoint") || lowerKey.includes("host")) {
        placeholder = '"https://example.com"';
      } else if (lowerKey.includes("port")) {
        placeholder = '"3000"';
      } else if (
        lowerKey.includes("key") ||
        lowerKey.includes("token") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("pass")
      ) {
        placeholder = `"your_${lowerKey}_here"`;
      } else if (lowerKey.includes("email")) {
        placeholder = '"user@example.com"';
      } else if (lowerKey.includes("db") || lowerKey.includes("database")) {
        placeholder = '"postgres://user:pass@localhost:5432/dbname"';
      }
      const desc = v.description ? `# ${v.description}\n` : "";
      return `${desc}${v.key}=${placeholder}`;
    });

    const exampleContent =
      `# Generated by LocalVault (Sanitized .env.example template)\n# Safe to commit to Git version control\n# Project: ${activeProject?.name || "Vault"} | Env: ${activeEnv?.name || ""}\n\n` +
      lines.join("\n\n") +
      "\n";

    await navigator.clipboard.writeText(exampleContent);
    setCopiedExample(true);
    setTimeout(() => setCopiedExample(false), 2500);
  };

  const calculateNewVarExpiresAt = (): number | null => {
    const curTime = Math.floor(Date.now() / 1000);
    if (varExpirationPreset === "7d") return curTime + 7 * 86400;
    if (varExpirationPreset === "30d") return curTime + 30 * 86400;
    if (varExpirationPreset === "90d") return curTime + 90 * 86400;
    if (varExpirationPreset === "1y") return curTime + 365 * 86400;
    if (varExpirationPreset === "custom" && varCustomDate) {
      const parsed = Math.floor(new Date(varCustomDate).getTime() / 1000);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  const handleCreateVariable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEnvironmentId) return;
    setFormError(null);

    try {
      const expiresAt = calculateNewVarExpiresAt();
      await api.createVariable({
        envId: activeEnvironmentId,
        key: varKey.trim(),
        value: varValue,
        varType,
        description: varDescription.trim() || undefined,
        tags: [],
        expiresAt,
      });

      setIsAddingVar(false);
      setVarKey("");
      setVarValue("");
      setVarDescription("");
      setVarExpirationPreset("never");
      setVarCustomDate("");
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

  const renderVariableRow = (v: VariableSummary) => {
    const isRevealed = !!revealedValues[v.id];
    const displayedVal = isRevealed ? revealedValues[v.id] : "••••••••••••";

    const isExpired = v.expires_at ? v.expires_at < now : false;
    const isExpiringSoon = v.expires_at ? !isExpired && v.expires_at - now <= 7 * 86400 : false;
    const daysLeft = v.expires_at ? Math.max(0, Math.ceil((v.expires_at - now) / 86400)) : null;
    const daysAgo = v.expires_at ? Math.max(0, Math.floor((now - v.expires_at) / 86400)) : null;

    return (
      <tr
        key={v.id}
        className={`hover:bg-zinc-800/20 transition group ${
          isExpired ? "bg-rose-950/10" : isExpiringSoon ? "bg-amber-950/10" : ""
        }`}
      >
        <td className="py-3 px-4 font-mono font-medium text-white">
          <div className="flex items-center gap-2 flex-wrap">
            <span>{v.key}</span>
            {isExpired && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1 shrink-0">
                <Clock className="w-2.5 h-2.5" />
                <span>Expired {daysAgo === 0 ? "today" : `${daysAgo}d ago`}</span>
              </span>
            )}
            {isExpiringSoon && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 shrink-0">
                <Clock className="w-2.5 h-2.5" />
                <span>Expires in {daysLeft}d</span>
              </span>
            )}
            {!isExpired && !isExpiringSoon && v.expires_at && (
              <span className="text-[10px] text-zinc-500 font-sans shrink-0">
                (exp: {new Date(v.expires_at * 1000).toLocaleDateString()})
              </span>
            )}
          </div>
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
              disabled={!canReveal}
              onClick={() => handleToggleReveal(v.id)}
              className={`p-1.5 rounded transition ${
                !canReveal
                  ? "text-zinc-600 cursor-not-allowed"
                  : "hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
              }`}
              title={
                !canReveal
                  ? "Production secrets can only be revealed by Vault Admins"
                  : isRevealed
                  ? "Hide Value"
                  : "Reveal Value"
              }
            >
              {!canReveal ? (
                <Lock className="w-3.5 h-3.5 text-zinc-600" />
              ) : isRevealed ? (
                <EyeOff className="w-3.5 h-3.5 text-indigo-400" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              disabled={!canReveal}
              onClick={() => handleCopyValue(v.id)}
              className={`p-1.5 rounded transition ${
                !canReveal
                  ? "text-zinc-600 cursor-not-allowed"
                  : "hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
              }`}
              title={
                !canReveal
                  ? "Copying production secrets is restricted to Vault Admins"
                  : "Copy Value"
              }
            >
              {copiedKey === v.id ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setEditingVar(v)}
              className={`p-1.5 rounded transition ${
                !canEdit
                  ? "text-zinc-600 cursor-not-allowed"
                  : "hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
              }`}
              title={!canEdit ? "Editing restricted" : "Edit Variable"}
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              disabled={!canDelete}
              onClick={() => handleDeleteVariable(v.id, v.key)}
              className={`p-1.5 rounded transition ${
                !canDelete
                  ? "text-zinc-600 cursor-not-allowed"
                  : "hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 cursor-pointer"
              }`}
              title={!canDelete ? "Deleting restricted to Admin" : "Delete Variable"}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  if (!activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-zinc-500">
        No project selected
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
      {/* Project Header */}
      <div className="h-14 px-4 sm:px-6 border-b border-[#1e1e22] flex items-center justify-between gap-3 shrink-0 bg-[#0d0d0f] min-w-0">
        <div className="flex items-center gap-3 shrink-0">
          <FolderGit2 className="w-5 h-5 text-indigo-400 shrink-0" />
          <h1 className="font-semibold text-white text-sm truncate max-w-[180px] sm:max-w-xs">{activeProject.name}</h1>
          {activeProject.description && (
            <span className="text-xs text-zinc-500 max-w-xs truncate hidden lg:inline">
              — {activeProject.description}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 min-w-0">
          {/* RBAC Role Selector */}
          <div className="flex items-center bg-zinc-900 border border-zinc-700/70 rounded-lg p-0.5 text-xs mr-1">
            <span className="text-[10px] uppercase font-bold text-zinc-500 px-1.5 flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-indigo-400" />
              <span>Role:</span>
            </span>
            {(["admin", "editor", "viewer"] as VaultRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setActiveRole(r)}
                className={`px-2 py-0.5 rounded capitalize text-[11px] font-medium transition ${
                  activeRole === r
                    ? r === "admin"
                      ? "bg-indigo-600 text-white font-semibold shadow-xs"
                      : r === "editor"
                      ? "bg-amber-600 text-white font-semibold shadow-xs"
                      : "bg-zinc-700 text-zinc-200 font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsBreachModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 rounded-lg text-xs font-medium transition"
            title="Zero-knowledge password breach audit (HaveIBeenPwned k-Anonymity)"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>Breach Scan</span>
          </button>

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
            disabled={!canEdit}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              !canEdit
                ? "bg-zinc-800/40 text-zinc-600 cursor-not-allowed"
                : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
            }`}
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
            onClick={handleGenerateEnvExample}
            disabled={variables.length === 0}
            title="Generate a sanitized .env.example with placeholders that is safe to commit to Git"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-medium transition disabled:opacity-40"
          >
            {copiedExample ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileCode className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{copiedExample ? "Copied .env.example!" : "Gen .env.example"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            title="View audit log and rollback variable revisions"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-indigo-400" />
            <span>Audit Log</span>
          </button>

          <button
            type="button"
            onClick={() => setIsShareModalOpen(true)}
            title="End-to-End Encrypted Project Sharing"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Share Project</span>
          </button>

          <button
            type="button"
            disabled={!canEdit}
            onClick={() => {
              setAddVarMode("bulk");
              setFormError(null);
              setIsAddingVar(true);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition ${
              !canEdit
                ? "bg-zinc-800/40 text-zinc-600 border-zinc-800 cursor-not-allowed"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700"
            }`}
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-indigo-400" />
            <span>Paste .env</span>
          </button>

          <button
            type="button"
            disabled={!canEdit}
            onClick={() => {
              setAddVarMode("single");
              setFormError(null);
              setIsAddingVar(true);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition shadow-md ${
              !canEdit
                ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20"
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Single</span>
          </button>

          <button
            type="button"
            disabled={!canDelete}
            onClick={handleDeleteCurrentProject}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-xs font-medium transition ${
              !canDelete
                ? "bg-zinc-800/40 text-zinc-600 border-zinc-800 cursor-not-allowed"
                : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/20"
            }`}
            title={!canDelete ? "Delete Project requires Admin role" : "Permanently delete this project"}
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
            disabled={!canEdit}
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
            onClick={() => setIsBranchModalOpen(true)}
            className="flex items-center gap-1.5 text-emerald-400 hover:bg-emerald-950/30 px-2.5 py-1 rounded-md text-xs transition border border-emerald-500/30 cursor-pointer"
            title="Branch this environment into an isolated copy"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Branch</span>
          </button>

          <button
            type="button"
            onClick={() => setIsMergeModalOpen(true)}
            className="flex items-center gap-1.5 text-indigo-400 hover:bg-indigo-950/30 px-2.5 py-1 rounded-md text-xs transition border border-indigo-500/30 cursor-pointer"
            title="Merge variables between environments"
          >
            <GitMerge className="w-3.5 h-3.5" />
            <span>Merge</span>
          </button>

          {activeEnv && (
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setIsEditEnvOpen(true)}
              className="flex items-center gap-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800/60 px-2.5 py-1 rounded-md text-xs transition border border-transparent hover:border-zinc-700 cursor-pointer"
              title="Rename or Edit Environment"
            >
              <Edit2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Edit Env</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsDuplicateEnvOpen(true)}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800/60 px-2.5 py-1 rounded-md text-xs transition border border-transparent hover:border-zinc-700 cursor-pointer"
            title="Duplicate / Clone this Environment"
          >
            <Copy className="w-3.5 h-3.5 text-indigo-400" />
            <span>Clone</span>
          </button>

          {environments.length > 1 && (
            <button
              type="button"
              disabled={!canDelete}
              onClick={handleDeleteEnvironment}
              className={`p-1 rounded transition ${
                !canDelete
                  ? "text-zinc-700 cursor-not-allowed"
                  : "text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 cursor-pointer"
              }`}
              title="Delete this Environment"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Production Warning Banner */}
      {activeEnv?.is_production && (
        <div className="px-6 py-2 bg-rose-950/30 border-b border-rose-900/30 flex items-center justify-between text-rose-300 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>
              <strong>Production Environment:</strong> Live deployment secrets. Revealing or modifying variables requires Vault Admin privileges.
            </span>
          </div>
          <span className="text-[11px] font-mono text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/40">
            Protected Mode
          </span>
        </div>
      )}

      {/* Secret Rotation Watchdog Banner */}
      {(expiredVars.length > 0 || expiringSoonVars.length > 0) && (
        <div className="mx-6 mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-300 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-white">Secret Rotation Watchdog: </span>
              {expiredVars.length > 0 && (
                <span className="text-rose-400 font-medium">
                  {expiredVars.length} secret(s) have expired!{" "}
                </span>
              )}
              {expiringSoonVars.length > 0 && (
                <span className="text-amber-300">
                  {expiringSoonVars.length} secret(s) require rotation within 7 days.
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowOnlyExpiring(!showOnlyExpiring)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
              showOnlyExpiring
                ? "bg-amber-400 text-black font-semibold shadow-xs"
                : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30"
            }`}
          >
            {showOnlyExpiring ? "Show All Secrets" : "Filter Expiring Only"}
          </button>
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

            <button
              type="button"
              onClick={() => setGroupByType(!groupByType)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                groupByType
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-zinc-800"
              }`}
              title="Toggle collapsible items grouped by type"
            >
              <span>{groupByType ? "Grouped (Collapsible)" : "Group by Type"}</span>
            </button>
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
              {groupByType ? (
                (["secret", "configuration", "public", "url"] as VarType[]).map((type) => {
                  const items = filteredVariables.filter((v) => v.var_type === type);
                  if (items.length === 0) return null;
                  const isCollapsed = !!collapsedTypes[type];

                  return (
                    <React.Fragment key={type}>
                      <tr
                        onClick={() =>
                          setCollapsedTypes((prev) => ({
                            ...prev,
                            [type]: !prev[type],
                          }))
                        }
                        className="bg-[#101013] hover:bg-[#16161a] cursor-pointer transition select-none"
                      >
                        <td colSpan={5} className="py-2.5 px-4 border-b border-[#1e1e22]">
                          <div className="flex items-center gap-2">
                            {isCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-indigo-400" />
                            )}
                            <span className="font-semibold uppercase tracking-wider text-[11px] text-zinc-200">
                              {type}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              ({items.length} {items.length === 1 ? "item" : "items"})
                            </span>
                          </div>
                        </td>
                      </tr>
                      {!isCollapsed && items.map((v) => renderVariableRow(v))}
                    </React.Fragment>
                  );
                })
              ) : (
                filteredVariables.map((v) => renderVariableRow(v))
              )}

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

                {/* Expiration Watchdog Picker */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Rotation & Expiration Date</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={varExpirationPreset}
                      onChange={(e) => setVarExpirationPreset(e.target.value)}
                      className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                    >
                      <option value="never">Never Expires</option>
                      <option value="7d">Expire in 7 Days</option>
                      <option value="30d">Expire in 30 Days</option>
                      <option value="90d">Expire in 90 Days</option>
                      <option value="1y">Expire in 1 Year</option>
                      <option value="custom">Custom Date</option>
                    </select>

                    {varExpirationPreset === "custom" && (
                      <input
                        type="date"
                        value={varCustomDate}
                        onChange={(e) => setVarCustomDate(e.target.value)}
                        className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                      />
                    )}
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

      {/* Edit Environment Modal */}
      <EditEnvironmentModal
        isOpen={isEditEnvOpen}
        onClose={() => setIsEditEnvOpen(false)}
        environment={activeEnv || null}
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
      {/* Revision History & Rollbacks Modal */}
      <RevisionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        envId={activeEnvironmentId || undefined}
        envName={activeEnv?.name}
      />

      {/* End-to-End Encrypted Project Sharing Modal */}
      <ShareProjectModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        projectId={activeProjectId || undefined}
        projectName={activeProject?.name}
      />

      {/* Branch Environment Modal */}
      <BranchEnvironmentModal
        isOpen={isBranchModalOpen}
        onClose={() => setIsBranchModalOpen(false)}
      />

      {/* Merge Environment Modal */}
      <MergeEnvironmentModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
      />

      {/* Zero-Knowledge Breach & Compromise Scanner */}
      <BreachScannerModal
        isOpen={isBreachModalOpen}
        onClose={() => setIsBreachModalOpen(false)}
        onEditVariable={(key) => {
          const found = variables.find((v) => v.key === key);
          if (found) setEditingVar(found);
        }}
      />
    </div>
  );
};
