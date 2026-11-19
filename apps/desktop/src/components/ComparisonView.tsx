import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import { GitCompare, ArrowRight, CheckCircle2, AlertCircle, XCircle, RefreshCw } from "lucide-react";
import type { ComparisonResult } from "../lib/types";

export const ComparisonView: React.FC = () => {
  const environments = useVaultStore((s) => s.environments);
  const [envAId, setEnvAId] = useState<string>(environments[0]?.id || "");
  const [envBId, setEnvBId] = useState<string>(environments[1]?.id || "");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCompare = async () => {
    if (!envAId || !envBId) return;
    setLoading(true);
    try {
      const res = await api.compareEnvironments(envAId, envBId);
      setComparison(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "identical":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            <span>Identical</span>
          </span>
        );
      case "different":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertCircle className="w-3 h-3" />
            <span>Different Value</span>
          </span>
        );
      case "missing_in_first":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            <span>Missing in Env A</span>
          </span>
        );
      case "missing_in_second":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            <span>Missing in Env B</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400 uppercase">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto">
      <div className="p-6 md:p-8 max-w-5xl w-full mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-indigo-400" />
            <span>Environment Comparison</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Perform a zero-leak cryptographic difference comparison between environments.
          </p>
        </div>

        {/* Selectors */}
        <div className="bg-[#141416] border border-[#1e1e22] rounded-xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-zinc-400 mb-1">Environment A</label>
              <select
                value={envAId}
                onChange={(e) => setEnvAId(e.target.value)}
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select Environment...</option>
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} {e.is_production ? "(Prod)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-center text-zinc-500 pt-1 md:pt-5">
              <ArrowRight className="w-4 h-4 rotate-90 md:rotate-0" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-zinc-400 mb-1">Environment B</label>
              <select
                value={envBId}
                onChange={(e) => setEnvBId(e.target.value)}
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select Environment...</option>
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} {e.is_production ? "(Prod)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCompare}
            disabled={!envAId || !envBId || loading}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Compare Environments</span>
          </button>
        </div>

        {/* Comparison Results */}
        {comparison && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#141416] border border-[#1e1e22] p-3 rounded-lg text-center">
                <span className="text-xl font-bold text-emerald-400">{comparison.identical_count}</span>
                <span className="block text-[10px] text-zinc-500 uppercase mt-0.5">Identical</span>
              </div>
              <div className="bg-[#141416] border border-[#1e1e22] p-3 rounded-lg text-center">
                <span className="text-xl font-bold text-amber-400">{comparison.different_count}</span>
                <span className="block text-[10px] text-zinc-500 uppercase mt-0.5">Different</span>
              </div>
              <div className="bg-[#141416] border border-[#1e1e22] p-3 rounded-lg text-center">
                <span className="text-xl font-bold text-rose-400">{comparison.missing_in_a_count}</span>
                <span className="block text-[10px] text-zinc-500 uppercase mt-0.5">Missing in A</span>
              </div>
              <div className="bg-[#141416] border border-[#1e1e22] p-3 rounded-lg text-center">
                <span className="text-xl font-bold text-rose-400">{comparison.missing_in_b_count}</span>
                <span className="block text-[10px] text-zinc-500 uppercase mt-0.5">Missing in B</span>
              </div>
            </div>

            <div className="bg-[#141416] border border-[#1e1e22] rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#1e1e22] bg-[#0d0d0f]/60 text-zinc-400 font-medium uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-4">Variable Key</th>
                    <th className="py-2.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e22]">
                  {comparison.entries.map((entry) => (
                    <tr key={entry.key} className="hover:bg-zinc-800/20">
                      <td className="py-2.5 px-4 font-mono font-medium text-white">{entry.key}</td>
                      <td className="py-2.5 px-4 text-right">{getStatusBadge(entry.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
