import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
  type ChangeEvent,
  type JSX,
} from 'react';
import {
  AlertTriangle,
  FilePlus2,
  FolderOpen,
  HardDrive,
  Link2Off,
  Loader2,
  RefreshCw,
  Save,
  SaveAll,
} from 'lucide-react';
import { toast } from 'sonner';

import { DEFAULT_FILE_NAMES, ACCEPTED_FILE_TYPES } from '@/lib/constants';
import { isProjectFileDirty, useProject } from '@/lib/project-store';
import {
  downloadTextFile,
  getFileHandleInfo,
  importFileHandles,
  isFileHandlePersistenceSupported,
  isFileSystemAccessSupported,
  readTextFileHandle,
  showOpenFileHandles,
  showSaveFileHandle,
  writeFileHandle,
} from '@/lib/file-system-access';
import { ToolbarButton } from '@pondpilot/flowscope-react';

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type FileCommand = 'new' | 'open' | 'save' | 'saveAs' | 'refresh' | 'check';
type DiskState = 'unsupported' | 'not-linked' | 'checking' | 'clean' | 'changed' | 'permission' | 'error';

function hasExternalChange(
  lastKnownDiskModified: number | undefined,
  currentDiskModified: number | undefined
): boolean {
  return Boolean(
    lastKnownDiskModified && currentDiskModified && lastKnownDiskModified !== currentDiskModified
  );
}

export type FileControlsToolbarRef = {
  save: () => void;
  saveAs: () => void;
};

export const FileControlsToolbar = forwardRef<FileControlsToolbarRef>(
  function FileControlsToolbar(_props, ref) {
  const {
    currentProject,
    createFile,
    importFiles,
    setFileHandle,
    markFileSaved,
    replaceFileFromDisk,
    isReadOnly,
  } = useProject();
  const [busyCommand, setBusyCommand] = useState<FileCommand | null>(null);
  const [diskState, setDiskState] = useState<DiskState>('not-linked');
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const activeFile = currentProject?.files.find((file) => file.id === currentProject.activeFileId);
  const fileSystemAccessSupported = useMemo(() => isFileSystemAccessSupported(), []);
  const fileHandlePersistenceSupported = useMemo(() => isFileHandlePersistenceSupported(), []);
  const disabled = isReadOnly || busyCommand !== null;
  const hasLinkedHandle = Boolean(activeFile?.fileHandle);
  const isDirty = activeFile ? isProjectFileDirty(activeFile) : false;
  const diskNameMismatch = Boolean(
    activeFile?.fileHandle && activeFile.fileHandle.name !== activeFile.name
  );

  const runCommand = useCallback(async (command: FileCommand, action: () => Promise<void>) => {
    setBusyCommand(command);
    try {
      await action();
    } catch (error) {
      if (!isAbortError(error)) {
        console.error(`File command failed: ${command}`, error);
        toast.error('File operation failed', { description: getErrorMessage(error) });
      }
    } finally {
      setBusyCommand(null);
    }
  }, []);

  const checkDiskState = useCallback(async () => {
    if (!fileSystemAccessSupported) {
      setDiskState('unsupported');
      return;
    }
    if (!activeFile?.fileHandle) {
      setDiskState('not-linked');
      return;
    }

    setDiskState('checking');
    try {
      const info = await getFileHandleInfo(activeFile.fileHandle, { requestPermission: false });
      setDiskState(hasExternalChange(activeFile.lastKnownDiskModified, info.lastModified) ? 'changed' : 'clean');
    } catch (error) {
      console.warn('Failed to check file handle state:', error);
      setDiskState(getErrorMessage(error).toLowerCase().includes('permission') ? 'permission' : 'error');
    }
  }, [activeFile?.fileHandle, activeFile?.lastKnownDiskModified, fileSystemAccessSupported]);

  useEffect(() => {
    void checkDiskState();
  }, [checkDiskState]);

  useEffect(() => {
    const handleWindowFocus = () => {
      void checkDiskState();
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [checkDiskState]);

  const handleNew = useCallback(() => {
    if (isReadOnly) return;
    createFile(DEFAULT_FILE_NAMES.NEW_QUERY);
    toast.success('New file created');
  }, [createFile, isReadOnly]);

  const handleOpen = useCallback(() => {
    if (disabled) return;

    void runCommand('open', async () => {
      if (!fileSystemAccessSupported) {
        fallbackInputRef.current?.click();
        return;
      }

      const handles = await showOpenFileHandles({ multiple: true });
      const files = await importFileHandles(handles);
      await importFiles(files);
      toast.success(`Opened ${files.length} file${files.length === 1 ? '' : 's'}`);
    });
  }, [disabled, fileSystemAccessSupported, importFiles, runCommand]);

  const handleFallbackOpen = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const { files } = event.target;
      if (files && files.length > 0) {
        void runCommand('open', async () => {
          await importFiles(files);
          toast.success(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}`);
        });
      }
      event.target.value = '';
    },
    [importFiles, runCommand]
  );

  const handleSaveAs = useCallback(async () => {
    if (!activeFile || isReadOnly) return;

    if (!fileSystemAccessSupported) {
      downloadTextFile(activeFile.name, activeFile.content);
      markFileSaved(activeFile.id);
      toast.success('File downloaded');
      return;
    }

    const handle = await showSaveFileHandle(activeFile.name);
    await writeFileHandle(handle, activeFile.content);
    const info = await getFileHandleInfo(handle);
    setFileHandle(activeFile.id, handle, handle.name, info.lastModified);
    markFileSaved(activeFile.id, info.lastModified);
    setDiskState('clean');
    toast.success('File saved');
  }, [
    activeFile,
    fileSystemAccessSupported,
    isReadOnly,
    markFileSaved,
    setFileHandle,
  ]);

  const handleSave = useCallback(() => {
    if (!activeFile || disabled) return;

    void runCommand('save', async () => {
      if (!fileSystemAccessSupported) {
        downloadTextFile(activeFile.name, activeFile.content);
        markFileSaved(activeFile.id);
        toast.success('File downloaded');
        return;
      }

      if (!activeFile.fileHandle) {
        await handleSaveAs();
        return;
      }

      const infoBeforeSave = await getFileHandleInfo(activeFile.fileHandle);
      const changedOnDisk = hasExternalChange(
        activeFile.lastKnownDiskModified,
        infoBeforeSave.lastModified
      );

      if (changedOnDisk) {
        const confirmed = window.confirm(
          isDirty
            ? 'This file has unsaved editor changes and was also changed on disk. Save will overwrite the disk version. Continue?'
            : 'This file was changed on disk since it was opened. Save will overwrite those disk changes. Continue?'
        );
        if (!confirmed) {
          setDiskState('changed');
          return;
        }
      }

      await writeFileHandle(activeFile.fileHandle, activeFile.content);
      const infoAfterSave = await getFileHandleInfo(activeFile.fileHandle);
      markFileSaved(activeFile.id, infoAfterSave.lastModified);
      setDiskState('clean');
      toast.success('File saved');
    });
  }, [
    activeFile,
    disabled,
    fileSystemAccessSupported,
    handleSaveAs,
    isDirty,
    markFileSaved,
    runCommand,
  ]);

  const handleSaveAsClick = useCallback(() => {
    if (!activeFile || disabled) return;
    void runCommand('saveAs', handleSaveAs);
  }, [activeFile, disabled, handleSaveAs, runCommand]);

  const handleRefresh = useCallback(() => {
    if (!activeFile?.fileHandle || disabled) return;

    if (isDirty) {
      const confirmed = window.confirm(
        'Reload this file from disk? Current unsaved editor changes will be replaced.'
      );
      if (!confirmed) return;
    }

    void runCommand('refresh', async () => {
      const { content, info } = await readTextFileHandle(activeFile.fileHandle!);
      replaceFileFromDisk(activeFile.id, content, info.lastModified);
      setDiskState('clean');
      toast.success('File reloaded from disk');
    });
  }, [activeFile, disabled, isDirty, replaceFileFromDisk, runCommand]);

  const renderIcon = (command: FileCommand, icon: JSX.Element) =>
    busyCommand === command ? <Loader2 className="h-4 w-4 animate-spin" /> : icon;

  const saveTitle = useMemo(() => {
    if (!fileSystemAccessSupported) return 'Download file';
    if (!activeFile?.fileHandle) return 'Save file as... (not linked to file system)';
    if (diskNameMismatch) {
      return `Save to linked disk file "${activeFile?.fileHandle?.name ?? activeFile?.name ?? 'linked file'}". Project rename does not rename files on disk; use Save As for a new disk file.`;
    }
    if (diskState === 'changed') return 'Save file; disk copy changed since last open/save';
    return isDirty ? 'Save file' : 'File has no unsaved editor changes';
  }, [activeFile?.fileHandle, diskNameMismatch, diskState, fileSystemAccessSupported, isDirty]);

  const status = useMemo(() => {
    if (!activeFile) return null;
    if (!fileSystemAccessSupported) {
      return {
        icon: <Link2Off className="h-3.5 w-3.5" />,
        label: 'download mode',
        title: 'File System Access API is unavailable. New, upload-open, and download-save are available.',
      };
    }
    if (!hasLinkedHandle) {
      return {
        icon: <Link2Off className="h-3.5 w-3.5" />,
        label: isDirty ? 'unsaved' : 'not linked',
        title: 'This project file is not linked to a disk file yet. Save As will create the link.',
      };
    }
    if (diskState === 'checking') {
      return {
        icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
        label: 'checking',
        title: 'Checking linked disk file state.',
      };
    }
    if (diskState === 'changed') {
      return {
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        label: 'disk changed',
        title: 'The linked disk file changed outside the editor. Refresh to reload it, or Save to overwrite it.',
      };
    }
    if (diskState === 'permission') {
      return {
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        label: 'permission needed',
        title: 'Browser permission is required to access this linked disk file.',
      };
    }
    if (diskState === 'error') {
      return {
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        label: 'link error',
        title: 'The linked disk file could not be checked. Re-open or Save As to relink it.',
      };
    }
    if (diskNameMismatch) {
      return {
        icon: <HardDrive className="h-3.5 w-3.5" />,
        label: 'renamed in project',
        title: `Linked disk file is still "${activeFile.fileHandle?.name}". Project rename does not rename files on disk.`,
      };
    }
    return {
      icon: <HardDrive className="h-3.5 w-3.5" />,
      label: isDirty ? 'modified' : 'linked',
      title: fileHandlePersistenceSupported
        ? 'Linked to a disk file. The handle is persisted in IndexedDB and restored after reload when possible.'
        : 'Linked to a disk file for this session only; IndexedDB is unavailable, so the link cannot be restored after reload.',
    };
  }, [
    activeFile,
    diskNameMismatch,
    diskState,
    fileHandlePersistenceSupported,
    fileSystemAccessSupported,
    hasLinkedHandle,
    isDirty,
  ]);

    useImperativeHandle(
      ref,
      () => ({
        save: handleSave,
        saveAs: handleSaveAsClick,
      }),
      [handleSave, handleSaveAsClick]
    );

  return (
    <div className="flex shrink-0 items-center gap-1" aria-label="File controls">
      <input
        ref={fallbackInputRef}
        type="file"
        className="hidden"
        accept={ACCEPTED_FILE_TYPES}
        multiple
        onChange={handleFallbackOpen}
      />

      <ToolbarButton
        title="New file"
        aria-label="New file"
        disabled={disabled}
        onClick={handleNew}
      >
        <FilePlus2 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        title={fileSystemAccessSupported ? 'Open file from disk' : 'Open file by upload'}
        aria-label={fileSystemAccessSupported ? 'Open file from disk' : 'Open file by upload'}
        disabled={disabled}
        onClick={handleOpen}
      >
        {renderIcon('open', <FolderOpen className="h-4 w-4" />)}
      </ToolbarButton>

      <ToolbarButton
        title={saveTitle}
        aria-label={fileSystemAccessSupported ? 'Save file' : 'Download file'}
        disabled={disabled || !activeFile}
        onClick={handleSave}
      >
        {renderIcon('save', <Save className="h-4 w-4" />)}
      </ToolbarButton>

      <ToolbarButton
        title={
          fileSystemAccessSupported
            ? 'Save file as...'
            : 'Save As requires File System Access API; use Save to download instead'
        }
        aria-label="Save file as"
        disabled={disabled || !activeFile || !fileSystemAccessSupported}
        onClick={handleSaveAsClick}
      >
        {renderIcon('saveAs', <SaveAll className="h-4 w-4" />)}
      </ToolbarButton>

      <ToolbarButton
        title={
          activeFile?.fileHandle
            ? 'Reload file from disk'
            : 'Reload from disk is available only for files opened or saved with File System Access API'
        }
        aria-label="Reload file from disk"
        disabled={disabled || !activeFile?.fileHandle || !fileSystemAccessSupported}
        onClick={handleRefresh}
      >
        {renderIcon('refresh', <RefreshCw className="h-4 w-4" />)}
      </ToolbarButton>

      {status && (
        <button
          type="button"
          className="ml-1 inline-flex max-w-[10rem] items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
          title={status.title}
          onClick={() => void checkDiskState()}
        >
          {status.icon}
          <span className="truncate">{status.label}</span>
        </button>
      )}
    </div>
  );
});