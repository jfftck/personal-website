export type FailedUploadCleanupDependencies = {
  runExclusive<T>(operation: () => Promise<T>): Promise<T>;
  hasReference(objectPath: string): Promise<boolean>;
  deleteObject(objectPath: string): Promise<void>;
  logError(error: unknown, objectPath: string): void;
};

export async function rethrowAfterFailedUploadCleanup(
  originalError: unknown,
  objectPath: string,
  dependencies: FailedUploadCleanupDependencies,
): Promise<never> {
  try {
    await dependencies.runExclusive(async () => {
      if (await dependencies.hasReference(objectPath)) return;
      await dependencies.deleteObject(objectPath);
    });
  } catch (cleanupError) {
    try {
      dependencies.logError(cleanupError, objectPath);
    } catch {
      // A logging failure must not replace the catalog creation error.
    }
  }

  throw originalError;
}
