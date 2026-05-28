export type FileSystemPermissionMode = 'read' | 'readwrite';

export type FileSystemWritableFileStreamLike = WritableStream & {
  write(data: BlobPart | { type: 'write'; position?: number; data: BlobPart }): Promise<void>;
  close(): Promise<void>;
};

export type FileSystemFileHandleLike = {
  readonly kind?: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
  queryPermission?: (descriptor?: { mode?: FileSystemPermissionMode }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: FileSystemPermissionMode }) => Promise<PermissionState>;
};

export type FileSystemDirectoryHandleLike = {
  readonly kind?: 'directory';
  readonly name: string;
  values(): AsyncIterable<FileSystemHandleLike>;
};

export type FileSystemHandleLike = FileSystemFileHandleLike | FileSystemDirectoryHandleLike;

export type ProjectFileImport = {
  file: File;
  path?: string;
  fileHandle?: FileSystemFileHandleLike;
};

export type FileHandleInfo = {
  name: string;
  lastModified: number;
  size: number;
};

type FilePickerAcceptTypeLike = {
  description?: string;
  accept: Record<string, string[]>;
};

type OpenFilePickerOptionsLike = {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: FilePickerAcceptTypeLike[];
};

type SaveFilePickerOptionsLike = {
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
  types?: FilePickerAcceptTypeLike[];
};

type WindowWithFileSystemAccess = Window & {
  showOpenFilePicker?: (
    options?: OpenFilePickerOptionsLike
  ) => Promise<FileSystemFileHandleLike[]>;
  showSaveFilePicker?: (
    options?: SaveFilePickerOptionsLike
  ) => Promise<FileSystemFileHandleLike>;
};

type DataTransferItemWithFileSystemHandle = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandleLike | null>;
};

type StoredFileHandle = {
  id: string;
  handle: FileSystemFileHandleLike;
  name: string;
  updatedAt: number;
};

const DEFAULT_ACCEPT_TYPES: FilePickerAcceptTypeLike[] = [
  {
    description: 'SQL and project files',
    accept: {
      'text/plain': ['.sql', '.txt', '.md', '.csv', '.yml', '.yaml'],
      'application/json': ['.json'],
    },
  },
];

const FILE_HANDLES_DB_NAME = 'flowscope-file-handles';
const FILE_HANDLES_DB_VERSION = 1;
const FILE_HANDLES_STORE_NAME = 'handles';

function getFileSystemAccessWindow(): WindowWithFileSystemAccess | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window as WindowWithFileSystemAccess;
}

function getIndexedDb(): IDBFactory | null {
  if (typeof indexedDB === 'undefined') {
    return null;
  }
  return indexedDB;
}

function openFileHandlesDb(): Promise<IDBDatabase> {
  const idb = getIndexedDb();
  if (!idb) {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }

  return new Promise((resolve, reject) => {
    const request = idb.open(FILE_HANDLES_DB_NAME, FILE_HANDLES_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_HANDLES_STORE_NAME)) {
        db.createObjectStore(FILE_HANDLES_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open file handles DB.'));
  });
}

async function withFileHandlesStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  const db = await openFileHandlesDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILE_HANDLES_STORE_NAME, mode);
    const store = transaction.objectStore(FILE_HANDLES_STORE_NAME);
    const request = run(store);
    let result: T | undefined;

    if (request) {
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    }

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    };
  });
}

export function isFileSystemAccessSupported(): boolean {
  const fsWindow = getFileSystemAccessWindow();
  return Boolean(fsWindow?.showOpenFilePicker && fsWindow?.showSaveFilePicker);
}

export function isFileHandlePersistenceSupported(): boolean {
  return Boolean(getIndexedDb());
}

export function createFileHandleId(projectId: string, fileId: string): string {
  return `${projectId}:${fileId}`;
}

export async function storeFileSystemHandle(
  handleId: string,
  fileHandle: FileSystemFileHandleLike
): Promise<void> {
  const record: StoredFileHandle = {
    id: handleId,
    handle: fileHandle,
    name: fileHandle.name,
    updatedAt: Date.now(),
  };

  await withFileHandlesStore('readwrite', (store) => store.put(record));
}

export async function loadFileSystemHandle(
  handleId: string
): Promise<FileSystemFileHandleLike | undefined> {
  const record = await withFileHandlesStore<StoredFileHandle>('readonly', (store) =>
    store.get(handleId)
  );
  return record?.handle;
}

export async function deleteFileSystemHandle(handleId: string): Promise<void> {
  await withFileHandlesStore('readwrite', (store) => store.delete(handleId));
}

export async function deleteFileSystemHandles(handleIds: string[]): Promise<void> {
  if (handleIds.length === 0) return;
  await withFileHandlesStore('readwrite', (store) => {
    for (const handleId of handleIds) {
      store.delete(handleId);
    }
  });
}

export async function showOpenFileHandles(
  options: OpenFilePickerOptionsLike = {}
): Promise<FileSystemFileHandleLike[]> {
  const fsWindow = getFileSystemAccessWindow();
  if (!fsWindow?.showOpenFilePicker) {
    throw new Error('File System Access API is not available in this browser.');
  }

  return fsWindow.showOpenFilePicker({
    types: DEFAULT_ACCEPT_TYPES,
    excludeAcceptAllOption: false,
    ...options,
  });
}

export async function showSaveFileHandle(
  suggestedName: string,
  options: SaveFilePickerOptionsLike = {}
): Promise<FileSystemFileHandleLike> {
  const fsWindow = getFileSystemAccessWindow();
  if (!fsWindow?.showSaveFilePicker) {
    throw new Error('File System Access API is not available in this browser.');
  }

  return fsWindow.showSaveFilePicker({
    suggestedName,
    types: DEFAULT_ACCEPT_TYPES,
    excludeAcceptAllOption: false,
    ...options,
  });
}

export async function verifyFileHandlePermission(
  fileHandle: FileSystemFileHandleLike,
  mode: FileSystemPermissionMode,
  requestIfNeeded = true
): Promise<boolean> {
  const descriptor = { mode };

  if (!fileHandle.queryPermission || !fileHandle.requestPermission) {
    return true;
  }

  if ((await fileHandle.queryPermission(descriptor)) === 'granted') {
    return true;
  }

  if (!requestIfNeeded) {
    return false;
  }

  return (await fileHandle.requestPermission(descriptor)) === 'granted';
}

export async function readFileHandle(
  fileHandle: FileSystemFileHandleLike,
  requestPermission = true
): Promise<File> {
  const permitted = await verifyFileHandlePermission(fileHandle, 'read', requestPermission);
  if (!permitted) {
    throw new Error('Permission to read this file was denied.');
  }
  return fileHandle.getFile();
}

export async function getFileHandleInfo(
  fileHandle: FileSystemFileHandleLike,
  options: { requestPermission?: boolean } = {}
): Promise<FileHandleInfo> {
  const file = await readFileHandle(fileHandle, options.requestPermission ?? true);
  return {
    name: file.name,
    lastModified: file.lastModified,
    size: file.size,
  };
}

export async function readTextFileHandle(fileHandle: FileSystemFileHandleLike): Promise<{
  content: string;
  info: FileHandleInfo;
}> {
  const file = await readFileHandle(fileHandle);
  return {
    content: await file.text(),
    info: {
      name: file.name,
      lastModified: file.lastModified,
      size: file.size,
    },
  };
}

export async function writeFileHandle(
  fileHandle: FileSystemFileHandleLike,
  content: string | BlobPart,
  type = 'text/plain;charset=utf-8'
): Promise<void> {
  const permitted = await verifyFileHandlePermission(fileHandle, 'readwrite');
  if (!permitted) {
    throw new Error('Permission to write this file was denied.');
  }

  const writable = await fileHandle.createWritable();
  await writable.write(content instanceof Blob ? content : new Blob([content], { type }));
  await writable.close();
}

export async function importFileHandles(
  fileHandles: FileSystemFileHandleLike[]
): Promise<ProjectFileImport[]> {
  return Promise.all(
    fileHandles.map(async (fileHandle) => ({
      file: await readFileHandle(fileHandle),
      path: fileHandle.name,
      fileHandle,
    }))
  );
}

export function getDroppedFileSystemHandle(
  item: DataTransferItem
): Promise<FileSystemHandleLike | null> | null {
  const itemWithHandle = item as DataTransferItemWithFileSystemHandle;
  return itemWithHandle.getAsFileSystemHandle?.() ?? null;
}

export function downloadTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName || 'query.sql';
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
