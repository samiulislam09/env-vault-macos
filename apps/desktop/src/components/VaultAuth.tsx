import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import {
  Lock,
  UserPlus,
  LogIn,
  Key,
  Shield,
  AlertTriangle,
  Copy,
  Check,
  Database,
  ArrowRight,
  ShieldCheck,
  Users,
  Eye,
  EyeOff,
  Fingerprint,
} from "lucide-react";
import { api } from "../lib/tauri";

export const VaultAuth: React.FC = () => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Recovery Key display on new registration
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);

  const localAccounts = useVaultStore((s) => s.localAccounts);
  const login = useVaultStore((s) => s.login);
  const biometricUnlock = useVaultStore((s) => s.biometricUnlock);
  const register = useVaultStore((s) => s.register);

  const [isBiometricEnrolled, setIsBiometricEnrolled] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  React.useEffect(() => {
    const checkBio = async () => {
      const match = localAccounts.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
      if (match) {
        try {
          const status = await api.getBiometricStatus(match.id);
          setIsBiometricEnrolled(status.isAvailable && status.isEnrolled);
        } catch {
          setIsBiometricEnrolled(false);
        }
      } else {
        setIsBiometricEnrolled(false);
      }
    };
    checkBio();
  }, [email, localAccounts]);

  const handleTouchIdUnlock = async () => {
    const match = localAccounts.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
    if (!match) return;
    setBiometricLoading(true);
    setError(null);
    try {
      await biometricUnlock(match.email, match.id);
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setBiometricLoading(false);
    }
  };

  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: "Enter Password", color: "bg-zinc-800", text: "text-zinc-500", percent: 0 };
    let score = 0;
    if (pwd.length >= 10) score += 1;
    if (pwd.length >= 14) score += 1;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 1) return { score: 1, label: "Very Weak (min 10 chars required)", color: "bg-rose-500", text: "text-rose-400", percent: 25 };
    if (score === 2) return { score: 2, label: "Fair (add numbers & symbols)", color: "bg-amber-500", text: "text-amber-400", percent: 50 };
    if (score === 3 || score === 4) return { score: 3, label: "Good Passphrase", color: "bg-cyan-500", text: "text-cyan-400", percent: 75 };
    return { score: 4, label: "Cryptographically Strong", color: "bg-emerald-500", text: "text-emerald-400", percent: 100 };
  };

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    if (password.length < 10) {
      setError("Master password must be at least 10 characters long for zero-knowledge security");
      return;
    }

    if (mode === "register") {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }

      try {
        setLoading(true);
        const recoveryKey = await register(cleanEmail, password);
        setPassword("");
        setConfirmPassword("");
        if (recoveryKey) {
          setNewRecoveryKey(recoveryKey);
        }
      } catch (err: any) {
        setError(err.toString());
      } finally {
        setLoading(false);
      }
    } else {
      try {
        setLoading(true);
        await login(cleanEmail, password);
        setPassword("");
      } catch (err: any) {
        setError(err.toString());
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCopyRecoveryKey = () => {
    if (newRecoveryKey) {
      navigator.clipboard.writeText(newRecoveryKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  // If newly registered, show Recovery Key confirmation screen
  if (newRecoveryKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12 bg-[#0a0a0b]">
        <div className="w-full max-w-lg bg-[#141416] border border-[#1e1e22] rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="flex items-center gap-3 text-emerald-400">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Account & Vault Created!</h1>
              <p className="text-xs text-zinc-400">Your zero-knowledge encrypted vault is ready.</p>
            </div>
          </div>

          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200/90 leading-relaxed space-y-1">
              <p className="font-semibold text-amber-300">Save your Emergency Recovery Key now!</p>
              <p>
                Because LocalVault uses zero-knowledge encryption, nobody (including database admins) can reset your password. If you ever forget it, this key is the <strong>only way</strong> to regain access.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              Emergency Recovery Key (128-bit Base32)
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[#0a0a0b] border border-[#27272a] rounded-xl px-4 py-3 font-mono text-sm tracking-wider text-emerald-400 select-all break-all">
                {newRecoveryKey}
              </div>
              <button
                type="button"
                onClick={handleCopyRecoveryKey}
                className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedKey ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3.5 bg-[#0a0a0b] border border-zinc-800 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={confirmedSaved}
              onChange={(e) => setConfirmedSaved(e.target.checked)}
              className="mt-0.5 rounded border-zinc-700 text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <span className="text-xs text-zinc-300 leading-relaxed">
              I have safely backed up my recovery key offline in a password manager or secure location.
            </span>
          </label>

          <button
            type="button"
            disabled={!confirmedSaved}
            onClick={() => setNewRecoveryKey(null)}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-lg shadow-indigo-600/20"
          >
            <span>Enter My Vault</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12 bg-[#0a0a0b]">
      <div className="w-full max-w-md bg-[#141416] border border-[#1e1e22] rounded-2xl p-8 shadow-2xl space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3">
            <img
              src="/logo.png"
              alt="LocalVault"
              className="w-14 h-14 rounded-2xl shadow-xl border border-indigo-500/30 object-contain"
            />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-cyan-400 border-2 border-[#141416]"></span>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>LocalVault</span>
          </h1>

          <div className="flex items-center gap-2 mt-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Database className="w-2.5 h-2.5" />
              <span>Turso Edge DB</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Shield className="w-2.5 h-2.5" />
              <span>Argon2id + AEAD</span>
            </span>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 p-1 bg-[#0a0a0b] rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`py-2 text-xs font-medium rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
              mode === "login"
                ? "bg-[#1e1e22] text-white shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`py-2 text-xs font-medium rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
              mode === "register"
                ? "bg-[#1e1e22] text-white shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create Account</span>
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Saved Accounts on this Device */}
        {mode === "login" && localAccounts.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
              <Users className="w-3 h-3 text-zinc-500" />
              <span>Saved accounts on this device:</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {localAccounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setEmail(acc.email)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono transition border cursor-pointer ${
                    email === acc.email
                      ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40"
                      : "bg-[#0a0a0b] text-zinc-400 hover:text-white border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  {acc.email}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="developer@example.com"
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition font-mono"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Master Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showPassword ? "Hide" : "Show"}</span>
              </button>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="••••••••••••"
              className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition font-mono"
            />

            {/* Live Password Strength Meter in Register Mode */}
            {mode === "register" && password.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${strength.color} transition-all duration-300`}
                    style={{ width: `${strength.percent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className={strength.text}>{strength.label}</span>
                  <span className="text-zinc-500">{password.length}/10 min chars</span>
                </div>
              </div>
            )}
          </div>

          {mode === "register" && (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Confirm Master Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="••••••••••••"
                className="w-full bg-[#0a0a0b] border border-[#27272a] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition font-mono"
              />
            </div>
          )}

          {mode === "login" && isBiometricEnrolled && (
            <button
              type="button"
              onClick={handleTouchIdUnlock}
              disabled={biometricLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Fingerprint className="w-4 h-4 text-emerald-400" />
              <span>{biometricLoading ? "Waiting for Touch ID..." : "Unlock with Touch ID"}</span>
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-lg shadow-indigo-600/20 mt-2"
          >
            {mode === "login" ? <Lock className="w-3.5 h-3.5" /> : <Key className="w-3.5 h-3.5" />}
            <span>
              {loading
                ? mode === "login"
                  ? "Verifying & Decrypting..."
                  : "Deriving Argon2id Keys..."
                : mode === "login"
                ? "Unlock Vault"
                : "Register & Initialize Vault"}
            </span>
          </button>
        </form>

        {/* Security guarantee footer */}
        <div className="pt-3 border-t border-[#1e1e22] text-[11px] text-zinc-500 text-center leading-relaxed">
          🔒 Encrypted client-side with <strong>XChaCha20-Poly1305</strong>. Your master password and decrypted secrets never touch the database or network.
        </div>
      </div>
    </div>
  );
};
