import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import { Share2, Copy, Check, Terminal, FileCode, Braces, FileText } from "lucide-react";

interface QuickExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuickExportModal: React.FC<QuickExportModalProps> = ({ isOpen, onClose }) => {
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const environments = useVaultStore((s) => s.environments);
  const variables = useVaultStore((s) => s.variables);

  const [activeTab, setActiveTab] = useState<"docker" | "shell" | "json" | "dotenv">("docker");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen || !activeEnvironmentId) return null;

  const currentEnv = environments.find((e) => e.id === activeEnvironmentId);

  // Helper to fetch all variable values in memory safely for the copy operation
  const generateExportText = async (format: "docker" | "shell" | "json" | "dotenv"): Promise<string> => {
    // Reveal all values temporarily in memory
    const entries: Array<{ key: string; value: string }> = [];
    for (const v of variables) {
      try {
        const val = await api.revealVariableValue(activeEnvironmentId, v.id);
        entries.push({ key: v.key, value: val });
      } catch (err) {
        entries.push({ key: v.key, value: "" });
      }
    }

    switch (format) {
      case "docker":
        return entries.map((e) => `-e ${e.key}="${e.value.replace(/"/g, '\\"')}"`).join(" \\\n  ");
      case "shell":
        return entries
          .map((e) => `export ${e.key}="${e.value.replace(/"/g, '\\"')}"`)
          .join("\n");
      case "json": {
        const obj: Record<string, string> = {};
        entries.forEach((e) => {
          obj[e.key] = e.value;
        });
        return JSON.stringify(obj, null, 2);
      }
      case "dotenv":
        return entries.map((e) => `${e.key}="${e.value}"`).join("\n");
    }
  };

  const handleCopy = async () => {
    try {
      setLoading(true);
      const text = await generateExportText(activeTab);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy export:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] border border-[#27272a] rounded-xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Share2 className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-semibold text-white text-sm">Quick Developer Export</h3>
              <p className="text-xs text-zinc-500">
                Environment: <span className="text-zinc-300 font-medium">{currentEnv?.name}</span> ({variables.length} variables)
              </p>
            </div>
          </div>
        </div>

        {/* Format Selector Tabs */}
        <div className="grid grid-cols-4 gap-2 mb-4 bg-[#0a0a0b] p-1 rounded-lg border border-[#27272a]">
          <button
            type="button"
            onClick={() => setActiveTab("docker")}
            className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === "docker"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Docker</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("shell")}
            className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === "shell"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Shell Export</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("json")}
            className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === "json"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Braces className="w-3.5 h-3.5" />
            <span>JSON</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("dotenv")}
            className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === "dotenv"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>.env</span>
          </button>
        </div>

        {/* Format Preview Description */}
        <div className="bg-[#0d0d0f] border border-[#27272a] rounded-lg p-3 text-xs mb-5 font-mono text-zinc-400">
          {activeTab === "docker" && (
            <div>
              <div className="text-zinc-500 mb-1">// Docker command syntax:</div>
              <div className="text-zinc-200">
                docker run \
                <br />
                &nbsp;&nbsp;-e KEY1=&quot;val1&quot; \
                <br />
                &nbsp;&nbsp;-e KEY2=&quot;val2&quot; \
                <br />
                &nbsp;&nbsp;my-image:latest
              </div>
            </div>
          )}

          {activeTab === "shell" && (
            <div>
              <div className="text-zinc-500 mb-1">// Bash / Zsh export commands:</div>
              <div className="text-zinc-200">
                export KEY1=&quot;val1&quot;
                <br />
                export KEY2=&quot;val2&quot;
              </div>
            </div>
          )}

          {activeTab === "json" && (
            <div>
              <div className="text-zinc-500 mb-1">// Key-value JSON payload:</div>
              <div className="text-zinc-200">
                &#123; &quot;KEY1&quot;: &quot;val1&quot;, &quot;KEY2&quot;: &quot;val2&quot; &#125;
              </div>
            </div>
          )}

          {activeTab === "dotenv" && (
            <div>
              <div className="text-zinc-500 mb-1">// Standard .env file format:</div>
              <div className="text-zinc-200">
                KEY1=&quot;val1&quot;
                <br />
                KEY2=&quot;val2&quot;
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs font-medium transition"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleCopy}
            disabled={loading || variables.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition shadow-md shadow-indigo-600/20"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>{loading ? "Generating..." : "Copy to Clipboard"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
