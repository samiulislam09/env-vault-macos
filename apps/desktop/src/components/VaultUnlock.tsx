import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { Lock, KeyRound, ArrowRight, ShieldAlert } from "lucide-react";

export const VaultUnlock: React.FC = () => {
  const [password, setPassword] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const unlockVault = useVaultStore((s) => s.unlockVault);
  const unlockWithRecovery = useVaultStore((s) => s.unlockWithRecovery);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (useRecovery) {
        await unlockWithRecovery(recoveryKey.trim());
      } else {
        await unlockVault(password);
      }
    } catch (err: any) {
      setError(useRecovery ? "Invalid recovery key" : "Authentication failed — wrong password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <div className="w-full max-w-sm bg-[#141416] border border-[#1e1e22] rounded-xl p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 bg-indigo-600/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400 mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">LocalVault Locked</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Enter your credentials to decrypt the vault.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs mb-4 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-4">
          {!useRecovery ? (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Master Password
              </label>
              <input
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Emergency Recovery Key
              </label>
              <textarea
                required
                autoFocus
                rows={3}
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
                placeholder="ABCDE-FGHIJ-KLMNO-..."
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg p-3 font-mono text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition shadow-lg shadow-indigo-600/20"
          >
            <span>{loading ? "Decrypting..." : "Unlock Vault"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => {
              setUseRecovery(!useRecovery);
              setError(null);
            }}
            className="text-xs text-zinc-400 hover:text-indigo-400 transition inline-flex items-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{useRecovery ? "Use Master Password" : "Forgot Password? Use Recovery Key"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
