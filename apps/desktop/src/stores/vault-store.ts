import { create } from "zustand";
import { api } from "../lib/tauri";
import type {
  EnvironmentRecord,
  ProjectRecord,
  VariableSummary,
  WorkspaceRecord,
} from "../lib/types";

interface VaultState {
  // Vault lifecycle
  isInitialized: boolean;
  isUnlocked: boolean;
  vaultPath: string;
  isLoading: boolean;
  error: string | null;

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
  variables: VariableSummary[];

  // Actions
  checkStatus: () => Promise<void>;
  createVault: (password: string) => Promise<string>;
  unlockVault: (password: string) => Promise<void>;
  unlockWithRecovery: (recoveryKey: string) => Promise<void>;
  lockVault: () => Promise<void>;

  // Selection
  selectProject: (projectId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  selectEnvironment: (envId: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshEnvironments: (projectId: string) => Promise<void>;
  refreshVariables: (envId: string) => Promise<void>;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  isInitialized: false,
  isUnlocked: false,
  vaultPath: "",
  isLoading: true,
  error: null,
  activeView: "dashboard",

  workspaces: [],
  activeWorkspaceId: null,
  projects: [],
  activeProjectId: null,
  environments: [],
  activeEnvironmentId: null,
  variables: [],

  setActiveView: (view) => set({ activeView: view }),

  checkStatus: async () => {
    try {
      set({ isLoading: true, error: null });
      const status = await api.getVaultStatus();
      set({
        isInitialized: status.exists,
        isUnlocked: status.is_unlocked,
        vaultPath: status.vault_path,
        isLoading: false,
      });

      if (status.is_unlocked) {
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
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },

  refreshProjects: async () => {
    try {
      const projects = await api.listProjects();
      set({ projects });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },

  selectProject: async (projectId: string) => {
    set({ activeProjectId: projectId, activeView: "project" });
    await get().refreshEnvironments(projectId);
  },

  deleteProject: async (projectId: string) => {
    try {
      await api.deleteProject(projectId);
      const state = get();
      if (state.activeProjectId === projectId) {
        set({
          activeProjectId: null,
          activeEnvironmentId: null,
          environments: [],
          variables: [],
          activeView: "dashboard",
        });
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
      set({ environments });
      if (environments.length > 0) {
        const defaultEnv =
          environments.find((e) => e.is_default) || environments[0];
        await get().selectEnvironment(defaultEnv.id);
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
