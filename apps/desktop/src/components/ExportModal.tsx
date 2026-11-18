import React, { useState, useEffect } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import {
  FileUp,
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  RotateCcw,
} from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const activeProjectId = useVaultStore((s) => s.activeProjectId);
  const projects = useVaultStore((s) => s.projects);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const environments = useVaultStore((s) => s.environments);
  const activeEnv = environments.find((e) => e.id === activeEnvironmentId);

  const [destPath, setDestPath] = useState("");
  const [downloadsDir, setDownloadsDir] = useState<string>("");
  const [format, setFormat] = useState("dotenv");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Compute a clean default filename
  const getDefaultFileName = (fmt: string) => {
    const ext = fmt === "json" ? "json" : "env";
    const projSlug = (activeProject?.name || "project")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]/g, "-");
    const envSlug = (activeEnv?.name || "env")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]/g, "-");
    return `${projSlug}.${envSlug}.${ext}`;
  };

  // On open or when active environment changes, default path to user's Mac Downloads folder
  useEffect(() => {
    if (!isOpen || !activeEnv) return;

    let isMounted = true;
    api.getDownloadsDir()
      .then((dir) => {
        if (!isMounted) return;
        setDownloadsDir(dir);
        const fileName = getDefaultFileName(format);
        const full = dir.endsWith("/") ? `${dir}${fileName}` : `${dir}/${fileName}`;
        setDestPath(full);
      })
      .catch(() => {
        if (!isMounted) return;
        setDestPath(getDefaultFileName(format));
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeEnv?.id, activeProject?.name]);

  const handleFormatChange = (newFormat: string) => {
    setFormat(newFormat);
    if (newFormat === "json" && destPath.endsWith(".env")) {
      setDestPath(destPath.replace(/\.env$/, ".json"));
    } else if (newFormat === "dotenv" && destPath.endsWith(".json")) {
      setDestPath(destPath.replace(/\.json$/, ".env"));
    }
  };

  const handleBrowse = async () => {
    try {
      const currentDir = destPath.includes("/")
        ? destPath.substring(0, destPath.lastIndexOf("/"))
        : downloadsDir || undefined;
      const currentName = destPath.includes("/")
        ? destPath.substring(destPath.lastIndexOf("/") + 1)
        : getDefaultFileName(format);

      const chosen = await api.pickExportPath(currentDir, currentName);
      if (chosen) {
        setDestPath(chosen);
      }
    } catch (err: any) {
      console.error("Failed to select destination path:", err);
    }
  };

  const handleResetToDownloads = () => {
    const fileName = getDefaultFileName(format);
    if (downloadsDir) {
      const full = downloadsDir.endsWith("/")
        ? `${downloadsDir}${fileName}`
        : `${downloadsDir}/${fileName}`;
      setDestPath(full);
    } else {
      setDestPath(fileName);
    }
  };

  if (!isOpen || !activeEnvironmentId || !activeEnv) return null;

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) return;
    setError(null);
    setSuccess(false);

    try {
      setLoading(true);
      await api.exportEnvironment(activeEnvironmentId, destPath, format, true);
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setConfirmed(false);
      }, 1500);
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] border border-[#1e1e22] rounded-xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center gap-2.5 mb-3">
          <FileUp className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-sm">
            Export Secrets: {activeEnv.name}
          </h3>
        </div>

        {/* Security Warning */}
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-4 flex items-start gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Security Warning:</strong> This will write decrypted plaintext credentials to disk. Ensure the destination file is added to .gitignore.
          </span>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-xs mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">Export complete! Saved to {destPath}</span>
          </div>
        )}

        <form onSubmit={handleExport} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-zinc-300">
                Destination File Path
              </label>
              <button
                type="button"
                onClick={handleResetToDownloads}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition cursor-pointer"
                title="Reset to Mac Downloads folder"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset to Downloads</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                required
                value={destPath}
                onChange={(e) => setDestPath(e.target.value)}
                placeholder="/Users/username/Downloads/project.env"
                className="flex-1 bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500 truncate"
              />
              <button
                type="button"
                onClick={handleBrowse}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition shrink-0 cursor-pointer shadow-xs"
                title="Open macOS file picker"
              >
                <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
                <span>Browse...</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Select or type the target file path. By default, points to your Mac&apos;s Downloads drive.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Export Format
            </label>
            <select
              value={format}
              onChange={(e) => handleFormatChange(e.target.value)}
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="dotenv">Standard .env (KEY=VALUE)</option>
              <option value="json">JSON Object (key: value)</option>
            </select>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500 cursor-pointer"
            />
            <span>I understand this exports unencrypted secrets to my filesystem</span>
          </label>

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
              disabled={loading || !confirmed || !destPath.trim()}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition cursor-pointer"
            >
              {loading ? "Exporting..." : "Confirm Export"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
