/**
 * Utility for secure clipboard operations.
 * Auto-clears the clipboard after a timeout (default 30s) if the secret is still present,
 * preventing credentials from persisting in the system clipboard history indefinitely.
 */
export async function secureCopy(text: string, clearAfterSeconds = 30): Promise<void> {
  await navigator.clipboard.writeText(text);

  if (clearAfterSeconds > 0) {
    setTimeout(async () => {
      try {
        // Only clear if the clipboard still contains the copied secret
        const currentText = await navigator.clipboard.readText();
        if (currentText === text) {
          await navigator.clipboard.writeText("");
        }
      } catch {
        // Some browsers or security contexts restrict clipboard.readText();
        // Fallback: overwrite with blank anyway if possible or ignore permission denial
      }
    }, clearAfterSeconds * 1000);
  }
}
