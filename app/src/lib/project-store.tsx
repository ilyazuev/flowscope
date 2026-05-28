import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { FileSource, SchemaMetadata } from '@pondpilot/flowscope-core';
import { STORAGE_KEYS, FILE_EXTENSIONS, SHARE_LIMITS, DEFAULT_FILE_LANGUAGE } from './constants';
import type { SharePayload } from './share';
import { parseTemplateMode } from '@/types';
import type { TemplateMode } from '@/types';
import type { FileSystemFileHandleLike, ProjectFileImport } from './file-system-access';
import {
  createFileHandleId,
  deleteFileSystemHandle,
  deleteFileSystemHandles,
  loadFileSystemHandle,
  storeFileSystemHandle,
} from './file-system-access';
import { DEFAULT_CUSTOMERS_PROJECT, DEFAULT_PROJECT, DEFAULT_DBT_PROJECT } from './default-projects';
import { useBackend } from './backend-context';
import { useBackendFiles } from '@/hooks/useBackendFiles';

const uuidv4 = () => crypto.randomUUID();

export function getContentHash(content: string): string {
  // 32-bit FNV-1a. This is not cryptographic; it is only a cheap dirty-state marker.
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export function isProjectFileDirty(file: Pick<ProjectFile, 'content' | 'savedContentHash'>): boolean {
  return file.savedContentHash !== getContentHash(file.content);
}

const MAX_PROJECT_NAME_LENGTH = 50;

/**
 * Validates and sanitizes a project name.
 * Returns the sanitized name or null if invalid.
 */
function validateProjectName(name: string, existingNames: string[]): string | null {
  const trimmed = name.trim().slice(0, MAX_PROJECT_NAME_LENGTH);

  if (!trimmed) {
    return null;
  }

  // Check for duplicate names (case-insensitive)
  const lowerName = trimmed.toLowerCase();
  if (existingNames.some((existing) => existing.toLowerCase() === lowerName)) {
    return null;
  }

  return trimmed;
}

export type Dialect =
  | 'oracleBackend'
  | 'generic'
  | 'ansi'
  | 'bigquery'
  | 'clickhouse'
  | 'databricks'
  | 'duckdb'
  | 'hive'
  | 'mssql'
  | 'mysql'
  | 'postgres'
  | 'redshift'
  | 'snowflake'
  | 'sqlite';

const BACKEND_PARSED_DIALECTS = new Set([
  'oracleBackend',
]);

export function backendParsed(dialect?: Dialect): boolean {
  return dialect ? BACKEND_PARSED_DIALECTS.has(dialect) : false;
}

/** Human-readable labels for each dialect. */
const DIALECT_LABELS: Record<Dialect, string> = {
  oracleBackend: 'Oracle Backend Parser',
  generic: 'Generic SQL',
  ansi: 'ANSI SQL',
  bigquery: 'BigQuery',
  clickhouse: 'ClickHouse',
  databricks: 'Databricks',
  duckdb: 'DuckDB',
  hive: 'Hive',
  mssql: 'MS SQL Server',
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
  redshift: 'Redshift',
  snowflake: 'Snowflake',
  sqlite: 'SQLite',
};

/** All valid dialect values for runtime validation. */
export const VALID_DIALECTS: readonly Dialect[] = [
  'oracleBackend',
  'generic',
  'ansi',
  'bigquery',
  'clickhouse',
  'databricks',
  'duckdb',
  'hive',
  'mssql',
  'mysql',
  'postgres',
  'redshift',
  'snowflake',
  'sqlite',
] as const;

/**
 * Dialect options for UI dropdowns, derived from VALID_DIALECTS.
 * This ensures the UI options are always in sync with valid dialect values.
 * Note: 'ansi' is excluded from UI since 'generic' serves the same purpose for users.
 */
export const DIALECT_OPTIONS: readonly { value: Dialect; label: string }[] = VALID_DIALECTS.filter(
  (d) => d !== 'ansi' // 'ansi' is valid but not shown in UI (use 'generic' instead)
).map((value) => ({
  value,
  label: DIALECT_LABELS[value],
}));



/**
 * Type guard to check if a value is a valid Dialect.
 */
export function isValidDialect(value: unknown): value is Dialect {
  return typeof value === 'string' && VALID_DIALECTS.includes(value as Dialect);
}

export type RunMode = 'current' | 'all' | 'custom';
// Re-export TemplateMode from shared types for backward compatibility
export type { TemplateMode } from '@/types';

export type SqlParameters = Record<string, string>;

export interface SqlParametersValid {
  valid: boolean;
  parameters: SqlParameters;
}

export interface ProjectFile {
  id: string;
  name: string;
  path: string; // Relative path including filename, e.g., "queries/users/get-all.sql"
  content: string;
  parameters?: SqlParametersValid;
  language: 'sql' | 'json' | 'text';
  /**
   * Non-serializable handle to the real file on disk.
   * Restored from IndexedDB when possible and stripped before localStorage persistence.
   */
  fileHandle?: FileSystemFileHandleLike;
  /** Stable IndexedDB key for restoring fileHandle after reload. */
  fileHandleId?: string;
  /** Content hash at the last successful open/save/refresh. Used for dirty-state checks. */
  savedContentHash?: string;
  /** Last known disk mtime for external-change detection. */
  lastKnownDiskModified?: number;
}

export type ProjectFileInput = File | ProjectFileImport;

function getFileLanguageFromName(fileName: string): ProjectFile['language'] {
  if (fileName.endsWith(FILE_EXTENSIONS.JSON)) return 'json';
  if (fileName.endsWith(FILE_EXTENSIONS.SQL)) return 'sql';
  return 'text';
}

export interface Project {
  id: string;
  name: string;
  files: ProjectFile[];
  activeFileId: string | null;
  dialect: Dialect;
  database?: string;
  userName?: string;
  runMode: RunMode;
  selectedFileIds: string[];
  schemaSQL: string; // User-provided CREATE TABLE statements for schema augmentation
  templateMode: TemplateMode; // Template preprocessing mode (raw, jinja, dbt)
}

interface ProjectContextType {
  projects: Project[];
  activeProjectId: string | null;
  currentProject: Project | null;
  createProject: (name: string) => void;
  deleteProject: (id: string) => void;
  renameProject: (id: string, newName: string) => void;
  selectProject: (id: string) => void;
  setProjectDialect: (projectId: string, dialect: Dialect) => void;
  setRunMode: (projectId: string, mode: RunMode) => void;
  setTemplateMode: (projectId: string, mode: TemplateMode) => void;
  setDatabase: (projectId: string, database: string) => void;
  setUserName: (projectId: string, userName: string) => void;
  toggleFileSelection: (projectId: string, fileId: string) => void;

  // File actions for active project
  createFile: (
    name: string,
    content?: string,
    path?: string,
    fileHandle?: FileSystemFileHandleLike
  ) => string | undefined;
  updateFile: (fileId: string, content: string) => void;
  updateFileParameters: (fileId: string, parameters?: SqlParametersValid) => void;
  deleteFile: (fileId: string) => void;
  renameFile: (fileId: string, newName: string) => void;
  selectFile: (fileId: string) => void;
  setFileHandle: (
    fileId: string,
    fileHandle: FileSystemFileHandleLike | undefined,
    path?: string,
    lastKnownDiskModified?: number
  ) => void;
  markFileSaved: (fileId: string, lastKnownDiskModified?: number) => void;
  replaceFileFromDisk: (fileId: string, content: string, lastKnownDiskModified?: number) => void;
  restoreFileHandle: (fileId: string, handleId: string) => Promise<void>;

  // Schema SQL management
  updateSchemaSQL: (projectId: string, schemaSQL: string) => void;

  // Import/Export
  importFiles: (files: FileList | ProjectFileInput[]) => Promise<void>;

  // Import from shared URL
  importProject: (payload: SharePayload) => string;

  // Backend mode state
  /** True when connected to REST backend (serve mode) */
  isBackendMode: boolean;
  /** True when files are read-only (in backend mode) */
  isReadOnly: boolean;
  /** Schema metadata from backend (database introspection), null if not available */
  backendSchema: SchemaMetadata | null;
  /** Directories being watched by the backend */
  backendWatchDirs: string[];
  /** Refresh files from backend */
  refreshBackendFiles: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

function normalizeProjectFile(file: Partial<ProjectFile>): ProjectFile {
  const name = file.name || file.path?.split('/').pop() || 'untitled.sql';
  const content = file.content || '';

  return {
    id: file.id || uuidv4(),
    name,
    path: file.path || name,
    content,
    parameters: file.parameters,
    language: file.language || getFileLanguageFromName(name),
    fileHandleId: file.fileHandleId,
    savedContentHash: file.savedContentHash || getContentHash(content),
    lastKnownDiskModified: file.lastKnownDiskModified,
  };
}

function normalizeProject(project: Partial<Project>): Project {
  const files = (project.files || []).map(normalizeProjectFile);
  const activeFileId = files.some((file) => file.id === project.activeFileId)
    ? project.activeFileId!
    : files[0]?.id || null;

  return {
    id: project.id || uuidv4(),
    name: project.name || 'Untitled project',
    files,
    activeFileId,
    dialect: project.dialect || 'generic',
    database: project.database,
    userName: project.userName,
    runMode: project.runMode || 'all',
    selectedFileIds: project.selectedFileIds || [],
    schemaSQL: project.schemaSQL || '',
    templateMode: parseTemplateMode(project.templateMode),
  };
}

const loadProjectsFromStorage = (): Project[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.PROJECTS);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((p: Partial<Project>) => normalizeProject(p));
    }
  } catch (error) {
    console.error('Failed to load projects from storage:', error);
  }
  return [DEFAULT_CUSTOMERS_PROJECT, DEFAULT_PROJECT, DEFAULT_DBT_PROJECT].map((p) =>
    normalizeProject(p)
  );
};

const stripRuntimeFileHandles = (projects: Project[]): Project[] =>
  projects.map((project) => ({
    ...project,
    files: project.files.map(({ fileHandle: _fileHandle, ...file }) => file),
  }));

const saveProjectsToStorage = (projects: Project[]) => {
  try {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(stripRuntimeFileHandles(projects)));
  } catch (error) {
    console.error('Failed to save projects to storage:', error);
  }
};

const loadActiveProjectIdFromStorage = (projects: Project[]): string | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
    if (saved && projects.some((p) => p.id === saved)) {
      return saved;
    }
  } catch (error) {
    console.error('Failed to load active project id from storage:', error);
  }
  return projects[0]?.id || null;
};

const saveActiveProjectIdToStorage = (projectId: string | null) => {
  try {
    if (projectId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, projectId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
    }
  } catch (error) {
    console.error('Failed to save active project id to storage:', error);
  }
};

/** Convert backend FileSource to ProjectFile format */
function fileSourceToProjectFile(file: FileSource): ProjectFile {
  return {
    id: file.name, // Use name as ID for backend files (stable identifier)
    name: file.name.split('/').pop() || file.name,
    path: file.name,
    content: file.content,
    language: file.name.endsWith('.sql') ? 'sql' : file.name.endsWith('.json') ? 'json' : 'text',
  };
}

/** Backend project ID constant */
const BACKEND_PROJECT_ID = '__backend__';

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(loadProjectsFromStorage);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    loadActiveProjectIdFromStorage(projects)
  );

  // Get backend state
  const { backendType } = useBackend();
  const isBackendMode = backendType === 'rest';
  const {
    files: backendFiles,
    schema: backendSchema,
    dialect: backendDialect,
    watchDirs: backendWatchDirs,
    templateMode: backendTemplateMode,
    refresh: refreshBackendFiles,
  } = useBackendFiles(isBackendMode);

  // Track backend-specific state separately since it's derived, not persisted.
  const [backendActiveFileId, setBackendActiveFileId] = useState<string | null>(null);
  const [backendRunMode, setBackendRunMode] = useState<RunMode>('all');
  const [backendSelectedFileIds, setBackendSelectedFileIds] = useState<string[]>([]);

  useEffect(() => {
    if (!backendFiles || backendFiles.length === 0) {
      setBackendActiveFileId(null);
      return;
    }

    if (!backendActiveFileId || !backendFiles.some((file) => file.name === backendActiveFileId)) {
      setBackendActiveFileId(backendFiles[0].name);
    }
  }, [backendFiles, backendActiveFileId]);

  // Sync selected file IDs when backend files change (files may be removed)
  useEffect(() => {
    if (!backendFiles) {
      setBackendSelectedFileIds([]);
      setBackendRunMode('all');
      return;
    }

    setBackendSelectedFileIds((prev) => {
      const validIds = prev.filter((id) => backendFiles.some((file) => file.name === id));
      // Only update if something changed
      return validIds.length === prev.length ? prev : validIds;
    });
  }, [backendFiles]);

  // Reset run mode to 'all' when all selected files are removed
  useEffect(() => {
    if (backendSelectedFileIds.length === 0 && backendRunMode === 'custom') {
      setBackendRunMode('all');
    }
  }, [backendSelectedFileIds, backendRunMode]);

  useEffect(() => {
    if (!isBackendMode) {
      setBackendActiveFileId(null);
      setBackendSelectedFileIds([]);
      setBackendRunMode('all');
    }
  }, [isBackendMode]);

  // Create a virtual project from backend files
  const backendProject: Project | null = useMemo(() => {
    if (!isBackendMode || !backendFiles) return null;

    return {
      id: BACKEND_PROJECT_ID,
      name: 'Server Files',
      files: backendFiles.map(fileSourceToProjectFile),
      activeFileId: backendActiveFileId,
      dialect: backendDialect,
      runMode: backendRunMode,
      selectedFileIds: backendSelectedFileIds,
      schemaSQL: '', // Schema comes from backend
      templateMode: backendTemplateMode,
    };
  }, [
    isBackendMode,
    backendFiles,
    backendDialect,
    backendTemplateMode,
    backendActiveFileId,
    backendRunMode,
    backendSelectedFileIds,
  ]);

  useEffect(() => {
    saveProjectsToStorage(projects);
  }, [projects]);

  useEffect(() => {
    saveActiveProjectIdToStorage(activeProjectId);
  }, [activeProjectId]);

  // In backend mode, use the backend project; otherwise use regular projects
  const effectiveProjects =
    isBackendMode && backendProject ? [backendProject, ...projects] : projects;

  // In backend mode, default to backend project
  const effectiveActiveProjectId = isBackendMode ? BACKEND_PROJECT_ID : activeProjectId;

  const restoreFileHandle = useCallback(
    async (fileId: string, fileHandleId: string) => {
      const fileHandle = await loadFileSystemHandle(fileHandleId);
      if (!fileHandle) {
        return;
      }
      setProjects((prevProjects) =>
        prevProjects.map((project) => ({
          ...project,
          files: project.files.map((file) => {
            if (file.id !== fileId) {
              return file;
            }
            if (file.fileHandleId !== fileHandleId) {
              return file;
            }
            if (file.fileHandle) {
              return file;
            }
            return {
              ...file,
              fileHandle,
            };
          }),
        }))
      );
    },
    []
  );

  const restoringHandleIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (isBackendMode) {
      return;
    }

    for (const project of projects) {
      for (const file of project.files) {
        if (!file.fileHandleId || file.fileHandle) {
          continue;
        }

        const restoreKey = `${file.id}:${file.fileHandleId}`;

        if (restoringHandleIdsRef.current.has(restoreKey)) {
          continue;
        }

        restoringHandleIdsRef.current.add(restoreKey);

        void restoreFileHandle(file.id, file.fileHandleId).finally(() => {
          restoringHandleIdsRef.current.delete(restoreKey);
        });
      }
    }
  }, [projects, isBackendMode, restoreFileHandle]);

  const currentProject = effectiveProjects.find((p) => p.id === effectiveActiveProjectId) || null;
  const isReadOnly = isBackendMode && currentProject?.id === BACKEND_PROJECT_ID;

  const createProject = useCallback(
    (name: string) => {
      const existingNames = projects.map((p) => p.name);
      const validatedName = validateProjectName(name, existingNames);

      if (!validatedName) {
        return;
      }

      const newProject: Project = {
        id: uuidv4(),
        name: validatedName,
        files: [],
        activeFileId: null,
        dialect: import.meta.env.VITE_DEFAULT_SQL_DIALECT ?? 'generic',
        runMode: 'all',
        selectedFileIds: [],
        schemaSQL: '',
        templateMode: 'raw',
      };
      setProjects((prev) => [...prev, newProject]);
      setActiveProjectId(newProject.id);
    },
    [projects]
  );

  const deleteProject = useCallback(
    (id: string) => {
      const handleIds = projects
        .find((project) => project.id === id)
        ?.files.map((file) => file.fileHandleId)
        .filter((handleId): handleId is string => Boolean(handleId));

      if (handleIds?.length) {
        void deleteFileSystemHandles(handleIds).catch((error) => {
          console.warn('Failed to delete persisted file handles for project:', error);
        });
      }

      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (activeProjectId === id) {
        setActiveProjectId(null);
      }
    },
    [activeProjectId, projects]
  );

  const renameProject = useCallback(
    (id: string, newName: string) => {
      // Exclude the project being renamed from the duplicate check
      const existingNames = projects.filter((p) => p.id !== id).map((p) => p.name);
      const validatedName = validateProjectName(newName, existingNames);

      if (!validatedName) {
        return;
      }

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          return { ...p, name: validatedName };
        })
      );
    },
    [projects]
  );

  const selectProject = useCallback((id: string) => {
    setActiveProjectId(id);
  }, []);

  const setProjectDialect = useCallback((projectId: string, dialect: Dialect) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, dialect };
      })
    );
  }, []);

  const setRunMode = useCallback((projectId: string, mode: RunMode) => {
    if (projectId === BACKEND_PROJECT_ID) {
      setBackendRunMode(mode);
      return;
    }

    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, runMode: mode };
      })
    );
  }, []);

  const setTemplateMode = useCallback((projectId: string, mode: TemplateMode) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, templateMode: mode };
      })
    );
  }, []);

  const setDatabase = useCallback((projectId: string, database: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, database: database };
      })
    );
  }, []);

  const setUserName = useCallback((projectId: string, userName: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, userName: userName };
      })
    );
  }, []);

  const toggleFileSelection = useCallback((projectId: string, fileId: string) => {
    if (projectId === BACKEND_PROJECT_ID) {
      setBackendSelectedFileIds((prev) => {
        const exists = prev.includes(fileId);
        const updated = exists ? prev.filter((id) => id !== fileId) : [...prev, fileId];
        setBackendRunMode(updated.length > 0 ? 'custom' : 'all');
        return updated;
      });
      return;
    }

    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const currentSelected = p.selectedFileIds || [];
        const newSelected = currentSelected.includes(fileId)
          ? currentSelected.filter((id) => id !== fileId)
          : [...currentSelected, fileId];

        // Automatically switch runMode based on selection:
        // - Selecting files implies the user wants 'custom' mode
        // - Deselecting all files reverts to 'all' mode as a sensible default
        return {
          ...p,
          selectedFileIds: newSelected,
          runMode: newSelected.length > 0 ? 'custom' : 'all',
        };
      })
    );
  }, []);

  const getFileLanguage = getFileLanguageFromName;

  const createFile = useCallback(
    (name: string, content: string = '', path?: string, fileHandle?: FileSystemFileHandleLike) => {
      if (!activeProjectId) return undefined;

      const fileId = uuidv4();
      const fileHandleId = fileHandle ? createFileHandleId(activeProjectId, fileId) : undefined;

      if (fileHandle && fileHandleId) {
        void storeFileSystemHandle(fileHandleId, fileHandle).catch((error) => {
          console.warn('Failed to persist file handle:', error);
        });
      }

      const newFile: ProjectFile = {
        id: fileId,
        name,
        path: path || name, // Default path to filename if not provided
        content,
        language: getFileLanguage(name),
        fileHandle,
        fileHandleId,
        savedContentHash: getContentHash(content),
      };

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            files: [...p.files, newFile],
            activeFileId: newFile.id,
          };
        })
      );

      return newFile.id;
    },
    [activeProjectId]
  );

  const updateFile = useCallback(
    (fileId: string, content: string) => {
      if (!activeProjectId) return;

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            files: p.files.map((f) => (
              f.id === fileId
                ? {
                  ...f,
                  content,
                  parameters: f.parameters ? {
                    parameters: f.parameters.parameters,
                    valid: false
                } : undefined }
                : f)),
          };
        })
      );
    },
    [activeProjectId]
  );

  const updateFileParameters = useCallback(
    (fileId: string, parameters?: SqlParametersValid) => {
      if (!activeProjectId) return;

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            files: p.files.map((f) => (f.id === fileId ? { ...f, parameters } : f)),
          };
        })
      );
    },
    [activeProjectId]
  );

  const deleteFile = useCallback(
    (fileId: string) => {
      if (!activeProjectId) return;

      const handleId = projects
        .find((project) => project.id === activeProjectId)
        ?.files.find((file) => file.id === fileId)?.fileHandleId;

      if (handleId) {
        void deleteFileSystemHandle(handleId).catch((error) => {
          console.warn('Failed to delete persisted file handle:', error);
        });
      }

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p;
          const remainingFiles = p.files.filter((f) => f.id !== fileId);
          return {
            ...p,
            files: remainingFiles,
            activeFileId:
              p.activeFileId === fileId ? remainingFiles[0]?.id || null : p.activeFileId,
            selectedFileIds: (p.selectedFileIds || []).filter((id) => id !== fileId),
          };
        })
      );
    },
    [activeProjectId, projects]
  );

  const renameFile = useCallback(
    (fileId: string, newName: string) => {
      if (!activeProjectId) return;

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            files: p.files.map((f) => {
              if (f.id !== fileId) return f;
              const lastSlashIndex = f.path.lastIndexOf('/');
              const newPath =
                lastSlashIndex === -1
                  ? newName
                  : `${f.path.slice(0, lastSlashIndex + 1)}${newName}`;
              return {
                ...f,
                name: newName,
                path: newPath,
              };
            }),
          };
        })
      );
    },
    [activeProjectId]
  );

  const selectFile = useCallback(
    (fileId: string) => {
      // In backend mode, update the backend-specific active file state
      if (isBackendMode) {
        setBackendActiveFileId(fileId);
        return;
      }

      if (!activeProjectId) return;

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p;
          return { ...p, activeFileId: fileId };
        })
      );
    },
    [activeProjectId, isBackendMode]
  );

  const setFileHandle = useCallback(
    (
      fileId: string,
      fileHandle: FileSystemFileHandleLike | undefined,
      path?: string,
      lastKnownDiskModified?: number
    ) => {
      if (!activeProjectId || isBackendMode) return;

      const nextFileHandleId = fileHandle ? createFileHandleId(activeProjectId, fileId) : undefined;

      if (fileHandle && nextFileHandleId) {
        void storeFileSystemHandle(nextFileHandleId, fileHandle).catch((error) => {
          console.warn('Failed to persist file handle:', error);
        });
      }

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            files: p.files.map((f) => {
              if (f.id !== fileId) return f;
              if (!fileHandle && f.fileHandleId) {
                void deleteFileSystemHandle(f.fileHandleId).catch((error) => {
                  console.warn('Failed to delete persisted file handle:', error);
                });
              }
              const nextPath = path ?? f.path;
              const nextName = nextPath.split('/').pop() || f.name;
              return {
                ...f,
                name: nextName,
                path: nextPath,
                language: getFileLanguage(nextName),
                fileHandle,
                fileHandleId: nextFileHandleId,
                lastKnownDiskModified: lastKnownDiskModified ?? f.lastKnownDiskModified,
                savedContentHash: getContentHash(f.content),
              };
            }),
          };
        })
      );
    },
    [activeProjectId, isBackendMode]
  );

  const markFileSaved = useCallback(
    (fileId: string, lastKnownDiskModified?: number) => {
      if (!activeProjectId || isBackendMode) return;

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            files: p.files.map((f) =>
              f.id === fileId
                ? {
                    ...f,
                    savedContentHash: getContentHash(f.content),
                    lastKnownDiskModified: lastKnownDiskModified ?? f.lastKnownDiskModified,
                  }
                : f
            ),
          };
        })
      );
    },
    [activeProjectId, isBackendMode]
  );

  const replaceFileFromDisk = useCallback(
    (fileId: string, content: string, lastKnownDiskModified?: number) => {
      if (!activeProjectId || isBackendMode) return;

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            files: p.files.map((f) =>
              f.id === fileId
                ? {
                    ...f,
                    content,
                    parameters: f.parameters
                      ? { parameters: f.parameters.parameters, valid: false }
                      : undefined,
                    savedContentHash: getContentHash(content),
                    lastKnownDiskModified: lastKnownDiskModified ?? f.lastKnownDiskModified,
                  }
                : f
            ),
          };
        })
      );
    },
    [activeProjectId, isBackendMode]
  );

  const updateSchemaSQL = useCallback((projectId: string, schemaSQL: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, schemaSQL };
      })
    );
  }, []);

  const importFiles = useCallback(
    async (fileList: FileList | ProjectFileInput[]) => {
      if (!activeProjectId) return;

      const newFiles: ProjectFile[] = [];
      const fileInputs = Array.from(fileList);

      for (const input of fileInputs) {
        const isProjectFileImport = !(input instanceof File) && 'file' in input;
        const file = isProjectFileImport ? input.file : input;
        const content = await file.text();
        // Use an explicit import path first, then webkitRelativePath from folder upload, then filename.
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        const path = isProjectFileImport
          ? input.path || relativePath || file.name
          : relativePath || file.name;
        const fileId = uuidv4();
        const fileHandle = isProjectFileImport ? input.fileHandle : undefined;
        const fileHandleId = fileHandle ? createFileHandleId(activeProjectId, fileId) : undefined;

        newFiles.push({
          id: fileId,
          name: file.name,
          path,
          content,
          language: getFileLanguage(file.name),
          fileHandle,
          fileHandleId,
          savedContentHash: getContentHash(content),
          lastKnownDiskModified: file.lastModified,
        });
      }

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProjectId) return p;

          const updatedFiles = [...p.files];
          let firstImportedFileId: string | null = null;

          for (const newFile of newFiles) {
            const existingIndex = updatedFiles.findIndex(
              (file) => file.path === newFile.path || file.name === newFile.name
            );

            if (existingIndex === -1) {
              if (newFile.fileHandle && newFile.fileHandleId) {
                void storeFileSystemHandle(newFile.fileHandleId, newFile.fileHandle).catch((error) => {
                  console.warn('Failed to persist imported file handle:', error);
                });
              }

              updatedFiles.push(newFile);
              if( !firstImportedFileId ) {
                firstImportedFileId = newFile.id;
              }
            } else {
              const existingFile = updatedFiles[existingIndex];
              const nextFileHandleId = newFile.fileHandle
                ? createFileHandleId(activeProjectId, existingFile.id)
                : existingFile.fileHandleId;

              if (newFile.fileHandle && nextFileHandleId) {
                void storeFileSystemHandle(nextFileHandleId, newFile.fileHandle).catch((error) => {
                  console.warn('Failed to persist replacement file handle:', error);
                });
              }

              updatedFiles[existingIndex] = {
                ...existingFile,
                name: newFile.name,
                path: newFile.path,
                content: newFile.content,
                language: newFile.language,
                fileHandle: newFile.fileHandle ?? existingFile.fileHandle,
                fileHandleId: nextFileHandleId,
                lastKnownDiskModified: newFile.fileHandle ? newFile.lastKnownDiskModified : existingFile.lastKnownDiskModified,
                savedContentHash: getContentHash(newFile.content),
                parameters: existingFile.parameters
                  ? {
                    parameters: existingFile.parameters.parameters,
                    valid: false,
                  }
                  : undefined,
              };
              if( !firstImportedFileId ) {
                firstImportedFileId = existingFile.id;
              }
            }
          }

          return {
            ...p,
            files: updatedFiles,
            activeFileId: firstImportedFileId || p.activeFileId,
          };
        })
      );
    },
    [activeProjectId]
  );

  const importProject = useCallback(
    (payload: SharePayload): string => {
      // Generate unique name if collision (with safety limit)
      const existingNames = projects.map((p) => p.name.toLowerCase());
      let name = payload.n;
      let counter = 1;
      while (
        existingNames.includes(name.toLowerCase()) &&
        counter <= SHARE_LIMITS.MAX_NAME_COLLISION_ATTEMPTS
      ) {
        name = `${payload.n} (${counter++})`;
      }
      // Fallback if we hit the limit
      if (existingNames.includes(name.toLowerCase())) {
        name = `${payload.n} (${Date.now()})`;
      }

      // Create files with new IDs
      const newFiles: ProjectFile[] = payload.f.map((f) => ({
        id: uuidv4(),
        name: f.n,
        path: f.p || f.n, // Use path if available, otherwise default to filename
        content: f.c,
        language: f.l || DEFAULT_FILE_LANGUAGE,
        savedContentHash: getContentHash(f.c),
      }));

      // Map selected file indices to new IDs
      const selectedFileIds = (payload.sel || [])
        .filter((i) => i >= 0 && i < newFiles.length)
        .map((i) => newFiles[i].id);

      const newProject: Project = {
        id: uuidv4(),
        name,
        files: newFiles,
        activeFileId: newFiles[0]?.id || null,
        dialect: payload.d,
        runMode: payload.r,
        selectedFileIds,
        schemaSQL: payload.s,
        templateMode: parseTemplateMode(payload.t),
      };

      setProjects((prev) => [...prev, newProject]);
      setActiveProjectId(newProject.id);

      return name;
    },
    [projects]
  );

  const value = {
    projects: effectiveProjects,
    activeProjectId: effectiveActiveProjectId,
    currentProject,
    createProject,
    deleteProject,
    renameProject,
    selectProject,
    setProjectDialect,
    setRunMode,
    setTemplateMode,
    setDatabase,
    setUserName,
    toggleFileSelection,
    createFile,
    updateFile,
    updateFileParameters,
    deleteFile,
    renameFile,
    selectFile,
    setFileHandle,
    markFileSaved,
    replaceFileFromDisk,
    restoreFileHandle,
    updateSchemaSQL,
    importFiles,
    importProject,
    // Backend mode state
    isBackendMode,
    isReadOnly,
    backendSchema,
    backendWatchDirs,
    refreshBackendFiles,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
