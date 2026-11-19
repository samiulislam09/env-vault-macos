import React, { useState, useEffect } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import { Edit2, Clock, ShieldAlert, ShieldCheck, RefreshCw } from "lucide-react";
import type { VariableSummary, VarType } from "../lib/types";

interface EditVariableModalProps {
  variable: VariableSummary | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EditVariableModal: React.FC<EditVariableModalProps> = ({
  variable,
  isOpen,
  onClose,
}) => {
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const refreshVariables = useVaultStore((s) => s.refreshVariables);

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [varType, setVarType] = useState<VarType>("secret");
  const [description, setDescription] = useState("");
  const [keepCurrentValue, setKeepCurrentValue] = useState(true);
  const [expirationPreset, setExpirationPreset] = useState<string>("keep");
  const [customDate, setCustomDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Breach checking state
  const [checkingBreach, setCheckingBreach] = useState(false);
  const [breachInfo, setBreachInfo] = useState<{ checked: boolean; breached: boolean; count: number } | null>(null);

  useEffect(() => {
    if (variable) {
      setKey(variable.key);
      setVarType(variable.var_type);
      setDescription(variable.description || "");
      setValue("");
      setKeepCurrentValue(true);
      setError(null);
      setBreachInfo(null);

      if (variable.expires_at) {
        setExpirationPreset("custom");
        const d = new Date(variable.expires_at * 1000);
        setCustomDate(d.toISOString().slice(0, 10));
      } else {
        setExpirationPreset("never");
        setCustomDate("");
      }
    }
  }, [variable]);

  if (!isOpen || !variable || !activeEnvironmentId) return null;

  const calculateExpiresAt = (): number | null | undefined => {
    const now = Math.floor(Date.now() / 1000);
    if (expirationPreset === "keep") {
      return variable.expires_at;
    }
    if (expirationPreset === "never") {
      return null;
    }
    if (expirationPreset === "7d") {
      return now + 7 * 86400;
    }
    if (expirationPreset === "30d") {
      return now + 30 * 86400;
    }
    if (expirationPreset === "90d") {
      return now + 90 * 86400;
    }
    if (expirationPreset === "1y") {
      return now + 365 * 86400;
    }
    if (expirationPreset === "custom" && customDate) {
      const parsed = Math.floor(new Date(customDate).getTime() / 1000);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  const handleCheckBreach = async () => {
    if (!value.trim()) return;
    try {
      setCheckingBreach(true);
      const res = await api.checkSecretCompromise(value.trim());
      setBreachInfo({ checked: true, breached: res.breached, count: res.count });
    } catch (err: any) {
      setError(`Breach check error: ${err.toString()}`);
    } finally {
      setCheckingBreach(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!key.trim()) return;

    try {
      setLoading(true);
      const expiresAt = calculateExpiresAt();
      await api.updateVariable({
        envId: activeEnvironmentId,
        varId: variable.id,
        key: key.trim(),
        value: keepCurrentValue ? undefined : value,
        varType,
        description: description.trim() || undefined,
        tags: variable.tags,
        expiresAt,
      });

      await refreshVariables(activeEnvironmentId);
      onClose();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] border border-[#27272a] rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center gap-2.5 mb-4">
          <Edit2 className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-sm">Edit Variable</h3>
        </div>

        {error && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Key Name</label>
            <input
              type="text"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-zinc-300">Secret Value</label>
              <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepCurrentValue}
                  onChange={(e) => {
                    setKeepCurrentValue(e.target.checked);
                    setBreachInfo(null);
                  }}
                  className="rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Keep existing secret value</span>
              </label>
            </div>

            {!keepCurrentValue ? (
              <div className="space-y-2">
                <textarea
                  required
                  rows={3}
                  placeholder="Enter new secret value..."
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setBreachInfo(null);
                  }}
                  className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                />
                {value.trim() && (
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      disabled={checkingBreach}
                      onClick={handleCheckBreach}
                      className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition"
                    >
                      {checkingBreach ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
                      ) : (
                        <ShieldAlert className="w-3 h-3 text-rose-400" />
                      )}
                      <span>Check against known breaches (k-Anonymity)</span>
                    </button>

                    {breachInfo?.checked && (
                      <span className={`text-[11px] flex items-center gap-1 font-medium ${
                        breachInfo.breached ? "text-rose-400" : "text-emerald-400"
                      }`}>
                        {breachInfo.breached ? (
                          <>
                            <ShieldAlert className="w-3 h-3" />
                            <span>Pwned in {breachInfo.count.toLocaleString()} breaches!</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3 h-3" />
                            <span>Clean password</span>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2.5 bg-[#0a0a0b] border border-[#27272a] rounded-lg text-xs font-mono text-zinc-500">
                •••••••••••• (Encrypted in vault)
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Type</label>
              <select
                value={varType}
                onChange={(e) => setVarType(e.target.value as VarType)}
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
              >
                <option value="secret">Secret</option>
                <option value="public">Public</option>
                <option value="configuration">Configuration</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="url">URL</option>
                <option value="json">JSON</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Description</label>
              <input
                type="text"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          {/* Expiration Watchdog Picker */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Rotation & Expiration Date</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={expirationPreset}
                onChange={(e) => setExpirationPreset(e.target.value)}
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
              >
                <option value="never">Never Expires</option>
                <option value="7d">Expire in 7 Days</option>
                <option value="30d">Expire in 30 Days</option>
                <option value="90d">Expire in 90 Days</option>
                <option value="1y">Expire in 1 Year</option>
                <option value="custom">Custom Date</option>
              </select>

              {expirationPreset === "custom" && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                />
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-zinc-400 hover:text-white text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition shadow-md shadow-indigo-600/20"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
