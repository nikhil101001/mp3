// Copies a picked file into the app's private storage (OPFS).
// Runs in a worker because Safari only allows synchronous OPFS writes there.

type ImportRequest = { id: number; file: File; name: string };

type SyncAccessHandle = {
  truncate(size: number): void;
  write(data: Uint8Array, options: { at: number }): number;
  flush(): void;
  close(): void;
};

type SyncCapableFileHandle = {
  createSyncAccessHandle(): Promise<SyncAccessHandle>;
};

const reply = (message: unknown) =>
  (self as unknown as { postMessage(m: unknown): void }).postMessage(message);

self.onmessage = async (event: MessageEvent<ImportRequest>) => {
  const { id, file, name } = event.data;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("imports", { create: true });
    const handle = await dir.getFileHandle(name, { create: true });
    const access = await (
      handle as unknown as SyncCapableFileHandle
    ).createSyncAccessHandle();
    try {
      access.truncate(0);
      const reader = file.stream().getReader();
      let offset = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        access.write(value, { at: offset });
        offset += value.byteLength;
      }
      access.flush();
    } finally {
      access.close();
    }
    reply({ id, ok: true });
  } catch (error) {
    reply({ id, ok: false, error: String(error) });
  }
};
