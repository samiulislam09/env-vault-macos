import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import { FileUp, AlertTriangle, CheckCircle2 } from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const environments = useVaultStore((s) => s.environments);
  const activeEnv = environments.find((e) => e.id === activeEnvironmentId);

  const [destPath, setDestPath] = useState(".env");
  const [format, setFormat] = useState("dotenv");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
      <div className="bg-[#141416] border border-[#1e1e22] rounded-xl w-full max-w-md p-6 shadow-2xl">
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
            <span>Export complete!</span>
          </div>
        )}

        <form onSubmit={handleExport} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Destination File Path
            </label>
            <input
              type="text"
              required
              value={destPath}
              onChange={(e) => setDestPath(e.target.value)}
              placeholder="/path/to/project/.env"
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Export Format
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
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
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500"
            />
            <span>I understand this exports unencrypted secrets to my filesystem</span>
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
              disabled={loading || !confirmed}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition"
            >
              {loading ? "Exporting..." : "Confirm Export"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
