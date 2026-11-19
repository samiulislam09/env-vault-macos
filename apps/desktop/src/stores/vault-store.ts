import { create } from "zustand";
import { api } from "../lib/tauri";
import type {
  EnvironmentRecord,
  ProjectRecord,
  VariableSummary,
  WorkspaceRecord,
  UserSession,
  UserAccountSummary,
  VaultRole,
} from "../lib/types";

interface VaultState {
  // Vault lifecycle & authentication
  isInitialized: boolean;
  isUnlocked: boolean;
  currentUser: UserSession | null;
  localAccounts: UserAccountSummary[];
  vaultPath: string;
  isLoading: boolean;
  error: string | null;

  // Role-Based Access Control (RBAC)
  activeRole: VaultRole;
  setActiveRole: (role: VaultRole) => void;

  // Active navigation
  activeView: "dashboard" | "project" | "compare" | "settings";
  setActiveView: (view: "dashboard" | "project" | "compare" | "settings") => void;

  // Entities (Metadata only, NO secret values)
  workspaces: WorkspaceRecord[];
  activeWorkspaceId: string | null;
  projects: ProjectRecord[];
  activeProjectId: string | null;
  environments: EnvironmentRecord[];
  activeEnvironmentId: string | null;
  projectEnvironments: Record<string, EnvironmentRecord[]>;
  variables: VariableSummary[];

  // Actions
  checkStatus: () => Promise<void>;
  createVault: (password: string) => Promise<string>;
  unlockVault: (password: string) => Promise<void>;
  unlockWithRecovery: (recoveryKey: string) => Promise<void>;
  lockVault: () => Promise<void>;

  // User Authentication
  login: (email: string, password: string) => Promise<void>;
  biometricUnlock: (email: string, userId: string) => Promise<void>;
  register: (email: string, password: string) => Promise<string | undefined>;
  logout: () => Promise<void>;

  // Sync & Security Preferences
  syncStatus: "idle" | "syncing" | "synced" | "error";
  lastSyncTime: number | null;
  autoLockMinutes: number;
  clipboardTimeoutSeconds: number;
  setAutoLockMinutes: (min: number) => void;
  setClipboardTimeoutSeconds: (sec: number) => void;
  triggerSync: () => Promise<void>;

  // Selection
  selectProject: (projectId: string) => Promise<void>;
  selectProjectAndEnvironment: (projectId: string, envId: string) => Promise<void>;
  loadProjectEnvironments: (projectId: string) => Promise<EnvironmentRecord[]>;
  updateEnvironment: (envId: string, name: string, isProduction: boolean) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  selectEnvironment: (envId: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  reorderProjects: (sourceIndex: number, targetIndex: number) => void;
  refreshEnvironments: (projectId: string) => Promise<void>;
  refreshVariables: (envId: string) => Promise<void>;
}

function applySavedProjectOrder(projects: ProjectRecord[]): ProjectRecord[] {
  try {
    const raw = localStorage.getItem("lv_project_order");
    if (!raw) return projects;
    const order: string[] = JSON.parse(raw);
    if (!Array.isArray(order) || order.length === 0) return projects;

    const map = new Map(projects.map((p) => [p.id, p]));
    const result: ProjectRecord[] = [];

    for (const id of order) {
      const p = map.get(id);
      if (p) {
        result.push(p);
        map.delete(id);
      }
    }
    for (const p of map.values()) {
      result.push(p);
    }
    return result;
  } catch {
    return projects;
  }
}

export const useVaultStore = create<VaultState>((set, get) => ({
  isInitialized: false,
  isUnlocked: false,
  currentUser: null,
  localAccounts: [],
  vaultPath: "",
  isLoading: true,
  error: null,
  activeRole: (localStorage.getItem("lv_active_role") as VaultRole) || "admin",
  setActiveRole: (role: VaultRole) => {
    localStorage.setItem("lv_active_role", role);
    set({ activeRole: role });
  },
  activeView: "dashboard",

  workspaces: [],
  activeWorkspaceId: null,
  projects: [],
  activeProjectId: null,
  environments: [],
  activeEnvironmentId: null,
  projectEnvironments: {},
  variables: [],

  syncStatus: "idle",
  lastSyncTime: null,
  autoLockMinutes: parseInt(localStorage.getItem("lv_auto_lock_minutes") || "15", 10),
  clipboardTimeoutSeconds: parseInt(localStorage.getItem("lv_clipboard_timeout_sec") || "30", 10),

  setAutoLockMinutes: (min: number) => {
    localStorage.setItem("lv_auto_lock_minutes", min.toString());
    set({ autoLockMinutes: min });
  },

  setClipboardTimeoutSeconds: (sec: number) => {
    localStorage.setItem("lv_clipboard_timeout_sec", sec.toString());
    set({ clipboardTimeoutSeconds: sec });
  },

  triggerSync: async () => {
    try {
      set({ syncStatus: "syncing" });
      await api.tursoSyncPush();
      await api.tursoSyncPull();
      set({ syncStatus: "synced", lastSyncTime: Date.now() });
      await get().refreshProjects();
    } catch (e: any) {
      console.error("Manual sync failed:", e);
      set({ syncStatus: "error" });
    }
  },

  setActiveView: (view) => set({ activeView: view }),

  checkStatus: async () => {
    try {
      set({ isLoading: true, error: null });
      const auth = await api.getAuthStatus();
      set({
        isInitialized: auth.localAccounts.length > 0 || !!auth.currentUser,
        isUnlocked: auth.isUnlocked,
        currentUser: auth.currentUser,
        localAccounts: auth.localAccounts,
        vaultPath: auth.vaultPath,
        isLoading: false,
      });

      if (auth.isUnlocked) {
        await get().refreshProjects();
      }
    } catch (e: any) {
      set({ error: e.toString(), isLoading: false });
    }
  },

  createVault: async (password: string) => {
    try {
      set({ isLoading: true, error: null });
      const res = await api.createVault(password);
      set({ isInitialized: true, isUnlocked: true, isLoading: false });
      await get().refreshProjects();
      return res.recovery_key;
    } catch (e: any) {
      set({ error: e.toString(), isLoading: false });
      throw e;
    }
  },

  unlockVault: async (password: string) => {
    try {
      set({ isLoading: true, error: null });
      await api.unlockVault(password);
      set({ isUnlocked: true, isLoading: false });
      await get().refreshProjects();
    } catch (e: any) {
      set({ error: e.toString(), isLoading: false });
      throw e;
    }
  },

  unlockWithRecovery: async (recoveryKey: string) => {
    try {
      set({ isLoading: true, error: null });
      await api.unlockWithRecovery(recoveryKey);
      set({ isUnlocked: true, isLoading: false });
      await get().refreshProjects();
    } catch (e: any) {
      set({ error: e.toString(), isLoading: false });
      throw e;
    }
  },

  lockVault: async () => {
    try {
      await api.lockVault();
      set({
        isUnlocked: false,
        projects: [],
        activeProjectId: null,
        environments: [],
        activeEnvironmentId: null,
        variables: [],
      });
      await get().checkStatus();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },

  login: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const resp = await api.login(email, password);
      set({
        currentUser: { userId: resp.userId, email: resp.email },
        isUnlocked: true,
        isLoading: false,
      });
      await get().refreshProjects();
    } catch (e: any) {
      set({ error: e.toString(), isLoading: false });
      throw e;
    }
  },

  biometricUnlock: async (email: string, userId: string) => {
    try {
      set({ isLoading: true, error: null });
      const resp = await api.biometricUnlock(email, userId);
      set({
        currentUser: { userId: resp.userId, email: resp.email },
        isUnlocked: true,
        isLoading: false,
      });
      await get().refreshProjects();
    } catch (e: any) {
      set({ error: e.toString(), isLoading: false });
      throw e;
    }
  },

  register: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const resp = await api.register(email, password);
      set({
        currentUser: { userId: resp.userId, email: resp.email },
        isUnlocked: true,
        isLoading: false,
      });
      await get().refreshProjects();
      return resp.recoveryKey;
    } catch (e: any) {
      set({ error: e.toString(), isLoading: false });
      throw e;
    }
  },

  logout: async () => {
    try {
      await api.logout();
      set({
        isUnlocked: false,
        currentUser: null,
        projects: [],
        activeProjectId: null,
        environments: [],
        activeEnvironmentId: null,
        variables: [],
      });
      await get().checkStatus();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },

  refreshProjects: async () => {
    try {
      const rawProjects = await api.listProjects();
      const projects = applySavedProjectOrder(rawProjects);
      set({ projects });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },

  reorderProjects: (sourceIndex: number, targetIndex: number) => {
    const current = [...get().projects];
    if (
      sourceIndex < 0 ||
      sourceIndex >= current.length ||
      targetIndex < 0 ||
      targetIndex >= current.length ||
      sourceIndex === targetIndex
    ) {
      return;
    }

    const [moved] = current.splice(sourceIndex, 1);
    current.splice(targetIndex, 0, moved);

    const orderedIds = current.map((p) => p.id);
    localStorage.setItem("lv_project_order", JSON.stringify(orderedIds));
    set({ projects: current });
  },

  selectProject: async (projectId: string) => {
    set({ activeProjectId: projectId, activeView: "project" });
    await get().refreshEnvironments(projectId);
  },

  selectProjectAndEnvironment: async (projectId: string, envId: string) => {
    set({ activeProjectId: projectId, activeView: "project", activeEnvironmentId: envId });
    try {
      const environments = await api.listEnvironments(projectId);
      set((s) => ({
        environments,
        projectEnvironments: { ...s.projectEnvironments, [projectId]: environments },
      }));
      await get().refreshVariables(envId);
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },

  loadProjectEnvironments: async (projectId: string) => {
    try {
      const envs = await api.listEnvironments(projectId);
      set((s) => ({
        projectEnvironments: { ...s.projectEnvironments, [projectId]: envs },
      }));
      return envs;
    } catch (e: any) {
      console.error("Failed to load project environments:", e);
      return [];
    }
  },

  updateEnvironment: async (envId: string, name: string, isProduction: boolean) => {
    try {
      await api.updateEnvironment({ envId, name, isProduction });
      const currentProjId = get().activeProjectId;
      if (currentProjId) {
        await get().refreshEnvironments(currentProjId);
      }
    } catch (e: any) {
      set({ error: e.toString() });
      throw e;
    }
  },

  deleteProject: async (projectId: string) => {
    try {
      await api.deleteProject(projectId);
      const state = get();
      const updatedMap = { ...state.projectEnvironments };
      delete updatedMap[projectId];

      if (state.activeProjectId === projectId) {
        set({
          activeProjectId: null,
          activeEnvironmentId: null,
          environments: [],
          variables: [],
          activeView: "dashboard",
          projectEnvironments: updatedMap,
        });
      } else {
        set({ projectEnvironments: updatedMap });
      }
      await get().refreshProjects();
    } catch (e: any) {
      set({ error: e.toString() });
      throw e;
    }
  },

  refreshEnvironments: async (projectId: string) => {
    try {
      const environments = await api.listEnvironments(projectId);
      set((s) => ({
        environments,
        projectEnvironments: { ...s.projectEnvironments, [projectId]: environments },
      }));
      if (environments.length > 0) {
        const currentActiveId = get().activeEnvironmentId;
        const exists = environments.some((e) => e.id === currentActiveId);
        if (!exists) {
          const defaultEnv =
            environments.find((e) => e.is_default) || environments[0];
          await get().selectEnvironment(defaultEnv.id);
        } else if (currentActiveId) {
          await get().refreshVariables(currentActiveId);
        }
      } else {
        set({ activeEnvironmentId: null, variables: [] });
      }
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },

  selectEnvironment: async (envId: string) => {
    set({ activeEnvironmentId: envId });
    await get().refreshVariables(envId);
  },

  refreshVariables: async (envId: string) => {
    try {
      const variables = await api.listVariables(envId);
      set({ variables });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
}));
