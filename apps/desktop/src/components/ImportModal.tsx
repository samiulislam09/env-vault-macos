import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import { FileDown, FileUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ImportPreview } from "../lib/types";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose }) => {
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const refreshVariables = useVaultStore((s) => s.refreshVariables);

  const [content, setContent] = useState("");
  const [strategy, setStrategy] = useState("overwrite");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !activeEnvironmentId) return null;

  const handlePreview = async () => {
    if (!content.trim()) return;
    setError(null);
    try {
      setLoading(true);
      const prev = await api.previewImport(activeEnvironmentId, content, "dotenv");
      setPreview(prev);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteImport = async () => {
    setError(null);
    try {
      setLoading(true);
      await api.executeImport(activeEnvironmentId, content, "dotenv", strategy);
      await refreshVariables(activeEnvironmentId);
      onClose();
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] border border-[#1e1e22] rounded-xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center gap-2.5 mb-4">
          <FileDown className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-sm">Import .env File</h3>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Paste .env Content
            </label>
            <textarea
              rows={6}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setPreview(null);
              }}
              placeholder="PORT=3000&#10;DATABASE_URL=postgres://...&#10;API_KEY=xyz"
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg p-3 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {preview && (
            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs space-y-1.5">
              <div className="flex justify-between text-zinc-300">
                <span>Total Keys Parsed:</span>
                <span className="font-mono font-bold text-white">{preview.total_keys}</span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>New Variables:</span>
                <span className="font-mono">{preview.new_keys.length}</span>
              </div>
              <div className="flex justify-between text-amber-400">
                <span>Duplicate / Conflict Keys:</span>
                <span className="font-mono">{preview.duplicate_keys.length}</span>
              </div>
            </div>
          )}

          {preview && preview.duplicate_keys.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Conflict Resolution Strategy
              </label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="overwrite">Overwrite existing keys with imported values</option>
                <option value="skip">Skip duplicates (keep existing values)</option>
                <option value="error">Halt on conflict</option>
              </select>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs font-medium transition"
            >
              Cancel
            </button>

            {!preview ? (
              <button
                type="button"
                onClick={handlePreview}
                disabled={loading || !content.trim()}
                className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition"
              >
                {loading ? "Analyzing..." : "Preview Import"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={loading}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition"
              >
                {loading ? "Importing..." : "Confirm & Save"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
