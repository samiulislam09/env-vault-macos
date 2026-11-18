import React, { useState, useEffect } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";

interface AuditFinding {
  id: string;
  varKey: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
}

interface SecurityAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecurityAuditModal: React.FC<SecurityAuditModalProps> = ({ isOpen, onClose }) => {
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const environments = useVaultStore((s) => s.environments);
  const variables = useVaultStore((s) => s.variables);

  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [score, setScore] = useState<number>(100);
  const [loading, setLoading] = useState(false);

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId);

  useEffect(() => {
    if (!isOpen || !activeEnvironmentId) return;

    const runAudit = async () => {
      setLoading(true);
      const list: AuditFinding[] = [];

      for (const v of variables) {
        try {
          const val = await api.revealVariableValue(activeEnvironmentId, v.id);
          const lowerVal = val.toLowerCase().trim();

          // Rule 1: Weak/Default passwords
          const weakList = ["password", "123456", "admin", "secret", "root", "test", "qwerty", "letmein"];
          if (weakList.includes(lowerVal) || lowerVal === "password123") {
            list.push({
              id: `weak-${v.id}`,
              varKey: v.key,
              severity: "high",
              title: "Default or Weak Secret Value",
              description: `Value appears to be a trivial default ('${val}'). Replace with a high-entropy secret.`,
            });
          }

          // Rule 2: Insecure HTTP in production
          if (activeEnv?.is_production && lowerVal.startsWith("http://") && !lowerVal.includes("localhost")) {
            list.push({
              id: `http-${v.id}`,
              varKey: v.key,
              severity: "high",
              title: "Insecure Plaintext HTTP URL in Production",
              description: `Production URLs should use HTTPS to prevent man-in-the-middle eavesdropping.`,
            });
          }

          // Rule 3: Test tokens in production
          if (activeEnv?.is_production && (lowerVal.startsWith("sk_test_") || lowerVal.startsWith("pk_test_"))) {
            list.push({
              id: `test-key-${v.id}`,
              varKey: v.key,
              severity: "high",
              title: "Sandbox / Test Key in Production",
              description: `A test API key is configured in a production environment. Use live production credentials.`,
            });
          }

          // Rule 4: Unfilled placeholders
          const placeholders = ["todo", "fixme", "changeme", "replace_me", "<your-key>", "your_key_here", "insert-here"];
          if (placeholders.some((p) => lowerVal.includes(p))) {
            list.push({
              id: `placeholder-${v.id}`,
              varKey: v.key,
              severity: "medium",
              title: "Unfilled Placeholder Detected",
              description: `Value contains a placeholder or template token that has not been configured yet.`,
            });
          }

          // Rule 5: Short secret
          if (v.var_type === "secret" && val.length > 0 && val.length < 8) {
            list.push({
              id: `short-${v.id}`,
              varKey: v.key,
              severity: "low",
              title: "Short Secret Length (< 8 characters)",
              description: `Cryptographic keys and passwords should ideally have at least 16-32 characters of entropy.`,
            });
          }
        } catch (e) {
          console.error("Audit scan error:", e);
        }
      }

      // Calculate health score: high = -25, med = -10, low = -5
      let penalty = 0;
      list.forEach((f) => {
        if (f.severity === "high") penalty += 25;
        else if (f.severity === "medium") penalty += 10;
        else penalty += 5;
      });
      const finalScore = Math.max(0, 100 - penalty);

      setFindings(list);
      setScore(finalScore);
      setLoading(false);
    };

    runAudit();
  }, [isOpen, activeEnvironmentId, variables, activeEnv]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] border border-[#27272a] rounded-xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-semibold text-white text-sm">Security & Secret Health Audit</h3>
              <p className="text-xs text-zinc-500">
                Auditing <span className="text-zinc-300 font-medium">{activeEnv?.name}</span> environment
              </p>
            </div>
          </div>

          <div
            className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
              score >= 90
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : score >= 70
                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
            }`}
          >
            {score}% Health Score
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-zinc-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            <span className="text-xs">Analyzing variable security & entropy...</span>
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {findings.length === 0 ? (
              <div className="p-6 bg-emerald-950/20 border border-emerald-900/30 rounded-xl text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-semibold text-white">All Checks Passed</h4>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                  No default secrets, test keys, or plaintext HTTP endpoints were found in this environment.
                </p>
              </div>
            ) : (
              findings.map((f) => (
                <div
                  key={f.id}
                  className={`p-3 rounded-lg border text-xs space-y-1 ${
                    f.severity === "high"
                      ? "bg-rose-950/20 border-rose-900/40 text-rose-300"
                      : f.severity === "medium"
                      ? "bg-amber-950/20 border-amber-900/40 text-amber-300"
                      : "bg-zinc-900 border-zinc-800 text-zinc-300"
                  }`}
                >
                  <div className="flex items-center justify-between font-medium">
                    <span className="font-mono text-white px-1.5 py-0.5 bg-black/40 rounded">
                      {f.varKey}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      {f.severity} severity
                    </span>
                  </div>
                  <div className="font-semibold text-white pt-0.5">{f.title}</div>
                  <div className="text-[11px] text-zinc-400 leading-relaxed">{f.description}</div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex items-center justify-end pt-4 mt-2 border-t border-[#1e1e22]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
