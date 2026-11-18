import React, { useState } from "react";
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
  Search,
  Trash2,
} from "lucide-react";
import { ConfirmModal } from "./ConfirmModal";

interface SidebarProps {
  onNewProject: () => void;
  onOpenCommandPalette: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNewProject, onOpenCommandPalette }) => {
  const activeView = useVaultStore((s) => s.activeView);
  const setActiveView = useVaultStore((s) => s.setActiveView);
  const projects = useVaultStore((s) => s.projects);
  const activeProjectId = useVaultStore((s) => s.activeProjectId);
  const selectProject = useVaultStore((s) => s.selectProject);
  const deleteProject = useVaultStore((s) => s.deleteProject);
  const refreshProjects = useVaultStore((s) => s.refreshProjects);
  const lockVault = useVaultStore((s) => s.lockVault);

  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    try {
      setIsDeleting(true);
      await deleteProject(projectToDelete.id);
      setProjectToDelete(null);
    } catch (err: any) {
      alert("Failed to delete project: " + err.toString());
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <aside className="w-64 bg-[#0d0d0f] border-r border-[#1e1e22] flex flex-col h-screen select-none shrink-0">
      {/* Brand header */}
      <div className="h-14 px-4 border-b border-[#1e1e22] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="LocalVault"
            className="w-7 h-7 rounded-lg object-contain shadow-sm border border-indigo-500/30"
          />
          <span className="font-semibold text-sm tracking-tight text-white">LocalVault</span>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Encrypted
        </span>
      </div>

      {/* Main Nav */}
      <div className="p-3 space-y-1">
        {/* Quick Command Palette Button */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3 py-2 mb-2 bg-[#141416] hover:bg-zinc-800 text-zinc-400 hover:text-white border border-[#27272a] rounded-lg text-xs font-medium transition group"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-zinc-500 group-hover:text-indigo-400 transition" />
            <span>Search & Commands</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 rounded font-mono">
            ⌘K
          </kbd>
        </button>

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
              <div
                key={proj.id}
                onClick={() => selectProject(proj.id)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer group ${
                  isSelected
                    ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20"
                    : "text-zinc-300 hover:bg-zinc-800/40 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FolderGit2 className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{proj.name}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {proj.environment_ids.length > 0 && (
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {proj.environment_ids.length}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjectToDelete({ id: proj.id, name: proj.name });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 hover:bg-rose-950/40 rounded transition"
                    title="Delete Project"
                  >
                    <Trash2 className="w-3 h-3 text-zinc-400 hover:text-rose-400" />
                  </button>
                </div>
              </div>
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
          <span>Lock Vault (⌘L)</span>
        </button>
      </div>

      <ConfirmModal
        isOpen={!!projectToDelete}
        title="Delete Project"
        message={`Are you sure you want to permanently delete "${projectToDelete?.name}" and all its encrypted environments? This action cannot be undone.`}
        confirmLabel="Delete Project"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setProjectToDelete(null)}
      />
    </aside>
  );
};
