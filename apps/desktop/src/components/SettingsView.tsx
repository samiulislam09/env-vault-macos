import React, { useState, useEffect } from "react";
import { useVaultStore } from "../stores/vault-store";
import { api } from "../lib/tauri";
import type { TursoConfig, TursoRemoteStatus, TursoTestResponse } from "../lib/types";
import {
  Settings,
  Shield,
  Download,
  CheckCircle2,
  AlertTriangle,
  Cloud,
  RefreshCw,
  Eye,
  EyeOff,
  CloudUpload,
  CloudDownload,
  Database,
  Lock,
  KeyRound,
  Clock,
  Clipboard,
  Fingerprint,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { BiometricStatus } from "../lib/types";

export const SettingsView: React.FC = () => {
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const refreshProjects = useVaultStore((s) => s.refreshProjects);
  const checkStatus = useVaultStore((s) => s.checkStatus);
  const autoLockMinutes = useVaultStore((s) => s.autoLockMinutes);
  const setAutoLockMinutes = useVaultStore((s) => s.setAutoLockMinutes);
  const clipboardTimeoutSeconds = useVaultStore((s) => s.clipboardTimeoutSeconds);
  const setClipboardTimeoutSeconds = useVaultStore((s) => s.setClipboardTimeoutSeconds);
  const currentUser = useVaultStore((s) => s.currentUser);

  // Biometric Touch ID state
  const [bioStatus, setBioStatus] = useState<BiometricStatus | null>(null);
  const [bioPassword, setBioPassword] = useState("");
  const [isEnrollingBio, setIsEnrollingBio] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [bioMsg, setBioMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password rotation state
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPw, setShowOldPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [checkingBreach, setCheckingBreach] = useState(false);
  const [breachResult, setBreachResult] = useState<{ checked: boolean; breached: boolean; count: number } | null>(null);

  // Backup states
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Turso states
  const [tursoConfig, setTursoConfig] = useState<TursoConfig>({
    enabled: true,
    databaseUrl: "libsql://env-vault-sawon19.aws-ap-southeast-1.turso.io",
    authToken: "",
    autoSync: true,
    lastSyncedAt: null,
  });
  const [tursoRemoteStatus, setTursoRemoteStatus] = useState<TursoRemoteStatus | null>(null);
  const [tursoTestResult, setTursoTestResult] = useState<TursoTestResponse | null>(null);
  const [showTursoToken, setShowTursoToken] = useState(false);
  const [tursoMessage, setTursoMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [savingTurso, setSavingTurso] = useState(false);
  const [syncingPush, setSyncingPush] = useState(false);
  const [syncingPull, setSyncingPull] = useState(false);

  useEffect(() => {
    loadTurso();
    if (currentUser?.userId) {
      api.getBiometricStatus(currentUser.userId).then(setBioStatus).catch(() => {});
    }
  }, [currentUser]);

  const handleEnableBio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.userId || !bioPassword) return;
    setBioLoading(true);
    setBioMsg(null);
    try {
      await api.enableBiometric(currentUser.userId, bioPassword);
      setBioMsg({ type: "success", text: "Touch ID unlock enabled successfully via macOS Keychain." });
      setBioPassword("");
      setIsEnrollingBio(false);
      const updated = await api.getBiometricStatus(currentUser.userId);
      setBioStatus(updated);
    } catch (err: any) {
      setBioMsg({ type: "error", text: err.toString() });
    } finally {
      setBioLoading(false);
    }
  };

  const handleDisableBio = async () => {
    if (!currentUser?.userId) return;
    setBioLoading(true);
    setBioMsg(null);
    try {
      await api.disableBiometric(currentUser.userId);
      setBioMsg({ type: "success", text: "Touch ID unlock disabled." });
      const updated = await api.getBiometricStatus(currentUser.userId);
      setBioStatus(updated);
    } catch (err: any) {
      setBioMsg({ type: "error", text: err.toString() });
    } finally {
      setBioLoading(false);
    }
  };

  const loadTurso = async () => {
    try {
      const cfg = await api.getTursoConfig();
      setTursoConfig(cfg);
      if (cfg.databaseUrl && cfg.authToken) {
        const status = await api.getTursoRemoteStatus();
        setTursoRemoteStatus(status);
      }
    } catch (e: any) {
      console.error("Failed to load Turso config:", e);
    }
  };

  const handleTestTurso = async () => {
    setTestingConnection(true);
    setTursoTestResult(null);
    setTursoMessage(null);
    try {
      const res = await api.testTursoConnection(tursoConfig.databaseUrl, tursoConfig.authToken);
      setTursoTestResult(res);
      const status = await api.getTursoRemoteStatus();
      setTursoRemoteStatus(status);
    } catch (err: any) {
      setTursoMessage({ type: "error", text: err.toString() });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveTurso = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingTurso(true);
    setTursoMessage(null);
    try {
      await api.saveTursoConfig(tursoConfig);
      setTursoMessage({ type: "success", text: "Turso configuration saved successfully." });
      const status = await api.getTursoRemoteStatus();
      setTursoRemoteStatus(status);
    } catch (err: any) {
      setTursoMessage({ type: "error", text: err.toString() });
    } finally {
      setSavingTurso(false);
    }
  };

  const handlePushTurso = async () => {
    setSyncingPush(true);
    setTursoMessage(null);
    try {
      const res = await api.tursoSyncPush();
      setTursoMessage({ type: "success", text: res.message });
      const cfg = await api.getTursoConfig();
      setTursoConfig(cfg);
      const status = await api.getTursoRemoteStatus();
      setTursoRemoteStatus(status);
    } catch (err: any) {
      setTursoMessage({ type: "error", text: `Push failed: ${err.toString()}` });
    } finally {
      setSyncingPush(false);
    }
  };

  const handlePullTurso = async () => {
    setSyncingPull(true);
    setTursoMessage(null);
    try {
      const res = await api.tursoSyncPull();
      setTursoMessage({ type: "success", text: res.message });
      const cfg = await api.getTursoConfig();
      setTursoConfig(cfg);
      const status = await api.getTursoRemoteStatus();
      setTursoRemoteStatus(status);
      await refreshProjects();
      await checkStatus();
    } catch (err: any) {
      setTursoMessage({ type: "error", text: `Pull failed: ${err.toString()}` });
    } finally {
      setSyncingPull(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError("New password must be at least 10 characters long.");
      return;
    }

    try {
      setPasswordLoading(true);
      const res = await api.changePassword(oldPassword, newPassword);
      setPasswordSuccess(res || "Master password changed and keys rotated successfully.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(err.toString());
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBackupError(null);
    setBackupSuccess(null);
    if (!backupPassphrase) return;

    try {
      setBackupLoading(true);
      const res = await api.createBackup(backupPassphrase);
      setBackupSuccess(`Backup saved: ${res.filePath} (${res.fileSizeBytes} bytes)`);
      setBackupPassphrase("");
    } catch (err: any) {
      setBackupError(err.toString());
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto">
      <div className="p-6 md:p-8 max-w-4xl w-full mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            <span>Vault Settings</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Cryptographic security, Turso cloud database sync, and backup management.
          </p>
        </div>

      {/* Turso Cloud Database Sync Card */}
      <div className="bg-[#141416] border border-[#1e1e22] rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">Turso Cloud Sync</h2>
                {tursoConfig.enabled ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400">
                    Disabled
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">
                End-to-end encrypted backup and sync using Turso (libSQL edge database).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={tursoConfig.enabled}
                onChange={(e) => {
                  const updated = { ...tursoConfig, enabled: e.target.checked };
                  setTursoConfig(updated);
                  api.saveTursoConfig(updated);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>
        </div>

        {/* Security badge note */}
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#0a0a0b] border border-zinc-800/80 text-[11px] text-zinc-300">
          <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-white">Zero-Knowledge Cloud Storage:</span> All projects, environments, and secrets stored in Turso are 100% encrypted with <span className="font-mono text-cyan-300">XChaCha20-Poly1305</span>. Turso cannot read your variable keys or values.
          </div>
        </div>

        {tursoMessage && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              tursoMessage.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                : "bg-rose-500/10 border border-rose-500/20 text-rose-300"
            }`}
          >
            {tursoMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{tursoMessage.text}</span>
          </div>
        )}

        {tursoTestResult && (
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-xs text-cyan-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{tursoTestResult.message}</span>
            </div>
            <span className="font-mono text-[11px] bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
              {tursoTestResult.latencyMs} ms
            </span>
          </div>
        )}

        {/* Form fields */}
        <div className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Turso Database URL
            </label>
            <input
              type="text"
              value={tursoConfig.databaseUrl}
              onChange={(e) => setTursoConfig({ ...tursoConfig, databaseUrl: e.target.value })}
              placeholder="libsql://your-db-name.turso.io"
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-zinc-300">
                Turso Auth Token (JWT)
              </label>
              <button
                type="button"
                onClick={() => setShowTursoToken(!showTursoToken)}
                className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition"
              >
                {showTursoToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showTursoToken ? "Hide" : "Show"}</span>
              </button>
            </div>
            <input
              type={showTursoToken ? "text" : "password"}
              value={tursoConfig.authToken}
              onChange={(e) => setTursoConfig({ ...tursoConfig, authToken: e.target.value })}
              placeholder="eyJhbGciOiJFZERTQS..."
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Options: Auto-sync */}
          <div className="flex items-center justify-between p-3 bg-[#0a0a0b] border border-zinc-800 rounded-lg">
            <div>
              <span className="text-xs font-medium text-white block">Auto-Sync on Changes</span>
              <span className="text-[11px] text-zinc-500">
                Automatically push encrypted records to Turso whenever you add or edit variables.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={tursoConfig.autoSync}
                onChange={(e) => {
                  const updated = { ...tursoConfig, autoSync: e.target.checked };
                  setTursoConfig(updated);
                  api.saveTursoConfig(updated);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>
        </div>

        {/* Remote Sync Info Bar */}
        <div className="grid grid-cols-2 gap-3 text-xs pt-1">
          <div className="p-3 bg-[#0a0a0b] rounded-lg border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-500 text-[11px]">Remote Records</span>
            <span className="text-white font-mono font-medium">
              {tursoRemoteStatus ? `${tursoRemoteStatus.recordCount} files` : "—"}
            </span>
          </div>
          <div className="p-3 bg-[#0a0a0b] rounded-lg border border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-500 text-[11px]">Last Synced</span>
            <span className="text-white font-mono font-medium">
              {tursoConfig.lastSyncedAt
                ? new Date(tursoConfig.lastSyncedAt * 1000).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "Never"}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[#1e1e22]">
          <button
            type="button"
            onClick={handleTestTurso}
            disabled={testingConnection || !tursoConfig.databaseUrl || !tursoConfig.authToken}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? "animate-spin" : ""}`} />
            <span>{testingConnection ? "Testing Ping..." : "Test Connection"}</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveTurso()}
            disabled={savingTurso}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <span>{savingTurso ? "Saving..." : "Save Settings"}</span>
          </button>

          <div className="h-4 w-[1px] bg-zinc-800 mx-1 hidden sm:block" />

          <button
            type="button"
            onClick={handlePushTurso}
            disabled={syncingPush || !tursoConfig.enabled}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <CloudUpload className="w-3.5 h-3.5" />
            <span>{syncingPush ? "Pushing Vault..." : "Push to Cloud"}</span>
          </button>

          <button
            type="button"
            onClick={handlePullTurso}
            disabled={syncingPull || !tursoConfig.enabled}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-cyan-950/60 hover:text-cyan-300 border border-zinc-700 hover:border-cyan-700/50 disabled:opacity-50 text-zinc-200 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <CloudDownload className="w-3.5 h-3.5" />
            <span>{syncingPull ? "Restoring..." : "Pull from Cloud"}</span>
          </button>
        </div>
      </div>

      {/* Security Architecture Info */}
      <div className="bg-[#141416] border border-[#1e1e22] rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Security Architecture</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
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
            <span className="text-white font-mono font-medium">Encrypted Local Files + Turso Cloud</span>
          </div>
          <div className="p-3 bg-[#0a0a0b] rounded-lg border border-zinc-800">
            <span className="text-zinc-500 block text-[11px]">Atomic Write Strategy</span>
            <span className="text-white font-mono font-medium">Write-Ahead Journal + Fsync</span>
          </div>
        </div>
      </div>

      {/* Security Preferences: Auto-Lock & Clipboard */}
      <div className="bg-[#141416] border border-[#1e1e22] rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          <span>Session & Clipboard Policies</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Idle Auto-Lock Timeout
            </label>
            <select
              value={autoLockMinutes}
              onChange={(e) => setAutoLockMinutes(parseInt(e.target.value, 10))}
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes (Recommended)</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={0}>Never (Keep unlocked)</option>
            </select>
            <p className="text-[11px] text-zinc-500 mt-1">
              Frees and zeroizes encryption keys in RAM after inactivity.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Clipboard Auto-Clear
            </label>
            <select
              value={clipboardTimeoutSeconds}
              onChange={(e) => setClipboardTimeoutSeconds(parseInt(e.target.value, 10))}
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value={10}>10 seconds</option>
              <option value={30}>30 seconds (Recommended)</option>
              <option value={60}>60 seconds</option>
              <option value={120}>2 minutes</option>
              <option value={0}>Never</option>
            </select>
            <p className="text-[11px] text-zinc-500 mt-1">
              Clears copied variable secrets from system clipboard history.
            </p>
          </div>
        </div>
      </div>

      {/* Biometric Touch ID Card */}
      <div className="bg-[#141416] border border-[#1e1e22] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Touch ID / Biometric Quick Unlock</h2>
              <p className="text-xs text-zinc-400">
                Unlock your vault using macOS Touch ID without typing your master password every time.
              </p>
            </div>
          </div>

          <div>
            {bioStatus?.isEnrolled ? (
              <button
                type="button"
                onClick={handleDisableBio}
                disabled={bioLoading}
                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                Disable Touch ID
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEnrollingBio(true)}
                disabled={bioLoading || !bioStatus?.isAvailable}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-40"
              >
                Enable Touch ID
              </button>
            )}
          </div>
        </div>

        {bioMsg && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              bioMsg.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                : "bg-rose-500/10 border border-rose-500/20 text-rose-300"
            }`}
          >
            {bioMsg.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
            <span>{bioMsg.text}</span>
          </div>
        )}

        {isEnrollingBio && (
          <form onSubmit={handleEnableBio} className="p-4 bg-[#0a0a0b] rounded-xl border border-zinc-800 space-y-3">
            <p className="text-xs text-zinc-300">
              Enter your master password once to securely enroll with the macOS Keychain:
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                required
                value={bioPassword}
                onChange={(e) => setBioPassword(e.target.value)}
                placeholder="Enter master password"
                className="flex-1 bg-[#141416] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <button
                type="submit"
                disabled={bioLoading || !bioPassword}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-40"
              >
                {bioLoading ? "Enrolling..." : "Confirm & Save"}
              </button>
              <button
                type="button"
                onClick={() => setIsEnrollingBio(false)}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Master Password & Key Rotation */}
      <div className="bg-[#141416] border border-[#1e1e22] rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400" />
            <span>Change Master Password & Rotate Keys</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Zero-knowledge envelope re-wrapping: your root Vault Encryption Key is re-encrypted with a new Argon2id key. All variables remain intact.
          </p>
        </div>

        {passwordError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs">
            {passwordError}
          </div>
        )}

        {passwordSuccess && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{passwordSuccess}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Current Master Password</label>
            <div className="relative">
              <input
                type={showOldPw ? "text" : "password"}
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Enter your current password"
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 pr-9 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowOldPw(!showOldPw)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showOldPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">New Master Password</label>
              <div className="relative">
                <input
                  type={showNewPw ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 10 chars, letters, numbers"
                  className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 pr-9 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showNewPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {newPassword && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs">
              <button
                type="button"
                disabled={checkingBreach}
                onClick={async () => {
                  try {
                    setCheckingBreach(true);
                    const res = await api.checkSecretCompromise(newPassword);
                    setBreachResult({ checked: true, breached: res.breached, count: res.count });
                  } catch (e: any) {
                    console.error(e);
                  } finally {
                    setCheckingBreach(false);
                  }
                }}
                className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
              >
                {checkingBreach ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>Check if password is leaked in public breaches (k-Anonymity)</span>
              </button>

              {breachResult?.checked && (
                <span
                  className={`text-[11px] font-medium flex items-center gap-1 ${
                    breachResult.breached ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {breachResult.breached ? (
                    <>
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Exposed in {breachResult.count.toLocaleString()} breaches! Choose another.</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Zero breaches found (Safe)</span>
                    </>
                  )}
                </span>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={passwordLoading || !oldPassword || !newPassword || !confirmPassword}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{passwordLoading ? "Rotating Keys with Argon2id..." : "Update Password & Rotate Keys"}</span>
          </button>
        </form>
      </div>

      {/* Encrypted Backup */}
      <div className="bg-[#141416] border border-[#1e1e22] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-2">
          <Download className="w-4 h-4 text-indigo-400" />
          <span>Create Offline Encrypted Backup</span>
        </h2>
        <p className="text-xs text-zinc-400 mb-4">
          Export an authenticated, encrypted archive (.lvbackup) of all projects and environments to your local disk.
        </p>

        {backupError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs mb-4">
            {backupError}
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
            disabled={backupLoading || !backupPassphrase}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{backupLoading ? "Encrypting Backup..." : "Generate .lvbackup Archive"}</span>
          </button>
        </form>
      </div>
      </div>
    </div>
  );
};
