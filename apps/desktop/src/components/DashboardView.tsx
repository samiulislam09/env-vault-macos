import React, { useState } from "react";
import { useVaultStore } from "../stores/vault-store";
import {
  FolderGit2,
  Layers,
  ShieldCheck,
  HardDrive,
  Plus,
  ArrowUpRight,
  Download,
  GripVertical,
} from "lucide-react";
import { ExportAllEnvsModal } from "./ExportAllEnvsModal";

interface DashboardViewProps {
  onNewProject: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNewProject }) => {
  const projects = useVaultStore((s) => s.projects);
  const environments = useVaultStore((s) => s.environments);
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const selectProject = useVaultStore((s) => s.selectProject);
  const reorderProjects = useVaultStore((s) => s.reorderProjects);

  const [isExportAllOpen, setIsExportAllOpen] = useState(false);
  const [draggedProjectIndex, setDraggedProjectIndex] = useState<number | null>(null);
  const [dragOverProjectIndex, setDragOverProjectIndex] = useState<number | null>(null);

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto">
      <div className="p-6 md:p-8 max-w-6xl w-full mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
            <p className="text-xs text-zinc-400 mt-1">
              Local-first, encrypted secrets overview.
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => setIsExportAllOpen(true)}
              disabled={projects.length === 0}
              className="flex items-center gap-2 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-medium transition shadow-sm"
              title="Export all projects & environments into a single bundle"
            >
              <Download className="w-4 h-4 text-indigo-400" />
              <span>Export All Envs</span>
            </button>

            <button
              type="button"
              onClick={onNewProject}
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition shadow-md shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-[#141416] border border-[#1e1e22] rounded-xl p-5">
            <div className="flex items-center justify-between text-zinc-400 mb-3">
              <span className="text-xs font-medium uppercase tracking-wider">Projects</span>
              <FolderGit2 className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-3xl font-bold text-white">{projects.length}</div>
            <span className="text-[11px] text-zinc-500 mt-1 block">Active developer projects</span>
          </div>

          <div className="bg-[#141416] border border-[#1e1e22] rounded-xl p-5">
            <div className="flex items-center justify-between text-zinc-400 mb-3">
              <span className="text-xs font-medium uppercase tracking-wider">Security State</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-lg font-semibold text-emerald-400">XChaCha20-Poly1305</div>
            <span className="text-[11px] text-zinc-500 mt-1 block">Argon2id Memory-Hard KDF</span>
          </div>

          <div className="bg-[#141416] border border-[#1e1e22] rounded-xl p-5">
            <div className="flex items-center justify-between text-zinc-400 mb-3">
              <span className="text-xs font-medium uppercase tracking-wider">Storage Path</span>
              <HardDrive className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-xs font-mono text-zinc-300 truncate" title={vaultPath}>
              {vaultPath || "Local Filesystem"}
            </div>
            <span className="text-[11px] text-zinc-500 mt-1 block">Zero cloud, zero database</span>
          </div>
        </div>

        {/* Project list cards */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Your Projects</h2>
              <span className="text-[11px] text-zinc-500 font-normal">
                (Drag and drop cards or sidebar items to reorder)
              </span>
            </div>
            {projects.length > 0 && (
              <span className="text-xs text-zinc-500">
                {projects.length} {projects.length === 1 ? "project" : "projects"}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map((proj, idx) => {
              const isDragging = draggedProjectIndex === idx;
              const isOver = dragOverProjectIndex === idx && draggedProjectIndex !== idx;

              return (
                <div
                  key={proj.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggedProjectIndex(idx);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", `${idx}`);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverProjectIndex !== idx) {
                      setDragOverProjectIndex(idx);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverProjectIndex === idx) {
                      setDragOverProjectIndex(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedProjectIndex !== null && draggedProjectIndex !== idx) {
                      reorderProjects(draggedProjectIndex, idx);
                    }
                    setDraggedProjectIndex(null);
                    setDragOverProjectIndex(null);
                  }}
                  onDragEnd={() => {
                    setDraggedProjectIndex(null);
                    setDragOverProjectIndex(null);
                  }}
                  onClick={() => selectProject(proj.id)}
                  className={`group bg-[#141416] border rounded-xl p-5 cursor-pointer transition shadow-sm select-none ${
                    isDragging
                      ? "opacity-30 scale-95 border-dashed border-indigo-500/50"
                      : isOver
                      ? "border-indigo-500 ring-2 ring-indigo-500/40 bg-indigo-500/10 scale-[1.02]"
                      : "border-[#1e1e22] hover:border-indigo-500/40 hover:shadow-indigo-500/5"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-zinc-800/80 group-hover:bg-indigo-600/10 rounded-lg flex items-center justify-center text-zinc-300 group-hover:text-indigo-400 transition shrink-0">
                        <FolderGit2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm text-white group-hover:text-indigo-300 transition">
                          {proj.name}
                        </h3>
                        {proj.description && (
                          <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                            {proj.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        title="Drag card to reorder position"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 rounded hover:bg-zinc-800 text-zinc-600 opacity-40 group-hover:opacity-100 hover:text-zinc-300 cursor-grab active:cursor-grabbing transition"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400 transition" />
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500">
                    <span className="font-mono">
                      {proj.environment_ids.length} Environment{proj.environment_ids.length === 1 ? "" : "s"}
                    </span>
                    <span>Updated recently</span>
                  </div>
                </div>
              );
            })}

            {projects.length === 0 && (
              <div className="col-span-full py-12 px-4 border border-dashed border-zinc-800 rounded-xl text-center">
                <FolderGit2 className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <h3 className="text-sm font-medium text-zinc-300">No projects yet</h3>
                <p className="text-xs text-zinc-500 mt-1 mb-4">
                  Create your first project to start organizing environment secrets.
                </p>
                <button
                  type="button"
                  onClick={onNewProject}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition"
                >
                  Create Project
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export All Environments Modal */}
      <ExportAllEnvsModal
        isOpen={isExportAllOpen}
        onClose={() => setIsExportAllOpen(false)}
      />
    </div>
  );
};
