import "server-only";

type Release = () => void;

const queues = new Map<string, Promise<void>>();

export async function withFileLock<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: Release;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  const queued = previous.then(() => current);
  queues.set(key, queued);

  await previous;
  try {
    return await task();
  } finally {
    release();
    if (queues.get(key) === queued) {
      queues.delete(key);
    }
  }
}
