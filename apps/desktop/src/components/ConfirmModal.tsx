import React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  variant = "danger",
  isLoading = false,
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  const isDanger = variant === "danger";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div
        className="bg-[#141416] border border-[#27272a] rounded-xl w-full max-w-md p-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5 mb-4">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isDanger
                ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                : "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30"
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">{title}</h2>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1e1e22]">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/60 rounded-lg transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition shadow-sm ${
              isDanger
                ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20 disabled:bg-rose-800"
                : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20 disabled:bg-indigo-800"
            }`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isLoading ? "Deleting..." : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
