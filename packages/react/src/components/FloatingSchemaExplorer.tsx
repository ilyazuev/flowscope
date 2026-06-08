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
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  devLineageLoadSchemes,
  devLineageLoadDBObjects,
} from '@pondpilot/flowscope-app/src/lib/utils_backend';
import { LoaderCircle, RefreshCw } from 'lucide-react';

function useSchemaExplorerInner() {
  const [loadSchemes, setLoadSchemes] = useState(false);
  const [schemes, setSchemes] = useState<string[] | null>(null);
  const [filterObjectTypes, setFilterObjectTypes] = useState<ObjectType[]>(['TABLE']);
  const [filterSchemes, setFilterSchemes] = useState<string[]>([]);
  const [refreshSchemesRequest, setRefreshSchemesRequest] = useState(0);

  const [loadDBObjects, setLoadDBObjects] = useState(false);
  const [dbObjects, setDbObjects] = useState<DBObject[] | null>(null);
  const [refreshDbObjectsRequest, setRefreshDbObjectsRequest] = useState(0);
  return {
    loadSchemes,
    setLoadSchemes,
    schemes,
    setSchemes,
    filterObjectTypes,
    setFilterObjectTypes,
    filterSchemes,
    setFilterSchemes,
    refreshSchemesRequest,
    setRefreshSchemesRequest,
    loadDBObjects,
    setLoadDBObjects,
    dbObjects,
    setDbObjects,
    refreshDbObjectsRequest,
    setRefreshDbObjectsRequest,
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
    throw new Error('useSharedDataLoad must be used inside DataLoadProvider');
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
    loadSchemes,
    setLoadSchemes,
    schemes,
    setSchemes,
    filterObjectTypes,
    setFilterObjectTypes,
    filterSchemes,
    setFilterSchemes,
    refreshSchemesRequest,
    setRefreshSchemesRequest,
    loadDBObjects,
    setLoadDBObjects,
    dbObjects,
    setDbObjects,
    refreshDbObjectsRequest,
    setRefreshDbObjectsRequest,
  } = useSchemaExplorer();
  const [schemesError, setSchemesError] = useState<string | null>(null);
  const [dbObjectsError, setDbObjectsError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleRefreshSchemes = useCallback(() => {
    setRefreshSchemesRequest((key) => key + 1);
    setSchemes(null);
  }, [setRefreshSchemesRequest, setSchemes]);

  useEffect(() => {
    if (filterSchemes.length == 0) {
      filterSchemes.push(userName);
    }
    void (async () => {
      const credentialsPayload: CredentialsPayload = {
        database,
        userName,
      };
      setSchemesError(null);
      try {
        if (!schemes) {
          setLoadSchemes(true);
          setLoadDBObjects(true);
          setDbObjects(null);
          const schemesPayloadResponse = await devLineageLoadSchemes(credentialsPayload);
          setSchemes(schemesPayloadResponse.schemes || ['NO SCHEMES FOUND']);
          handleRefreshDBObjects();
        }
        setTimeout(() => {
          const selectedItem = rootRef.current?.querySelector(
            '[data-key=FloatingSchemaExplorer-schemes] [data-state=checked]'
          );
          selectedItem?.scrollIntoView({
            block: 'center',
            behavior: 'smooth',
          });
        }, 200);
      } catch (e) {
        setLoadDBObjects(false);
        setSchemesError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadSchemes(false);
      }
    })();
  }, [refreshSchemesRequest, setSchemesError, setSchemes]);

  const handleRefreshDBObjects = useCallback(() => {
    setRefreshDbObjectsRequest((key) => key + 1);
    setDbObjects(null);
  }, [setRefreshSchemesRequest, setSchemes]);

  useEffect(() => {
    if (!schemes) {
      return;
    }
    void (async () => {
      try {
        setLoadDBObjects(true);
        const dbObjectsPayload: DBObjectsPayload = {
          database,
          userName,
          //pattern: '*IDAF*',
          //regExp: false,
          pattern: '^IDAF_DS.*$',
          regExp: true,
          objectTypes: ['TABLE', 'VIEW'],
        };
        const dbObjectsPayloadResponse = await devLineageLoadDBObjects(dbObjectsPayload);
        setDbObjects(dbObjectsPayloadResponse.dbObjects ?? null);
      } catch (e) {
        setDbObjectsError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadDBObjects(false);
      }
    })();
  }, [refreshDbObjectsRequest, setDbObjectsError, setDbObjects]);

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
                      disabled={!schemes}
                      checked={filterObjectTypes.includes(objectType)}
                      onCheckedChange={(checked) =>
                        setFilterObjectTypes((prevState) =>
                          checked
                            ? prevState.includes(objectType)
                              ? prevState
                              : [...prevState, objectType]
                            : prevState.filter((ot) => ot !== objectType)
                        )
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
              <span>Schemes</span>
              <RefreshCw
                className={`size-3.5 ${schemes ? '' : 'opacity-25'}`}
                onClick={handleRefreshSchemes}
              />
            </div>
            {loadSchemes && (
              <div className="flex p-1 gap-1">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span className="text-xs">Loading schemes...</span>
              </div>
            )}
            <div className="flex-1 overflow-auto" data-key="FloatingSchemaExplorer-schemes">
              {schemesError ? (
                <span className="text-xs text-red-500">{schemesError}</span>
              ) : (
                schemes && (
                  <div className="p-1">
                    {schemes.map((scheme) => {
                      const id = `FloatingSchemaExplorer-scheme-${scheme.replace(/\s/g, '-')}`;
                      return (
                        <div key={scheme} className="flex gap-1 items-center text-nowrap">
                          <Checkbox
                            id={id}
                            checked={filterSchemes.includes(scheme)}
                            onCheckedChange={(checked) =>
                              setFilterSchemes((prevState) =>
                                checked
                                  ? prevState.includes(scheme)
                                    ? prevState
                                    : [...prevState, scheme]
                                  : prevState.filter((s) => s !== scheme)
                              )
                            }
                            className="shrink-0 border-muted-foreground"
                          />
                          <label htmlFor={id}>{scheme}</label>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
            {schemes && (
              <div className="text-xs p-1">
                selected {filterSchemes.length} item{`${filterSchemes.length == 1 ? '' : 's'}`}
              </div>
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={20} collapsible collapsedSize={0}>
          <div className="h-full w-full min-h-0 flex flex-col">
            <div className="text-xs p-1 flex gap-1">
              <span>DB Objects</span>
              <RefreshCw
                className={`size-3.5 ${dbObjects ? '' : 'opacity-25'}`}
                onClick={handleRefreshDBObjects}
              />
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
                dbObjects && (
                  <div className="p-1">
                    {dbObjects.map((dbObject) => {
                      const key = `${dbObject.owner}.${dbObject.objectName} (${dbObject.objectType})`;
                      return (
                        <div key={key} className="text-xs whitespace-nowrap" onClick={() => alert(key)}>
                          {key}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={60} collapsible collapsedSize={0}>
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
