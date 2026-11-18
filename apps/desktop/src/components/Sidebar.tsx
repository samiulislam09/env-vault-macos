import React from "react";
import { useVaultStore } from "../stores/vault-store";
import {
  Shield,
  LayoutDashboard,
  FolderGit2,
  GitCompare,
  Settings,
  Lock,
  Plus,
  Layers,
} from "lucide-react";

interface SidebarProps {
  onNewProject: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNewProject }) => {
  const activeView = useVaultStore((s) => s.activeView);
  const setActiveView = useVaultStore((s) => s.setActiveView);
  const projects = useVaultStore((s) => s.projects);
  const activeProjectId = useVaultStore((s) => s.activeProjectId);
  const selectProject = useVaultStore((s) => s.selectProject);
  const lockVault = useVaultStore((s) => s.lockVault);

  return (
    <aside className="w-64 bg-[#0d0d0f] border-r border-[#1e1e22] flex flex-col h-screen select-none shrink-0">
      {/* Brand header */}
      <div className="h-14 px-4 border-b border-[#1e1e22] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm">
            <Shield className="w-4 h-4" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-white">LocalVault</span>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Encrypted
        </span>
      </div>

      {/* Main Nav */}
      <div className="p-3 space-y-1">
        <button
          type="button"
          onClick={() => setActiveView("dashboard")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
            activeView === "dashboard"
              ? "bg-zinc-800/80 text-white"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/40"
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView("compare")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
            activeView === "compare"
              ? "bg-zinc-800/80 text-white"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/40"
          }`}
        >
          <GitCompare className="w-4 h-4" />
          <span>Compare Envs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView("settings")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
            activeView === "settings"
              ? "bg-zinc-800/80 text-white"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/40"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Vault Settings</span>
        </button>
      </div>

      {/* Projects section */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="flex items-center justify-between px-2 mb-2 text-zinc-500">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Projects</span>
          <button
            type="button"
            onClick={onNewProject}
            className="p-1 hover:text-white hover:bg-zinc-800 rounded transition"
            title="Create Project"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-0.5">
          {projects.map((proj) => {
            const isSelected = activeProjectId === proj.id && activeView === "project";
            return (
              <button
                key={proj.id}
                type="button"
                onClick={() => selectProject(proj.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition text-left truncate ${
                  isSelected
                    ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20"
                    : "text-zinc-300 hover:bg-zinc-800/40 hover:text-white"
                }`}
              >
                <FolderGit2 className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span className="truncate">{proj.name}</span>
                {proj.environment_ids.length > 0 && (
                  <span className="ml-auto text-[10px] text-zinc-500 font-mono">
                    {proj.environment_ids.length}
                  </span>
                )}
              </button>
            );
          })}

          {projects.length === 0 && (
            <div className="px-3 py-4 text-center border border-dashed border-zinc-800 rounded-lg text-xs text-zinc-500">
              No projects yet
            </div>
          )}
        </div>
      </div>

      {/* Footer Lock Action */}
      <div className="p-3 border-t border-[#1e1e22]">
        <button
          type="button"
          onClick={() => lockVault()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-rose-950/40 hover:text-rose-300 border border-zinc-800 hover:border-rose-800/40 text-zinc-400 rounded-lg text-xs font-medium transition"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Lock Vault</span>
        </button>
      </div>
    </aside>
  );
};
