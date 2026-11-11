/** Copy picked files into app storage. */
export type ImportFilesRequest = { files: File[] };

/** Read a linked folder in place and bring the library in line with it. */
export type ScanFolderRequest = {
  folder: {
    id: string;
    handle: FileSystemDirectoryHandle;
    /** Each newly found song is added here as soon as it has been read. */
    playlistId: string;
    /**
     * True until a scan of this folder has finished once. Songs an earlier,
     * interrupted scan already read are then added to the playlist too.
     */
    firstScan: boolean;
  };
};

export type ImportRequest = ImportFilesRequest | ScanFolderRequest;

export type ImportProgress =
  | { type: "progress"; done: number; total: number; name: string }
  | {
      type: "finished";
      added: number;
      skipped: number;
      /** Folder scans only: songs dropped because their file is gone. */
      removed: number;
      failed: string[];
      /** The song for each file, in order; null where reading it failed. */
      trackIds: (string | null)[];
      /** Songs added to the library by this run, in order. */
      addedIds: string[];
    };
