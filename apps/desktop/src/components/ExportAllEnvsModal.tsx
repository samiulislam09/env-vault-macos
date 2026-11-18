import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import {
  Download,
  Copy,
  Check,
  AlertTriangle,
  FileCode,
  Braces,
  FileText,
  Loader2,
  FolderGit2,
  Layers,
} from "lucide-react";

interface ExportAllEnvsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportAllEnvsModal: React.FC<ExportAllEnvsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const projects = useVaultStore((s) => s.projects);

  const [format, setFormat] = useState<"dotenv" | "json" | "shell">("dotenv");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(
    projects.map((p) => p.id)
  );
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleProject = (id: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedProjectIds(projects.map((p) => p.id));
  };

  const selectNone = () => {
    setSelectedProjectIds([]);
  };

  // Build the export payload across selected projects and environments
  const generateFullExport = async () => {
    const selectedProjects = projects.filter((p) =>
      selectedProjectIds.includes(p.id)
    );

    const fullData: Array<{
      projectName: string;
      environments: Array<{
        envName: string;
        isProduction: boolean;
        variables: Array<{ key: string; value: string; type: string }>;
      }>;
    }> = [];

    for (const proj of selectedProjects) {
      setProgressText(`Fetching environments for ${proj.name}...`);
      const envs = await api.listEnvironments(proj.id);

      const envList = [];
      for (const env of envs) {
        setProgressText(`Exporting ${proj.name} → ${env.name}...`);
        const vars = await api.listVariables(env.id);

        const varList = [];
        for (const v of vars) {
          try {
            const val = await api.revealVariableValue(env.id, v.id);
            varList.push({ key: v.key, value: val, type: v.var_type });
          } catch (e) {
            varList.push({ key: v.key, value: "", type: v.var_type });
          }
        }

        envList.push({
          envName: env.name,
          isProduction: env.is_production,
          variables: varList,
        });
      }

      fullData.push({
        projectName: proj.name,
        environments: envList,
      });
    }

    if (format === "json") {
      return JSON.stringify(
        {
          exported_at: new Date().toISOString(),
          version: "LocalVault-v1.0",
          projects: fullData.map((p) => ({
            name: p.projectName,
            environments: p.environments.map((e) => {
              const varsObj: Record<string, string> = {};
              e.variables.forEach((v) => {
                varsObj[v.key] = v.value;
              });
              return {
                name: e.envName,
                is_production: e.isProduction,
                variables: varsObj,
              };
            }),
          })),
        },
        null,
        2
      );
    }

    if (format === "shell") {
      let shellOutput = `#!/usr/bin/env bash\n# LocalVault Multi-Project Shell Export\n# Exported on ${new Date().toISOString()}\n\n`;
      fullData.forEach((p) => {
        shellOutput += `### ==========================================\n`;
        shellOutput += `### PROJECT: ${p.projectName}\n`;
        shellOutput += `### ==========================================\n\n`;

        p.environments.forEach((e) => {
          const funcName = `load_${p.projectName}_${e.envName}`
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "_");
          shellOutput += `# Load ${p.projectName} (${e.envName})\n`;
          shellOutput += `${funcName}() {\n`;
          e.variables.forEach((v) => {
            shellOutput += `  export ${v.key}="${v.value.replace(/"/g, '\\"')}"\n`;
          });
          shellOutput += `  echo "Loaded ${e.variables.length} environment variables for ${p.projectName} (${e.envName})"\n`;
          shellOutput += `}\n\n`;
        });
      });
      return shellOutput;
    }

    // Default dotenv format
    let dotenvOutput = `# ====================================================================\n`;
    dotenvOutput += `# LOCALVAULT ALL-ENVIRONMENTS EXPORT\n`;
    dotenvOutput += `# Exported: ${new Date().toISOString()}\n`;
    dotenvOutput += `# Security Warning: Keep this plaintext file in a secure location.\n`;
    dotenvOutput += `# ====================================================================\n\n`;

    fullData.forEach((p) => {
      dotenvOutput += `######################################################################\n`;
      dotenvOutput += `### PROJECT: ${p.projectName.toUpperCase()}\n`;
      dotenvOutput += `######################################################################\n\n`;

      p.environments.forEach((e) => {
        dotenvOutput += `# --------------------------------------------------------------------\n`;
        dotenvOutput += `# Environment: ${e.envName} ${e.isProduction ? "[PRODUCTION]" : ""}\n`;
        dotenvOutput += `# --------------------------------------------------------------------\n`;

        if (e.variables.length === 0) {
          dotenvOutput += `# (No variables configured in this environment)\n\n`;
        } else {
          e.variables.forEach((v) => {
            const hasSpacesOrQuotes =
              v.value.includes(" ") ||
              v.value.includes('"') ||
              v.value.includes("\n") ||
              v.value.includes("#");
            const formattedVal = hasSpacesOrQuotes
              ? `"${v.value.replace(/"/g, '\\"')}"`
              : v.value;
            dotenvOutput += `${v.key}=${formattedVal}\n`;
          });
          dotenvOutput += `\n`;
        }
      });
    });

    return dotenvOutput;
  };

  const handleCopy = async () => {
    setError(null);
    try {
      setLoading(true);
      const text = await generateFullExport();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e: any) {
      setError("Failed to copy export: " + e.toString());
    } finally {
      setLoading(false);
      setProgressText("");
    }
  };

  const handleDownload = async () => {
    setError(null);
    try {
      setLoading(true);
      const text = await generateFullExport();

      const ext = format === "json" ? "json" : format === "shell" ? "sh" : "env";
      const defaultFilename = `localvault-all-envs-${new Date().toISOString().slice(0, 10)}.${ext}`;

      try {
        const downloads = await api.getDownloadsDir();
        const chosen = await api.pickExportPath(downloads, defaultFilename);
        if (chosen) {
          await api.writeExportedFile(chosen, text);
          setDownloaded(true);
          setTimeout(() => setDownloaded(false), 2000);
          return;
        } else {
          // User cancelled file picker dialog
          return;
        }
      } catch (nativeErr) {
        console.warn("Native file picker unavailable, using fallback:", nativeErr);
      }

      const mime =
        format === "json"
          ? "application/json"
          : format === "shell"
          ? "application/x-sh"
          : "text/plain";
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultFilename;
      a.click();
      URL.revokeObjectURL(url);

      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch (e: any) {
      setError("Failed to download export: " + e.toString());
    } finally {
      setLoading(false);
      setProgressText("");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] border border-[#27272a] rounded-xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center gap-2.5 mb-2">
          <Download className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-base">
            Export All Environments
          </h3>
        </div>
        <p className="text-xs text-zinc-400 mb-4">
          Export all projects and environments into a single organized file or payload.
        </p>

        {error && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs mb-4">
            {error}
          </div>
        )}

        {/* Security Alert Banner */}
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2.5 mb-4 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong>Plaintext Export Warning:</strong> Exporting decrypts secrets into
            a single file. Ensure the destination storage is encrypted and secure.
          </div>
        </div>

        {/* Format Selector */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-zinc-300 mb-1.5">
            Export Format
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setFormat("dotenv")}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium border transition ${
                format === "dotenv"
                  ? "bg-indigo-600/15 border-indigo-500/40 text-indigo-300"
                  : "bg-[#0d0d0f] border-[#27272a] text-zinc-400 hover:text-white"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Multi-Env .env</span>
            </button>

            <button
              type="button"
              onClick={() => setFormat("json")}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium border transition ${
                format === "json"
                  ? "bg-indigo-600/15 border-indigo-500/40 text-indigo-300"
                  : "bg-[#0d0d0f] border-[#27272a] text-zinc-400 hover:text-white"
              }`}
            >
              <Braces className="w-3.5 h-3.5" />
              <span>JSON Bundle</span>
            </button>

            <button
              type="button"
              onClick={() => setFormat("shell")}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium border transition ${
                format === "shell"
                  ? "bg-indigo-600/15 border-indigo-500/40 text-indigo-300"
                  : "bg-[#0d0d0f] border-[#27272a] text-zinc-400 hover:text-white"
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Shell Script</span>
            </button>
          </div>
        </div>

        {/* Project Selector */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-zinc-300">
              Projects to Include ({selectedProjectIds.length}/{projects.length})
            </label>
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <button
                type="button"
                onClick={selectAll}
                className="hover:text-indigo-400 transition"
              >
                Select all
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={selectNone}
                className="hover:text-indigo-400 transition"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="bg-[#0a0a0b] border border-[#27272a] rounded-lg p-2 max-h-36 overflow-y-auto space-y-1">
            {projects.map((p) => {
              const isChecked = selectedProjectIds.includes(p.id);
              return (
                <label
                  key={p.id}
                  className="flex items-center justify-between px-2 py-1.5 hover:bg-zinc-800/40 rounded cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2 text-zinc-300">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleProject(p.id)}
                      className="rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <FolderGit2 className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{p.name}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {p.environment_ids.length} envs
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Progress Display */}
        {loading && (
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center gap-2.5 text-xs text-indigo-300 mb-4 animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
            <span className="truncate">{progressText || "Processing export..."}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-[#1e1e22]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs font-medium transition"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading || selectedProjectIds.length === 0}
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded-lg text-xs font-medium transition border border-zinc-700"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Bundle</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={loading || selectedProjectIds.length === 0}
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition shadow-md shadow-indigo-600/20"
            >
              {downloaded ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Downloaded!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Save File</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
