import React, { useState, useEffect } from "react";
import { api } from "../lib/tauri";
import { useVaultStore } from "../stores/vault-store";
import type { SharedProjectSummary } from "../lib/types";
import {
  Share2,
  Lock,
  UserPlus,
  X,
  CheckCircle2,
  AlertTriangle,
  Inbox,
  ArrowRight,
  ShieldCheck,
  Send,
  Download,
} from "lucide-react";

interface ShareProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
}

export const ShareProjectModal: React.FC<ShareProjectModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
}) => {
  const [activeTab, setActiveTab] = useState<"send" | "received">("send");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sharingLoading, setSharingLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [receivedShares, setReceivedShares] = useState<SharedProjectSummary[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refreshProjects = useVaultStore((s) => s.refreshProjects);

  useEffect(() => {
    if (isOpen) {
      loadShares();
      // Ensure local identity is published to Turso
      api.publishSharingIdentity().catch(() => {});
    }
  }, [isOpen]);

  const loadShares = async () => {
    setLoadingShares(true);
    try {
      const shares = await api.listReceivedShares();
      setReceivedShares(shares);
      if (shares.some((s) => s.status === "pending") && !projectId) {
        setActiveTab("received");
      }
    } catch (e: any) {
      console.error("Failed to load shares:", e);
    } finally {
      setLoadingShares(false);
    }
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !recipientEmail) return;

    setSharingLoading(true);
    setMessage(null);
    try {
      const res = await api.shareProject(recipientEmail, projectId);
      setMessage({ type: "success", text: res });
      setRecipientEmail("");
    } catch (err: any) {
      setMessage({ type: "error", text: err.toString() });
    } finally {
      setSharingLoading(false);
    }
  };

  const handleAcceptShare = async (share: SharedProjectSummary) => {
    setAcceptingId(share.id);
    setMessage(null);
    try {
      const res = await api.acceptShare(share.id);
      setMessage({ type: "success", text: res });
      await loadShares();
      await refreshProjects();
    } catch (err: any) {
      setMessage({ type: "error", text: err.toString() });
    } finally {
      setAcceptingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#141416] border border-[#27272a] rounded-2xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#27272a]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                End-to-End Encrypted Project Sharing
              </h2>
              <p className="text-xs text-zinc-400">
                Share full projects with collaborators using X25519 key exchange
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

        {/* Tab Switcher */}
        <div className="flex border-b border-[#1e1e22] px-6 bg-[#0e0e11]">
          {projectId && (
            <button
              type="button"
              onClick={() => setActiveTab("send")}
              className={`py-2.5 px-4 text-xs font-medium border-b-2 transition cursor-pointer flex items-center gap-2 ${
                activeTab === "send"
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Share Current Project</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab("received")}
            className={`py-2.5 px-4 text-xs font-medium border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === "received"
                ? "border-indigo-500 text-white"
                : "border-transparent text-zinc-400 hover:text-white"
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Shared with Me ({receivedShares.filter((s) => s.status === "pending").length})</span>
          </button>
        </div>

        {message && (
          <div
            className={`px-6 py-2.5 text-xs flex items-center gap-2 border-b ${
              message.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/20 text-rose-300"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <div className="p-6">
          {activeTab === "send" && projectId && (
            <form onSubmit={handleShare} className="space-y-4">
              <div className="p-3 bg-[#0a0a0b] rounded-xl border border-zinc-800 flex items-center justify-between text-xs">
                <span className="text-zinc-400">Target Project:</span>
                <span className="font-semibold text-white font-mono">{projectName}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Recipient User Email
                </label>
                <input
                  type="email"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="collaborator@example.com"
                  className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl text-[11px] text-zinc-400 space-y-1">
                <div className="flex items-center gap-1.5 text-indigo-400 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Zero-Knowledge E2EE Protocol</span>
                </div>
                <p>
                  LocalVault uses Diffie-Hellman key exchange (X25519) to derive an ephemeral shared key. Secrets are encrypted before uploading; Turso cloud servers and database administrators never see plaintext credentials.
                </p>
              </div>

              <button
                type="submit"
                disabled={sharingLoading || !recipientEmail}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-lg shadow-indigo-600/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sharingLoading ? "Encrypting & Sharing with Recipient..." : "Share Project Securely"}</span>
              </button>
            </form>
          )}

          {activeTab === "received" && (
            <div className="space-y-3">
              {loadingShares ? (
                <div className="text-center py-8 text-xs text-zinc-500">Checking for incoming shares...</div>
              ) : receivedShares.length === 0 ? (
                <div className="text-center py-8 text-xs text-zinc-500">
                  No projects have been shared with your email yet.
                </div>
              ) : (
                receivedShares.map((share) => (
                  <div
                    key={share.id}
                    className="p-3.5 bg-[#0a0a0b] border border-[#1e1e22] rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{share.projectName}</span>
                        <span
                          className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            share.status === "accepted"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {share.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1 font-mono">
                        From: {share.senderEmail} • {new Date(share.createdAt * 1000).toLocaleDateString()}
                      </div>
                    </div>

                    {share.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => handleAcceptShare(share)}
                        disabled={acceptingId === share.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{acceptingId === share.id ? "Decrypting..." : "Accept & Import"}</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
