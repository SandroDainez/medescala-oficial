function isChunkLoadErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to fetch dynamically imported module") ||
    normalized.includes("importing a module script failed") ||
    normalized.includes("chunkloaderror") ||
    normalized.includes("loading chunk")
  );
}

export function isChunkLoadError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "");
  return isChunkLoadErrorMessage(message);
}

export async function recoverFromChunkError() {
  const { clearPwaCacheAndReload } = await import("@/lib/pwa");
  await clearPwaCacheAndReload();
}

export async function importWithChunkRecovery<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    const alreadyRetried = sessionStorage.getItem("medescala_chunk_retry_done") === "1";
    if (isChunkLoadError(error) && !alreadyRetried) {
      sessionStorage.setItem("medescala_chunk_retry_done", "1");
      await recoverFromChunkError();
    }
    throw error;
  }
}
