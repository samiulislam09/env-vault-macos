import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  AlertOctagon,
  ExternalLink,
  Lock,
} from "lucide-react";
import type { KeyBreachResult } from "../lib/types";

interface BreachScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEditVariable?: (key: string) => void;
}

export const BreachScannerModal: React.FC<BreachScannerModalProps> = ({
  isOpen,
  onClose,
  onEditVariable,
}) => {
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const environments = useVaultStore((s) => s.environments);
  const currentEnv = environments.find((e) => e.id === activeEnvironmentId);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<KeyBreachResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !activeEnvironmentId) return null;

  const handleScan = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.scanEnvironmentBreaches(activeEnvironmentId);
      setResults(res);
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const breachedCount = results ? results.filter((r) => r.breached).length : 0;
  const safeCount = results ? results.filter((r) => !r.breached).length : 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] border border-[#27272a] rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">
                Compromised Secret & Breach Checker
              </h3>
              <p className="text-xs text-zinc-500">
                Mathematical k-Anonymity breach audit for{" "}
                <span className="text-zinc-300 font-medium">{currentEnv?.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-xs px-2 py-1 transition"
          >
            ✕
          </button>
        </div>

        {/* Info Banner */}
        <div className="p-4 bg-zinc-900/60 border-b border-zinc-800 text-[11px] text-zinc-400 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-zinc-200">Zero-Knowledge Guarantee:</strong> We query the HaveIBeenPwned $k$-Anonymity API using only the first 5 characters of the SHA-1 hash. Your plaintext passwords and full hashes never leave this device.
          </p>
        </div>

        {error && (
          <div className="m-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-3">
          {results === null ? (
            <div className="py-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center mx-auto text-zinc-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-white mb-1">
                  Ready to scan secrets
                </h4>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                  Scan all secrets in this environment against over 800+ million exposed passwords from public data leaks.
                </p>
              </div>
              <button
                type="button"
                onClick={handleScan}
                disabled={loading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition inline-flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Auditing Environment...</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Start Breach Scan</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={`p-3 rounded-lg border flex items-center gap-3 ${
                    breachedCount > 0
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  }`}
                >
                  {breachedCount > 0 ? (
                    <AlertOctagon className="w-5 h-5 shrink-0" />
                  ) : (
                    <ShieldCheck className="w-5 h-5 shrink-0" />
                  )}
                  <div>
                    <div className="text-lg font-bold">{breachedCount}</div>
                    <div className="text-[11px] uppercase tracking-wide">
                      {breachedCount === 1 ? "Compromised Key" : "Compromised Keys"}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg border bg-zinc-900 border-zinc-800 text-zinc-300 flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-lg font-bold text-white">{safeCount}</div>
                    <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                      Clean Secrets
                    </div>
                  </div>
                </div>
              </div>

              {/* List of Keys */}
              <div className="space-y-2">
                {results.map((r) => (
                  <div
                    key={r.key}
                    className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                      r.breached
                        ? "bg-rose-950/20 border-rose-800/40 text-rose-200"
                        : "bg-zinc-900/40 border-zinc-800 text-zinc-300"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="font-mono font-semibold text-white">{r.key}</div>
                      {r.breached ? (
                        <div className="text-[11px] text-rose-400 font-medium">
                          ⚠️ Exposed in {r.count.toLocaleString()} public breach dumps! Rotate now.
                        </div>
                      ) : (
                        <div className="text-[11px] text-zinc-500">
                          ✓ No public breach records found
                        </div>
                      )}
                    </div>

                    {r.breached && onEditVariable && (
                      <button
                        type="button"
                        onClick={() => {
                          onEditVariable(r.key);
                          onClose();
                        }}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-medium transition"
                      >
                        Rotate Secret
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#0e0e10] border-t border-[#27272a] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs font-medium transition"
          >
            Close
          </button>

          {results !== null && (
            <button
              type="button"
              disabled={loading}
              onClick={handleScan}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Rescan</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
