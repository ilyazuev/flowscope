import type { WindowManagerApi } from './floating-window';
import { DataLoadProvider } from '@pondpilot/flowscope-app/src/components/DataLoadContext';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@pondpilot/flowscope-app/src/components/ui/resizable';
import {
  CredentialsPayload,
  ObjectType,
  objectTypes,
  DBObjectsPayload,
  DBObject,
} from '@pondpilot/flowscope-app/src/lib/backend-adapter';
import { Checkbox } from '@pondpilot/flowscope-app/src/components/ui/checkbox';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  devLineageLoadOwners,
  devLineageLoadDBObjects,
} from '@pondpilot/flowscope-app/src/lib/utils_backend';
import { ChevronDown, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { cn } from '@pondpilot/flowscope-app/src/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@pondpilot/flowscope-app/src/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@pondpilot/flowscope-app/src/components/ui/dropdown-menu';

interface FilterDBObjectsTextHistory {
  pattern: string;
  regExp: boolean;
}

function useSchemaExplorerInner() {
  const [loadOwners, setLoadOwners] = useState(false);
  const [owners, setOwners] = useState<string[] | null>(null);
  const [filterObjectTypes, setFilterObjectTypes] = useState<ObjectType[]>(['TABLE']);
  const [filterOwners, setFilterOwners] = useState<string[]>([]);
  const [refreshOwnersRequest, setRefreshOwnersRequest] = useState(0);

  const [loadDBObjects, setLoadDBObjects] = useState(false);
  const [dbObjects, setDbObjects] = useState<DBObject[] | null>(null);
  const [refreshDbObjectsRequest, setRefreshDbObjectsRequest] = useState(0);
  const [filterDBObjectsText, setFilterDBObjectsText] = useState<string>('');
  const [filterDBObjectsRegexp, setFilterDBObjectsRegexp] = useState(false);
  const [filterDBObjectsTextHistory, setFilterDBObjectsTextHistory] = useState<
    FilterDBObjectsTextHistory[]
  >([]);
  const [openFilterDBObjectsTextHistory, setOpenFilterDBObjectsTextHistory] = useState(false);

  return {
    loadOwners,
    setLoadOwners,
    owners,
    setOwners,
    filterObjectTypes,
    setFilterObjectTypes,
    filterOwners,
    setFilterOwners,
    refreshOwnersRequest,
    setRefreshOwnersRequest,
    loadDBObjects,
    setLoadDBObjects,
    dbObjects,
    setDbObjects,
    refreshDbObjectsRequest,
    setRefreshDbObjectsRequest,
    filterDBObjectsText,
    setFilterDBObjectsText,
    filterDBObjectsRegexp,
    setFilterDBObjectsRegexp,
    filterDBObjectsTextHistory,
    setFilterDBObjectsTextHistory,
    openFilterDBObjectsTextHistory,
    setOpenFilterDBObjectsTextHistory,
  };
}

const SchemaExplorerContext = createContext<ReturnType<typeof useSchemaExplorerInner> | null>(null);

export function SchemaExplorerProvider({ children }: { children: React.ReactNode }) {
  const value = useSchemaExplorerInner();
  return <SchemaExplorerContext.Provider value={value}>{children}</SchemaExplorerContext.Provider>;
}

function useSchemaExplorer() {
  const ctx = useContext(SchemaExplorerContext);
  if (!ctx) {
    throw new Error('useSchemaExplorer must be used inside SchemaExplorerProvider');
  }
  return ctx;
}

function FloatingSchemaExplorer({
  database,
  userName,
  _isDark,
}: {
  database: string;
  userName: string;
  _isDark: boolean;
}) {
  const {
    loadOwners,
    setLoadOwners,
    owners,
    setOwners,
    filterObjectTypes,
    setFilterObjectTypes,
    filterOwners,
    setFilterOwners,
    refreshOwnersRequest,
    setRefreshOwnersRequest,
    loadDBObjects,
    setLoadDBObjects,
    dbObjects,
    setDbObjects,
    refreshDbObjectsRequest,
    setRefreshDbObjectsRequest,
    filterDBObjectsText,
    setFilterDBObjectsText,
    filterDBObjectsRegexp,
    setFilterDBObjectsRegexp,
    filterDBObjectsTextHistory,
    setFilterDBObjectsTextHistory,
    openFilterDBObjectsTextHistory,
    setOpenFilterDBObjectsTextHistory,
  } = useSchemaExplorer();
  const [ownersError, setOwnersError] = useState<string | null>(null);
  const [dbObjectsError, setDbObjectsError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleRefreshDBObjects = useCallback(() => {
    setRefreshDbObjectsRequest((key) => key + 1);
    setDbObjects(null);
  }, [setRefreshDbObjectsRequest, setDbObjects]);

  const handleRefreshOwners = useCallback(() => {
    setRefreshOwnersRequest((key) => key + 1);
    setOwners(null);
  }, [setRefreshOwnersRequest, setOwners]);

  useEffect(() => {
    setFilterOwners((prevState) => (prevState.length === 0 ? [userName] : prevState));
  }, [userName, setFilterOwners]);

  useEffect(() => {
    void (async () => {
      const credentialsPayload: CredentialsPayload = {
        database,
        userName,
      };
      setOwnersError(null);
      try {
        if (!owners || owners.length === 0) {
          setLoadOwners(true);
          setLoadDBObjects(true);
          setDbObjects(null);
          const ownersPayloadResponse = await devLineageLoadOwners(credentialsPayload);
          setOwners(ownersPayloadResponse.owners);
          handleRefreshDBObjects();
        }
        setTimeout(() => {
          const selectedItem = rootRef.current?.querySelector(
            '[data-key=FloatingSchemaExplorer-owners] [data-state=checked]'
          );
          selectedItem?.scrollIntoView({
            block: 'center',
            behavior: 'smooth',
          });
        }, 200);
      } catch (e) {
        setLoadDBObjects(false);
        setOwnersError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadOwners(false);
      }
    })();
  }, [
    database,
    userName,
    owners,
    refreshOwnersRequest,
    setLoadOwners,
    setLoadDBObjects,
    setDbObjects,
    setOwners,
    handleRefreshDBObjects,
  ]);

  const handleFilterObjectTypes = useCallback(
    (checked: boolean, objectType: ObjectType) => {
      setFilterObjectTypes((prevState) =>
        checked
          ? prevState.includes(objectType)
            ? prevState
            : [...prevState, objectType]
          : prevState.filter((ot) => ot !== objectType)
      );
      handleRefreshDBObjects();
    },
    [setFilterObjectTypes, handleRefreshDBObjects]
  );

  const handleFilterOwners = useCallback(
    (checked: boolean, owner: string) => {
      setFilterOwners((prevState) =>
        checked
          ? prevState.includes(owner)
            ? prevState
            : [...prevState, owner]
          : prevState.filter((s) => s !== owner)
      );
      handleRefreshDBObjects();
    },
    [setFilterOwners, handleRefreshDBObjects]
  );

  const handleFilterDBObjectsRegexp = useCallback(
    (checked: boolean) => {
      setFilterDBObjectsRegexp(checked);
      handleRefreshDBObjects();
    },
    [setFilterDBObjectsRegexp, handleRefreshDBObjects]
  );

  const handleFilterDBObjectsTextHistory = useCallback(
    (historyItem: FilterDBObjectsTextHistory) => {
      setOpenFilterDBObjectsTextHistory(false);
      setFilterDBObjectsText(historyItem.pattern);
      setFilterDBObjectsRegexp(historyItem.regExp);
      handleRefreshDBObjects();
    },
    [
      setOpenFilterDBObjectsTextHistory,
      setFilterDBObjectsText,
      setFilterDBObjectsRegexp,
      handleRefreshDBObjects,
    ]
  );

  const handleClearFilterDBObjectsText = useCallback(() => {
    setFilterDBObjectsText('');
    handleRefreshDBObjects();
  }, [setFilterDBObjectsText, handleRefreshDBObjects]);

  useEffect(() => {
    if (!owners || owners.length === 0) {
      return;
    }
    void (async () => {
      try {
        setLoadDBObjects(true);
        setDbObjectsError(null);
        const normalizedPattern = filterDBObjectsText.trim();
        const dbObjectsPayload: DBObjectsPayload = {
          database,
          userName,
          objectTypes: filterObjectTypes,
          owners: filterOwners,
          pattern: normalizedPattern,
          regExp: filterDBObjectsRegexp,
        };
        setFilterDBObjectsTextHistory((prevState) => {
          if (!normalizedPattern) {
            return prevState;
          }

          const nextItem: FilterDBObjectsTextHistory = {
            pattern: normalizedPattern,
            regExp: filterDBObjectsRegexp,
          };

          return [
            nextItem,
            ...prevState.filter(
              (item) => item.pattern !== nextItem.pattern || item.regExp !== nextItem.regExp
            ),
          ].slice(0, 10);
        });
        const dbObjectsPayloadResponse = await devLineageLoadDBObjects(dbObjectsPayload);
        setDbObjects(dbObjectsPayloadResponse.dbObjects);
      } catch (e) {
        setDbObjectsError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadDBObjects(false);
      }
    })();
    // Intentionally refresh-driven: typing into the input updates local state only.
    // Backend reload happens via handleRefreshDBObjects on Enter, blur, clear, menu select,
    // owner/type changes, or explicit refresh click.
  }, [refreshDbObjectsRequest, owners]);

  return (
    <div className="h-full w-full min-h-0" ref={rootRef}>
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={20} collapsible collapsedSize={0}>
          <div className="h-full w-full min-h-0 flex flex-col">
            <div className="p-1">
              {objectTypes.map((objectType) => {
                const id = `FloatingSchemaExplorer-object-type-${objectType.replace(/\s/g, '-')}`;
                return (
                  <div
                    key={objectType}
                    className="flex gap-1 items-center overflow-hidden text-nowrap"
                  >
                    <Checkbox
                      id={id}
                      disabled={!owners}
                      checked={filterObjectTypes.includes(objectType)}
                      onCheckedChange={(checked) =>
                        handleFilterObjectTypes(checked === true, objectType)
                      }
                      className="shrink-0 border-muted-foreground"
                    />
                    <label htmlFor={id}>{objectType.toLowerCase()}</label>
                  </div>
                );
              })}
            </div>
            <hr />
            <div className="text-xs p-1 flex gap-1">
              <RefreshCw
                className={`size-3.5 ${owners ? '' : 'opacity-25'}`}
                onClick={handleRefreshOwners}
              />
              <span>schemes</span>
            </div>
            {loadOwners && (
              <div className="flex p-1 gap-1">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span className="text-xs">Loading schemes...</span>
              </div>
            )}
            <div className="flex-1 overflow-auto" data-key="FloatingSchemaExplorer-owners">
              {ownersError ? (
                <span className="text-xs text-red-500">{ownersError}</span>
              ) : (
                owners &&
                (!loadOwners && owners.length === 0 ? (
                  <span className="text-xs p-1">No schemes found</span>
                ) : (
                  <div className="p-1">
                    {owners.map((owner) => {
                      const id = `FloatingSchemaExplorer-scheme-${owner.replace(/\s/g, '-')}`;
                      return (
                        <div key={owner} className="flex gap-1 items-center text-nowrap">
                          <Checkbox
                            id={id}
                            checked={filterOwners.includes(owner)}
                            onCheckedChange={(checked) =>
                              handleFilterOwners(checked === true, owner)
                            }
                            className="shrink-0 border-muted-foreground"
                          />
                          <label htmlFor={id}>{owner}</label>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            {owners && (
              <div className="text-xs p-1">
                selected {filterOwners.length} item
                {`${filterOwners.length === 1 ? '' : 's'}`}
              </div>
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30} collapsible collapsedSize={0}>
          <div className="h-full w-full min-h-0 flex flex-col">
            <div className="text-xs p-1 flex gap-1">
              <RefreshCw
                className={`size-3.5 ${dbObjects ? '' : 'opacity-25'}`}
                onClick={handleRefreshDBObjects}
              />
              {filterOwners?.length === 1 && <span>{filterOwners[0]}</span>}
              <span>
                {filterObjectTypes.length === 1
                  ? `${filterObjectTypes[0].toLowerCase()}s`
                  : 'DB Objects'}
              </span>
            </div>
            <div className="text-xs p-1 flex gap-1 items-center">
              <div
                className={cn(
                  'flex min-w-0 flex-1 items-center rounded-full border',
                  'border-slate-200 bg-white text-slate-900',
                  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
                  'focus-within:ring-1 focus-within:ring-blue-500'
                )}
              >
                <input
                  type="text"
                  value={filterDBObjectsText}
                  onChange={(e) => setFilterDBObjectsText(e.target.value ?? '')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !dbObjectsError && !loadDBObjects) {
                      e.preventDefault();
                      handleRefreshDBObjects();
                    }
                  }}
                  onBlur={handleRefreshDBObjects}
                  className={cn(
                    'min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-sm',
                    'placeholder:text-slate-400',
                    'focus:outline-hidden'
                  )}
                  placeholder="pattern or regexp"
                />

                {filterDBObjectsText && (
                  <button
                    type="button"
                    aria-label="Clear filter"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleClearFilterDBObjectsText}
                    className={cn(
                      'mr-1 flex size-6 shrink-0 items-center justify-center rounded-full',
                      'text-slate-400 hover:text-slate-900 hover:bg-slate-100',
                      'dark:hover:text-slate-100 dark:hover:bg-slate-700'
                    )}
                  >
                    <X className="size-3.5" />
                  </button>
                )}

                <DropdownMenu
                  open={openFilterDBObjectsTextHistory}
                  onOpenChange={setOpenFilterDBObjectsTextHistory}
                  modal={false}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Open filter history"
                      className={cn(
                        'mr-1 flex size-7 shrink-0 items-center justify-center rounded-full',
                        'text-slate-500 hover:text-slate-900 hover:bg-slate-100',
                        'dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700'
                      )}
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={4}
                    side={'bottom'}
                    className={cn(
                      'z-[9999] min-w-[220px] max-w-[360px] p-1',
                      'border border-slate-200 bg-white text-slate-900 shadow-md',
                      'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                    )}
                  >
                    {filterDBObjectsTextHistory.length > 0 ? (
                      filterDBObjectsTextHistory.map((historyItem) => {
                        const key = `${historyItem.pattern}${
                          historyItem.regExp ? ' - regular expression' : ''
                        }`;

                        return (
                          <DropdownMenuItem
                            key={key}
                            onSelect={() => handleFilterDBObjectsTextHistory(historyItem)}
                            className="cursor-pointer text-sm"
                          >
                            <span className="truncate">{key}</span>
                          </DropdownMenuItem>
                        );
                      })
                    ) : (
                      <div className="px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400">
                        no items
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex gap-1 items-center">
                      <Checkbox
                        id="FloatingSchemaExplorer-FilterDBObjectsRegexp"
                        checked={filterDBObjectsRegexp}
                        onCheckedChange={handleFilterDBObjectsRegexp}
                        className="shrink-0 border-muted-foreground"
                      />
                      <label htmlFor="FloatingSchemaExplorer-FilterDBObjectsRegexp">
                        {filterDBObjectsRegexp ? 'R' : 'W'}
                      </label>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="max-w-md">
                    (W)ildcard Pattern or (R)egular Expression Filtering
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {loadDBObjects && (
              <div className="flex p-1 gap-1">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span className="text-xs">Loading db objects...</span>
              </div>
            )}
            <div className="flex-1 overflow-auto" data-key="FloatingSchemaExplorer-dbObjects">
              {dbObjectsError ? (
                <span className="text-xs text-red-500">{dbObjectsError}</span>
              ) : (
                dbObjects &&
                (!loadDBObjects && dbObjects.length === 0 ? (
                  <span className="text-xs p-1">No db objects found</span>
                ) : (
                  <div className="p-1">
                    {dbObjects.map((dbObject) => {
                      const key = `${dbObject.owner}.${dbObject.objectName} (${dbObject.objectType})`;
                      const name = [dbObject.objectName];
                      if (filterOwners?.length > 1) {
                        name.unshift(`${dbObject.owner}.`);
                      }
                      if (filterObjectTypes?.length > 1) {
                        name.push(`(${dbObject.objectType})`);
                      }
                      return (
                        <div
                          key={key}
                          className="text-xs whitespace-nowrap"
                          onClick={() => alert(key)}
                        >
                          {name.join('')}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50} collapsible collapsedSize={0}>
          table
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export const openSchemaExplorer = (
  manager: Pick<WindowManagerApi, 'openWindow'>,
  isDark: boolean,
  database: string,
  userName: string
) => {
  manager.openWindow({
    id: `SchemaExplorer-${database}-${userName}`,
    title: `SchemaExplorer. ${database}: ${userName}`,
    width: 980,
    height: 680,
    minWidth: 640,
    minHeight: 420,
    content: (
      <DataLoadProvider>
        <FloatingSchemaExplorer _isDark={isDark} database={database} userName={userName} />
      </DataLoadProvider>
    ),
  });
};
