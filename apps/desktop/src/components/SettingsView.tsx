import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import { Settings, Shield, HardDrive, Download, Upload, CheckCircle2, AlertTriangle } from "lucide-react";

export const SettingsView: React.FC = () => {
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBackupSuccess(null);
    if (!backupPassphrase) return;

    try {
      setLoading(true);
      const res = await api.createBackup(backupPassphrase);
      setBackupSuccess(`Backup saved: ${res.filePath} (${res.fileSizeBytes} bytes)`);
      setBackupPassphrase("");
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" />
          <span>Vault Settings</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Cryptographic security and backup management.
        </p>
      </div>

      {/* Vault Info */}
      <div className="bg-[#141416] border border-[#1e1e22] rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Security Architecture</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-[#0a0a0b] rounded-lg border border-zinc-800">
            <span className="text-zinc-500 block text-[11px]">Primary Cipher</span>
            <span className="text-white font-mono font-medium">XChaCha20-Poly1305</span>
          </div>
          <div className="p-3 bg-[#0a0a0b] rounded-lg border border-zinc-800">
            <span className="text-zinc-500 block text-[11px]">Key Derivation</span>
            <span className="text-white font-mono font-medium">Argon2id (Memory-Hard)</span>
          </div>
          <div className="p-3 bg-[#0a0a0b] rounded-lg border border-zinc-800">
            <span className="text-zinc-500 block text-[11px]">Persistence Engine</span>
            <span className="text-white font-mono font-medium">Encrypted Filesystem (No DB)</span>
          </div>
          <div className="p-3 bg-[#0a0a0b] rounded-lg border border-zinc-800">
            <span className="text-zinc-500 block text-[11px]">Atomic Write Strategy</span>
            <span className="text-white font-mono font-medium">Write-Ahead Journal + Fsync</span>
          </div>
        </div>
      </div>

      {/* Encrypted Backup */}
      <div className="bg-[#141416] border border-[#1e1e22] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-2">
          <Download className="w-4 h-4 text-indigo-400" />
          <span>Create Encrypted Backup</span>
        </h2>
        <p className="text-xs text-zinc-400 mb-4">
          Export an authenticated, encrypted archive (.lvbackup) of all projects and environments.
        </p>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs mb-4">
            {error}
          </div>
        )}

        {backupSuccess && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-xs mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-mono truncate">{backupSuccess}</span>
          </div>
        )}

        <form onSubmit={handleCreateBackup} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Backup Passphrase
            </label>
            <input
              type="password"
              required
              value={backupPassphrase}
              onChange={(e) => setBackupPassphrase(e.target.value)}
              placeholder="Enter strong passphrase for backup encryption"
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !backupPassphrase}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{loading ? "Encrypting Backup..." : "Generate .lvbackup Archive"}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
