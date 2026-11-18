import React, { useState, useEffect } from "react";
import { useVaultStore } from "../stores/vault-store";
import {
  Search,
  FolderGit2,
  Layers,
  Plus,
  ClipboardPaste,
  ShieldAlert,
  ArrowRightLeft,
  Lock,
  Download,
  Share2,
  Terminal,
} from "lucide-react";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onAddVariable: (mode: "single" | "bulk") => void;
  onOpenAudit: () => void;
  onOpenQuickExport: () => void;
  onOpenNewProject: () => void;
  onOpenNewEnvironment: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onAddVariable,
  onOpenAudit,
  onOpenQuickExport,
  onOpenNewProject,
  onOpenNewEnvironment,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const projects = useVaultStore((s) => s.projects);
  const environments = useVaultStore((s) => s.environments);
  const activeProjectId = useVaultStore((s) => s.activeProjectId);
  const selectProject = useVaultStore((s) => s.selectProject);
  const selectEnvironment = useVaultStore((s) => s.selectEnvironment);
  const lockVault = useVaultStore((s) => s.lockVault);
  const setActiveView = useVaultStore((s) => s.setActiveView);

  // Keyboard shortcut listener for Cmd+K and Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      } else if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Build searchable items
  interface PaletteItem {
    id: string;
    title: string;
    subtitle?: string;
    category: "Projects" | "Environments" | "Actions";
    icon: React.ReactNode;
    action: () => void;
  }

  const items: PaletteItem[] = [];

  // Actions
  items.push({
    id: "action-add-single",
    title: "Add Single Variable",
    subtitle: "Insert one key/value pair into active environment",
    category: "Actions",
    icon: <Plus className="w-4 h-4 text-indigo-400" />,
    action: () => {
      onAddVariable("single");
      onClose();
    },
  });

  items.push({
    id: "action-paste-bulk",
    title: "Paste Full .env (Bulk)",
    subtitle: "Paste multiple lines of KEY=VALUE at once",
    category: "Actions",
    icon: <ClipboardPaste className="w-4 h-4 text-emerald-400" />,
    action: () => {
      onAddVariable("bulk");
      onClose();
    },
  });

  items.push({
    id: "action-quick-export",
    title: "Quick Copy / Export Formats",
    subtitle: "Copy as Docker -e, Shell export, JSON, or .env",
    category: "Actions",
    icon: <Share2 className="w-4 h-4 text-cyan-400" />,
    action: () => {
      onOpenQuickExport();
      onClose();
    },
  });

  items.push({
    id: "action-audit",
    title: "Security Health & Leak Audit",
    subtitle: "Audit active environment for weak secrets & leak risks",
    category: "Actions",
    icon: <ShieldAlert className="w-4 h-4 text-amber-400" />,
    action: () => {
      onOpenAudit();
      onClose();
    },
  });

  items.push({
    id: "action-compare",
    title: "Compare Environments",
    subtitle: "Diff variables between two environments side-by-side",
    category: "Actions",
    icon: <ArrowRightLeft className="w-4 h-4 text-violet-400" />,
    action: () => {
      setActiveView("compare");
      onClose();
    },
  });

  items.push({
    id: "action-new-project",
    title: "Create New Project",
    subtitle: "Start a new project with default environment",
    category: "Actions",
    icon: <FolderGit2 className="w-4 h-4 text-indigo-400" />,
    action: () => {
      onOpenNewProject();
      onClose();
    },
  });

  items.push({
    id: "action-new-env",
    title: "Add Environment",
    subtitle: "Create staging, production, or custom env",
    category: "Actions",
    icon: <Layers className="w-4 h-4 text-emerald-400" />,
    action: () => {
      onOpenNewEnvironment();
      onClose();
    },
  });

  items.push({
    id: "action-lock",
    title: "Lock Vault",
    subtitle: "Securely lock LocalVault immediately (Cmd+L)",
    category: "Actions",
    icon: <Lock className="w-4 h-4 text-rose-400" />,
    action: async () => {
      await lockVault();
      onClose();
    },
  });

  // Projects
  for (const p of projects) {
    items.push({
      id: `proj-${p.id}`,
      title: `Project: ${p.name}`,
      subtitle: p.description || "Switch to this project",
      category: "Projects",
      icon: <FolderGit2 className="w-4 h-4 text-zinc-400" />,
      action: async () => {
        await selectProject(p.id);
        setActiveView("project");
        onClose();
      },
    });
  }

  // Environments
  for (const env of environments) {
    items.push({
      id: `env-${env.id}`,
      title: `Environment: ${env.name}`,
      subtitle: env.is_production ? "Production Environment" : "Standard Environment",
      category: "Environments",
      icon: <Layers className="w-4 h-4 text-zinc-400" />,
      action: async () => {
        await selectEnvironment(env.id);
        setActiveView("project");
        onClose();
      },
    });
  }

  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase()))
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
    } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
      e.preventDefault();
      filteredItems[selectedIndex].action();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-24 p-4 z-50 animate-in fade-in duration-100">
      <div className="bg-[#141416] border border-[#27272a] rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[480px]">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#27272a] bg-[#0d0d0f]">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or jump to project / environment..."
            className="w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none font-sans"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 rounded font-mono shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-2 divide-y divide-[#1e1e22]">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition text-xs ${
                    isSelected
                      ? "bg-indigo-600/15 border border-indigo-500/30 text-white"
                      : "text-zinc-300 hover:bg-zinc-800/40"
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="shrink-0">{item.icon}</div>
                    <div className="truncate">
                      <div className="font-medium text-white truncate">{item.title}</div>
                      {item.subtitle && (
                        <div className="text-[11px] text-zinc-400 truncate">{item.subtitle}</div>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-zinc-800/80 text-zinc-400 rounded shrink-0">
                    {item.category}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-xs text-zinc-500">
              No matching commands or projects found.
            </div>
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="px-4 py-2 bg-[#0a0a0b] border-t border-[#1e1e22] flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
          </div>
          <span>LocalVault Command Hub</span>
        </div>
      </div>
    </div>
  );
};
