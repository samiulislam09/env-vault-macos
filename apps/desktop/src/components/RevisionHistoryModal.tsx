import React, { useState, useEffect } from "react";
import { api } from "../lib/tauri";
import { useVaultStore } from "../stores/vault-store";
import type { VariableRevision } from "../lib/types";
import {
  History,
  RotateCcw,
  X,
  Search,
  Eye,
  EyeOff,
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
  FileCode,
} from "lucide-react";

interface RevisionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  envId?: string;
  envName?: string;
}

export const RevisionHistoryModal: React.FC<RevisionHistoryModalProps> = ({
  isOpen,
  onClose,
  envId,
  envName,
}) => {
  const [revisions, setRevisions] = useState<VariableRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterKey, setFilterKey] = useState("");
  const [revealedRevValues, setRevealedRevValues] = useState<Record<string, boolean>>({});
  const [rollbackLoading, setRollbackLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refreshVariables = useVaultStore((s) => s.refreshVariables);
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);

  useEffect(() => {
    if (isOpen) {
      loadRevisions();
    }
  }, [isOpen, envId]);

  const loadRevisions = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const data = await api.listVariableRevisions(envId);
      setRevisions(data);
    } catch (e: any) {
      setStatusMessage({ type: "error", text: e.toString() });
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (rev: VariableRevision) => {
    setRollbackLoading(rev.id);
    setStatusMessage(null);
    try {
      const msg = await api.rollbackVariable(rev.id);
      setStatusMessage({ type: "success", text: msg });
      await loadRevisions();
      if (activeEnvironmentId) {
        await refreshVariables(activeEnvironmentId);
      }
    } catch (e: any) {
      setStatusMessage({ type: "error", text: e.toString() });
    } finally {
      setRollbackLoading(null);
    }
  };

  if (!isOpen) return null;

  const filteredRevisions = revisions.filter((r) =>
    r.varKey.toLowerCase().includes(filterKey.toLowerCase()) ||
    r.author.toLowerCase().includes(filterKey.toLowerCase())
  );

  const formatTimestamp = (ts: number) => {
    const diffSec = Math.floor((Date.now() - ts * 1000) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return new Date(ts * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#141416] border border-[#27272a] rounded-2xl w-full max-w-3xl flex flex-col max-h-[85vh] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#27272a]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                Variable Audit Log & Revision History
              </h2>
              <p className="text-xs text-zinc-400">
                {envName ? `Environment: ${envName}` : "All encrypted variable revisions across environments"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Status Bar */}
        <div className="p-4 border-b border-[#1e1e22] bg-[#0d0d0f] flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={filterKey}
              onChange={(e) => setFilterKey(e.target.value)}
              placeholder="Filter by variable key or author email..."
              className="w-full bg-[#141416] border border-[#27272a] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {filteredRevisions.length} revision{filteredRevisions.length === 1 ? "" : "s"}
          </span>
        </div>

        {statusMessage && (
          <div
            className={`px-6 py-2.5 text-xs flex items-center gap-2 border-b ${
              statusMessage.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/20 text-rose-300"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Revisions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500 text-xs">
              <History className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
              <span>Decrypting revision timeline...</span>
            </div>
          ) : filteredRevisions.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-xs">
              No variable revisions recorded for this environment yet.
            </div>
          ) : (
            filteredRevisions.map((rev) => {
              const isRevealed = !!revealedRevValues[rev.id];
              const isRollbacking = rollbackLoading === rev.id;

              return (
                <div
                  key={rev.id}
                  className="p-3.5 bg-[#0e0e11] hover:bg-[#121216] border border-[#222226] rounded-xl transition space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                          rev.action === "create"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : rev.action === "update"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : rev.action === "delete"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                        }`}
                      >
                        {rev.action}
                      </span>
                      <span className="font-mono text-xs font-semibold text-white">
                        {rev.varKey}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                        <Clock className="w-3 h-3" />
                        {formatTimestamp(rev.timestamp)}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-zinc-500 font-mono">
                        <User className="w-3 h-3" />
                        {rev.author}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRollback(rev)}
                        disabled={isRollbacking}
                        className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-indigo-600 hover:text-white text-zinc-300 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50"
                        title="Rollback to the value from this snapshot"
                      >
                        <RotateCcw className={`w-3 h-3 ${isRollbacking ? "animate-spin" : ""}`} />
                        <span>{isRollbacking ? "Rolling back..." : "Rollback"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Values diff view */}
                  <div className="bg-[#08080a] p-2.5 rounded-lg border border-[#1a1a1e] text-xs font-mono flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden text-zinc-400">
                      {rev.previousValue !== undefined && rev.previousValue !== null ? (
                        <>
                          <span className="text-rose-400 line-through truncate max-w-[200px]">
                            {isRevealed ? rev.previousValue || '""' : "••••••••••••"}
                          </span>
                          <span className="text-zinc-600">➔</span>
                        </>
                      ) : null}
                      <span className="text-emerald-400 truncate max-w-[200px]">
                        {isRevealed
                          ? rev.newValue !== undefined && rev.newValue !== null
                            ? rev.newValue || '""'
                            : "[deleted]"
                          : "••••••••••••"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setRevealedRevValues((prev) => ({ ...prev, [rev.id]: !prev[rev.id] }))
                      }
                      className="text-zinc-500 hover:text-zinc-300 p-1"
                      title={isRevealed ? "Hide values" : "Reveal values"}
                    >
                      {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#1e1e22] bg-[#0d0d0f] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
