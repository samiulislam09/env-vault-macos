import React, { useEffect, useState } from "react";
import { useVaultStore } from "./stores/vault-store";
import { VaultSetup } from "./components/VaultSetup";
import { VaultUnlock } from "./components/VaultUnlock";
import { Sidebar } from "./components/Sidebar";
import { DashboardView } from "./components/DashboardView";
import { ProjectDetailView } from "./components/ProjectDetailView";
import { ComparisonView } from "./components/ComparisonView";
import { SettingsView } from "./components/SettingsView";
import { CreateProjectModal } from "./components/CreateProjectModal";
import { CreateEnvironmentModal } from "./components/CreateEnvironmentModal";
import { ImportModal } from "./components/ImportModal";
import { ExportModal } from "./components/ExportModal";
import { CommandPalette } from "./components/CommandPalette";
import { QuickExportModal } from "./components/QuickExportModal";
import { SecurityAuditModal } from "./components/SecurityAuditModal";
import { Loader2 } from "lucide-react";

export const App: React.FC = () => {
  const isInitialized = useVaultStore((s) => s.isInitialized);
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const isLoading = useVaultStore((s) => s.isLoading);
  const activeView = useVaultStore((s) => s.activeView);
  const checkStatus = useVaultStore((s) => s.checkStatus);
  const lockVault = useVaultStore((s) => s.lockVault);

  // Modals state
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isGlobalAuditOpen, setIsGlobalAuditOpen] = useState(false);
  const [isGlobalQuickExportOpen, setIsGlobalQuickExportOpen] = useState(false);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Global shortcuts for Cmd+K and Cmd+L
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        lockVault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lockVault]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0b] text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mb-3" />
        <span className="text-xs">Accessing LocalVault storage...</span>
      </div>
    );
  }

  if (!isInitialized) {
    return <VaultSetup />;
  }

  if (!isUnlocked) {
    return <VaultUnlock />;
  }

  return (
    <div className="flex h-screen bg-[#0a0a0b] text-[#fafafa] overflow-hidden select-none">
      <Sidebar
        onNewProject={() => setIsProjectModalOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0a0a0b]">
        {activeView === "dashboard" && (
          <DashboardView onNewProject={() => setIsProjectModalOpen(true)} />
        )}
        {activeView === "project" && (
          <ProjectDetailView
            onNewEnvironment={() => setIsEnvModalOpen(true)}
            onImport={() => setIsImportModalOpen(true)}
            onExport={() => setIsExportModalOpen(true)}
          />
        )}
        {activeView === "compare" && <ComparisonView />}
        {activeView === "settings" && <SettingsView />}
      </main>

      {/* Global Modals */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onAddVariable={() => {
          useVaultStore.getState().setActiveView("project");
        }}
        onOpenAudit={() => setIsGlobalAuditOpen(true)}
        onOpenQuickExport={() => setIsGlobalQuickExportOpen(true)}
        onOpenNewProject={() => setIsProjectModalOpen(true)}
        onOpenNewEnvironment={() => setIsEnvModalOpen(true)}
      />

      <QuickExportModal
        isOpen={isGlobalQuickExportOpen}
        onClose={() => setIsGlobalQuickExportOpen(false)}
      />

      <SecurityAuditModal
        isOpen={isGlobalAuditOpen}
        onClose={() => setIsGlobalAuditOpen(false)}
      />

      <CreateProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
      />

      <CreateEnvironmentModal
        isOpen={isEnvModalOpen}
        onClose={() => setIsEnvModalOpen(false)}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </div>
  );
};
