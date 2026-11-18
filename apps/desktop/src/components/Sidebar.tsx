import React, { useState, useEffect } from "react";
import { useVaultStore } from "../stores/vault-store";
import {
  FolderGit2,
  GitCompare,
  Settings,
  Lock,
  Plus,
  Search,
  Trash2,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
} from "lucide-react";
import { ConfirmModal } from "./ConfirmModal";

interface SidebarProps {
  onNewProject: () => void;
  onOpenCommandPalette: () => void;
  onNewEnvironment?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onNewProject,
  onOpenCommandPalette,
  onNewEnvironment,
}) => {
  const activeView = useVaultStore((s) => s.activeView);
  const setActiveView = useVaultStore((s) => s.setActiveView);
  const projects = useVaultStore((s) => s.projects);
  const activeProjectId = useVaultStore((s) => s.activeProjectId);
  const activeEnvironmentId = useVaultStore((s) => s.activeEnvironmentId);
  const selectProject = useVaultStore((s) => s.selectProject);
  const selectProjectAndEnvironment = useVaultStore((s) => s.selectProjectAndEnvironment);
  const loadProjectEnvironments = useVaultStore((s) => s.loadProjectEnvironments);
  const projectEnvironments = useVaultStore((s) => s.projectEnvironments);
  const deleteProject = useVaultStore((s) => s.deleteProject);
  const lockVault = useVaultStore((s) => s.lockVault);

  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  // Auto-expand active project on mount or when activeProjectId changes
  useEffect(() => {
    if (activeProjectId) {
      setExpandedProjects((prev) => ({ ...prev, [activeProjectId]: true }));
      loadProjectEnvironments(activeProjectId);
    }
  }, [activeProjectId, loadProjectEnvironments]);

  // Load environments for any project currently expanded
  useEffect(() => {
    for (const p of projects) {
      if (expandedProjects[p.id] && !projectEnvironments[p.id]) {
        loadProjectEnvironments(p.id);
      }
    }
  }, [expandedProjects, projects, projectEnvironments, loadProjectEnvironments]);

  const toggleProjectExpand = (projectId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedProjects((prev) => {
      const nextState = !prev[projectId];
      if (nextState) {
        loadProjectEnvironments(projectId);
      }
      return { ...prev, [projectId]: nextState };
    });
  };

  const allExpanded =
    projects.length > 0 && projects.every((p) => expandedProjects[p.id]);

  const toggleAllProjects = () => {
    const newState = !allExpanded;
    const nextMap: Record<string, boolean> = {};
    for (const p of projects) {
      nextMap[p.id] = newState;
      if (newState) {
        loadProjectEnvironments(p.id);
      }
    }
    setExpandedProjects(nextMap);
  };

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
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Projects</span>
            {projects.length > 0 && (
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.2 rounded-full font-mono">
                {projects.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {projects.length > 0 && (
              <button
                type="button"
                onClick={toggleAllProjects}
                className="px-1.5 py-0.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 rounded text-[10px] font-medium transition"
                title={allExpanded ? "Collapse All Projects" : "Expand All Projects"}
              >
                {allExpanded ? "Collapse" : "Expand"}
              </button>
            )}
            <button
              type="button"
              onClick={onNewProject}
              className="p-1 hover:text-white hover:bg-zinc-800 rounded transition"
              title="Create Project"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="space-y-1">
          {projects.map((proj) => {
            const isSelected = activeProjectId === proj.id && activeView === "project";
            const isExpanded = !!expandedProjects[proj.id];
            const envs = projectEnvironments[proj.id] || [];

            return (
              <div key={proj.id} className="space-y-0.5">
                <div
                  onClick={() => {
                    selectProject(proj.id);
                    if (!expandedProjects[proj.id]) {
                      toggleProjectExpand(proj.id);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-medium transition cursor-pointer group ${
                    isSelected
                      ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20"
                      : "text-zinc-300 hover:bg-zinc-800/40 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <button
                      type="button"
                      onClick={(e) => toggleProjectExpand(proj.id, e)}
                      className="p-0.5 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800 transition"
                      title={isExpanded ? "Collapse project items" : "Expand project items"}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <FolderGit2 className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{proj.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {envs.length || proj.environment_ids.length}
                    </span>
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

                {/* Collapsible Children: Environments */}
                {isExpanded && (
                  <div className="ml-4 pl-2 border-l border-zinc-800/80 space-y-0.5 py-0.5">
                    {envs.map((env) => {
                      const isEnvActive =
                        activeProjectId === proj.id &&
                        activeEnvironmentId === env.id &&
                        activeView === "project";
                      return (
                        <div
                          key={env.id}
                          onClick={() => selectProjectAndEnvironment(proj.id, env.id)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs transition cursor-pointer group/env ${
                            isEnvActive
                              ? "bg-indigo-600/20 text-indigo-300 font-medium"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                env.is_production
                                  ? "bg-rose-500 shadow-rose-500/40"
                                  : "bg-emerald-400 shadow-emerald-400/40"
                              }`}
                            />
                            <span className="truncate">{env.name}</span>
                          </div>
                          {env.is_production && (
                            <span className="text-[8px] px-1 py-0.2 bg-rose-500/20 text-rose-300 rounded font-semibold uppercase shrink-0">
                              PROD
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {envs.length === 0 && (
                      <div className="px-2 py-1 text-[11px] text-zinc-600 italic">
                        No environments
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        selectProject(proj.id);
                        onNewEnvironment?.();
                      }}
                      className="w-full flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-500 hover:text-indigo-400 hover:bg-zinc-800/30 rounded transition text-left cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Env</span>
                    </button>
                  </div>
                )}
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
