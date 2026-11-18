import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { Shield, Key, Copy, Check, AlertTriangle, ArrowRight } from "lucide-react";

export const VaultSetup: React.FC = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const createVault = useVaultStore((s) => s.createVault);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Master password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const key = await createVault(password);
      setRecoveryKey(key);
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (recoveryKey) {
      navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (recoveryKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
        <div className="w-full max-w-lg bg-[#141416] border border-[#1e1e22] rounded-xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-4 text-emerald-400">
            <Shield className="w-8 h-8" />
            <h1 className="text-2xl font-semibold text-white">Vault Created</h1>
          </div>

          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-200/90 leading-relaxed">
              Save your recovery key in a safe place. If you forget your master
              password, this key is the <strong>only way</strong> to restore
              access. It will <strong>never be shown again</strong>.
            </p>
          </div>

          <div className="mb-6">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-2">
              Emergency Recovery Key
            </label>
            <div className="bg-[#0a0a0b] border border-[#27272a] rounded-lg p-4 font-mono text-sm text-indigo-300 break-all select-all flex items-center justify-between gap-3">
              <span>{recoveryKey}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="p-2 hover:bg-zinc-800 rounded-md transition text-zinc-400 hover:text-white shrink-0"
                title="Copy Key"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-3 mb-6 cursor-pointer text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={confirmedSaved}
              onChange={(e) => setConfirmedSaved(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500"
            />
            <span>I have stored this recovery key securely offline</span>
          </label>

          <button
            type="button"
            disabled={!confirmedSaved}
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition"
          >
            <span>Proceed to Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <div className="w-full max-w-md bg-[#141416] border border-[#1e1e22] rounded-xl p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-6">
          <img
            src="/logo.png"
            alt="LocalVault"
            className="w-16 h-16 rounded-2xl mb-4 shadow-xl border border-indigo-500/30 object-contain"
          />
          <h1 className="text-2xl font-bold tracking-tight text-white">Create LocalVault</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Zero-cloud, zero-database local encrypted secrets storage.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Master Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Minimum 8 characters (12+ recommended). Used for Argon2id key derivation.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Confirm Master Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg transition mt-2 shadow-lg shadow-indigo-600/20"
          >
            <Key className="w-4 h-4" />
            <span>{loading ? "Deriving Argon2id Keys..." : "Initialize Vault"}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
