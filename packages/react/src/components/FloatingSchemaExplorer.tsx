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
import { Button } from '@pondpilot/flowscope-app/src/components/ui/button';
import {FloatingDescribe} from './FloatingDescribe';

interface FilterDBObjectsTextHistory {
  pattern: string;
  regExp: boolean;
}

const getDBObjectKey = (dbObject: DBObject) =>
  `${dbObject.owner}.${dbObject.objectName} (${dbObject.objectType})`;

function useSchemaExplorerInner() {
  const [refreshOwnersRequest, setRefreshOwnersRequest] = useState(0);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [owners, setOwners] = useState<string[] | null>(null);
  const [filterObjectTypes, setFilterObjectTypes] = useState<ObjectType[]>(['TABLE']);
  const [filterOwners, setFilterOwners] = useState<string[]>([]);

  const [refreshDbObjectsRequest, setRefreshDbObjectsRequest] = useState(0);
  const [loadingDBObjects, setLoadingDBObjects] = useState(false);
  const [dbObjects, setDbObjects] = useState<DBObject[] | null>(null);
  const [dbObjectsCsv, setDbObjectsCsv] = useState<string | null>(null);
  const [filterDBObjectsText, setFilterDBObjectsText] = useState<string>('');
  const [filterDBObjectsRegexp, setFilterDBObjectsRegexp] = useState(false);
  const [filterDBObjectsTextHistory, setFilterDBObjectsTextHistory] = useState<
    FilterDBObjectsTextHistory[]
  >([]);
  const [openFilterDBObjectsTextHistory, setOpenFilterDBObjectsTextHistory] = useState(false);

  return {
    loadingOwners,
    setLoadingOwners,
    owners,
    setOwners,
    filterObjectTypes,
    setFilterObjectTypes,
    filterOwners,
    setFilterOwners,
    refreshOwnersRequest,
    setRefreshOwnersRequest,
    loadingDBObjects,
    setLoadingDBObjects,
    dbObjects,
    setDbObjects,
    dbObjectsCsv,
    setDbObjectsCsv,
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
}: {
  database: string;
  userName: string;
}) {
  const {
    loadingOwners,
    setLoadingOwners,
    owners,
    setOwners,
    filterObjectTypes,
    setFilterObjectTypes,
    filterOwners,
    setFilterOwners,
    refreshOwnersRequest,
    setRefreshOwnersRequest,
    loadingDBObjects,
    setLoadingDBObjects,
    dbObjects,
    setDbObjects,
    dbObjectsCsv,
    setDbObjectsCsv,
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
  const [selectedDbObject, setSelectedDbObject] = useState<DBObject | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const filterDBObjectsControlRef = useRef<HTMLDivElement>(null);
  const loadDBObjectsRequestIdRef = useRef(0);
  const lastAppliedDBObjectsFilterRef = useRef<FilterDBObjectsTextHistory>({
    pattern: filterDBObjectsText,
    regExp: filterDBObjectsRegexp,
  });

  const handleRefreshDBObjects = useCallback(
    (nextFilter?: FilterDBObjectsTextHistory, force = true) => {
      const appliedFilter: FilterDBObjectsTextHistory = {
        pattern: (nextFilter?.pattern ?? filterDBObjectsText).trim(),
        regExp: nextFilter?.regExp ?? filterDBObjectsRegexp,
      };
      const lastAppliedFilter = lastAppliedDBObjectsFilterRef.current;

      if (
        !force &&
        lastAppliedFilter.pattern === appliedFilter.pattern &&
        lastAppliedFilter.regExp === appliedFilter.regExp
      ) {
        return;
      }

      lastAppliedDBObjectsFilterRef.current = appliedFilter;
      setSelectedDbObject(null);
      setRefreshDbObjectsRequest((key) => key + 1);
      setDbObjects(null);
      setDbObjectsCsv(null);
    },
    [
      filterDBObjectsRegexp,
      filterDBObjectsText,
      setRefreshDbObjectsRequest,
      setDbObjects,
      setDbObjectsCsv,
    ]
  );

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
          setLoadingOwners(true);
          setLoadingDBObjects(true);
          setDbObjects(null);
          setDbObjectsCsv(null);
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
        setLoadingDBObjects(false);
        setOwnersError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingOwners(false);
      }
    })();
  }, [
    database,
    userName,
    owners,
    refreshOwnersRequest,
    setLoadingOwners,
    setLoadingDBObjects,
    setDbObjects,
    setDbObjectsCsv,
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
      handleRefreshDBObjects({ pattern: filterDBObjectsText, regExp: checked });
    },
    [filterDBObjectsText, setFilterDBObjectsRegexp, handleRefreshDBObjects]
  );

  const handleFilterDBObjectsTextHistory = useCallback(
    (historyItem: FilterDBObjectsTextHistory) => {
      setOpenFilterDBObjectsTextHistory(false);
      setFilterDBObjectsText(historyItem.pattern);
      setFilterDBObjectsRegexp(historyItem.regExp);
      handleRefreshDBObjects(historyItem, false);
    },
    [
      setOpenFilterDBObjectsTextHistory,
      setFilterDBObjectsText,
      setFilterDBObjectsRegexp,
      handleRefreshDBObjects,
    ]
  );

  const handleClearFilterDBObjectsText = useCallback(() => {
    const nextFilter = { pattern: '', regExp: filterDBObjectsRegexp };

    setFilterDBObjectsText(nextFilter.pattern);
    handleRefreshDBObjects(nextFilter, false);
  }, [filterDBObjectsRegexp, setFilterDBObjectsText, handleRefreshDBObjects]);

  const handleFilterDBObjectsTextBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const nextFocusedElement = e.relatedTarget;

      if (nextFocusedElement && filterDBObjectsControlRef.current?.contains(nextFocusedElement)) {
        return;
      }

      handleRefreshDBObjects(undefined, false);
    },
    [handleRefreshDBObjects]
  );

  useEffect(() => {
    if (!owners || owners.length === 0) {
      return;
    }
    if (dbObjects) {
      return;
    }
    const requestId = loadDBObjectsRequestIdRef.current + 1;
    loadDBObjectsRequestIdRef.current = requestId;
    void (async () => {
      try {
        setLoadingDBObjects(true);
        setDbObjectsError(null);
        const { pattern: normalizedPattern, regExp } = lastAppliedDBObjectsFilterRef.current;
        const dbObjectsPayload: DBObjectsPayload = {
          database,
          userName,
          objectTypes: filterObjectTypes,
          owners: filterOwners,
          pattern: normalizedPattern,
          regExp,
        };
        setFilterDBObjectsTextHistory((prevState) => {
          if (!normalizedPattern) {
            return prevState;
          }

          const nextItem: FilterDBObjectsTextHistory = {
            pattern: normalizedPattern,
            regExp,
          };

          return [
            nextItem,
            ...prevState.filter(
              (item) => item.pattern !== nextItem.pattern || item.regExp !== nextItem.regExp
            ),
          ].slice(0, 10);
        });
        const dbObjectsPayloadResponse = await devLineageLoadDBObjects(dbObjectsPayload);
        if (loadDBObjectsRequestIdRef.current !== requestId) {
          return;
        }
        setDbObjects(dbObjectsPayloadResponse.dbObjects);
        setDbObjectsCsv(dbObjectsPayloadResponse.csv);
      } catch (e) {
        if (loadDBObjectsRequestIdRef.current !== requestId) {
          return;
        }
        setDbObjectsError(e instanceof Error ? e.message : String(e));
      } finally {
        if (loadDBObjectsRequestIdRef.current === requestId) {
          setLoadingDBObjects(false);
        }
      }
    })();
    // Intentionally refresh-driven: typing into the input updates local state only.
    // Backend reload happens via handleRefreshDBObjects on Enter, blur, clear, menu select,
    // owner/type changes, or explicit refresh click.
  }, [refreshDbObjectsRequest, owners]);

  return (
    <div className="h-full w-full min-h-0" ref={rootRef}>
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={15} collapsible collapsedSize={0}>
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
                      className="shrink-0 border-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <label htmlFor={id}>{objectType.toLowerCase().replace('_', ' ')}</label>
                  </div>
                );
              })}
            </div>
            <hr />
            <div className="text-xs p-1 flex gap-1">
              <RefreshCw
                className={`size-3.5 ${loadingOwners ? 'opacity-25' : ''}`}
                onClick={handleRefreshOwners}
              />
              <span>schemes</span>
            </div>
            {loadingOwners && (
              <div className="flex p-1 gap-1">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span className="text-xs">Loading schemes...</span>
              </div>
            )}
            <div className="flex-1 overflow-auto" data-key="FloatingSchemaExplorer-owners">
              {ownersError ? (
                <span className="text-xs text-red-500 p-1">{ownersError}</span>
              ) : (
                owners &&
                (!loadingOwners && owners.length === 0 ? (
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
                            className="shrink-0 border-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
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
        <ResizablePanel defaultSize={20} collapsible collapsedSize={0}>
          <div className="h-full w-full min-h-0 flex flex-col">
            <div className="text-xs p-1 flex gap-1">
              <RefreshCw
                className={`size-3.5 ${loadingDBObjects ? 'opacity-25' : ''}`}
                onClick={() => handleRefreshDBObjects()}
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
                ref={filterDBObjectsControlRef}
                className={cn(
                  'flex min-w-0 flex-1 items-center rounded-full border',
                  'border-slate-200 bg-white text-slate-900',
                  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
                  'focus-within:border-slate-400 dark:focus-within:border-slate-500'
                )}
              >
                <input
                  type="text"
                  value={filterDBObjectsText}
                  onChange={(e) => setFilterDBObjectsText(e.target.value ?? '')}
                  onKeyDown={(e) => {
                    if (
                      (e.key === 'Enter' || e.key === 'Tab') &&
                      !dbObjectsError &&
                      !loadingDBObjects
                    ) {
                      e.preventDefault();
                      handleRefreshDBObjects(undefined, false);
                    }
                  }}
                  onBlur={handleFilterDBObjectsTextBlur}
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
                      'focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
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
                        'focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
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
                        className="shrink-0 border-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
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
            {loadingDBObjects && (
              <div className="flex p-1 gap-1">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span className="text-xs">Loading db objects...</span>
              </div>
            )}
            <div className="flex-1 overflow-auto" data-key="FloatingSchemaExplorer-dbObjects">
              {dbObjectsError ? (
                <span className="text-xs text-red-500 p-1">{dbObjectsError}</span>
              ) : (
                dbObjects &&
                (!loadingDBObjects && dbObjects.length === 0 ? (
                  <span className="text-xs p-1">No db objects found</span>
                ) : (
                  <div className="p-1">
                    {dbObjects.map((dbObject) => {
                      const key = getDBObjectKey(dbObject);
                      const name = [dbObject.objectName];
                      const selected = selectedDbObject
                        ? getDBObjectKey(selectedDbObject) === key
                        : false;

                      if (filterOwners?.length > 1) {
                        name.unshift(`${dbObject.owner}.`);
                      }
                      if (filterObjectTypes?.length > 1) {
                        name.push(`(${dbObject.objectType})`);
                      }
                      return (
                        <button
                          key={key}
                          type="button"
                          onFocus={() => setSelectedDbObject(dbObject)}
                          onClick={() => setSelectedDbObject(dbObject)}
                          className={cn(
                            'block w-full rounded-sm px-1 py-1 text-left text-xs whitespace-nowrap',
                            'hover:bg-slate-100 focus:bg-slate-100 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
                            'dark:hover:bg-slate-700 dark:focus:bg-slate-700',
                            selected &&
                              'bg-blue-700 text-white hover:bg-blue-700 focus:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-700 dark:focus:bg-blue-700'
                          )}
                        >
                          {name.join('')}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={65} collapsible collapsedSize={0}>
          <div className="h-full w-full min-h-0 p-2 flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDbObject(null)}
                disabled={selectedDbObject === null}
                className="h-7 text-xs"
              >
                Show tables
              </Button>
              {selectedDbObject === null && !loadingDBObjects && (
                <span className="text-slate-500 dark:text-slate-400">Select db object</span>
              )}
              {selectedDbObject && (
                <div className="text-xs">
                  {`${selectedDbObject.owner}.${selectedDbObject.objectName} (${selectedDbObject.objectType})`}
                </div>
              )}
            </div>
            {selectedDbObject ? (
              <DataLoadProvider>
                <FloatingDescribe
                  tableName={selectedDbObject.objectName}
                  schema={selectedDbObject.owner}
                />
              </DataLoadProvider>
            ) : (
              <>
                <span className="text-slate-500 dark:text-slate-400">{dbObjectsCsv}</span>
              </>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export const openSchemaExplorer = (
  manager: Pick<WindowManagerApi, 'openWindow'>,
  database: string,
  userName: string
) => {
  manager.openWindow({
    id: `SchemaExplorer-${database}-${userName}`,
    title: `SchemaExplorer. ${database}: ${userName}`,
    width: window.innerWidth / 3 * 2,
    height: 680,
    minWidth: 640,
    minHeight: 420,
    content: (
      <DataLoadProvider>
        <FloatingSchemaExplorer database={database} userName={userName} />
      </DataLoadProvider>
    ),
  });
};
