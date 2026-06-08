import type { WindowManagerApi } from './floating-window';
import { DataLoadProvider } from '@pondpilot/flowscope-app/src/components/DataLoadContext';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@pondpilot/flowscope-app/src/components/ui/resizable';
import {
  CredentialsPayload,
  ObjectTypes,
  objectTypes, TablesPayload,
} from '@pondpilot/flowscope-app/src/lib/backend-adapter';
import { Checkbox } from '@pondpilot/flowscope-app/src/components/ui/checkbox';
import { useCallback, useEffect, useRef, useState } from 'react';
import { devLineageLoadSchemes, devLineageLoadTables } from '@pondpilot/flowscope-app/src/lib/utils_backend';
import { LoaderCircle, RefreshCw } from 'lucide-react';

function FloatingSchemaExplorer({
  database,
  userName,
  _isDark,
}: {
  database: string;
  userName: string;
  _isDark: boolean;
}) {
  const [schemes, setSchemes] = useState<string[] | null>(null);
  const [schemesError, setSchemesError] = useState<string | null>(null);
  const [filterObjectTypes, setFilterObjectTypes] = useState<ObjectTypes[]>(['TABLE']);
  const [filterSchemes, setFilterSchemes] = useState<string[]>([userName]);
  const [refreshSchemesRequest, setRefreshSchemesRequest] = useState(0);

  const [tables, setTables] = useState<string[] | null>(null);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [refreshTablesRequest, setRefreshTablesRequest] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleRefreshSchemes = useCallback(() => {
    setRefreshSchemesRequest((key) => key + 1);
    setSchemes(null);
  }, [setRefreshSchemesRequest, setSchemes]);

  useEffect(() => {
    void (async () => {
      const credentialsPayload: CredentialsPayload = {
        database,
        userName,
      };
      setSchemesError(null);
      try {
        const schemesPayloadResponse = await devLineageLoadSchemes(credentialsPayload);
        setSchemes(schemesPayloadResponse.schemes || ['NO SCHEMES FOUND']);
        handleRefreshTables();
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
        setSchemesError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [refreshSchemesRequest, setSchemesError, setSchemes]);

  const handleRefreshTables = useCallback(() => {
    setRefreshTablesRequest((key) => key + 1);
    setTables(null);
  }, [setRefreshSchemesRequest, setSchemes]);

  useEffect(() => {
    if( !schemes ) {
      return;
    }
    void (async () => {
      try {
        const tablesPayload: TablesPayload = {
          database,
          userName,
          //pattern: '*IDAF*',
          //regExp: false,
          pattern: '^IDAF_DS.*$',
          regExp: true,
          objectTypes: ['TABLE', 'VIEW'],
        };
        const tablesPayloadResponse = await devLineageLoadTables(tablesPayload);
        setTables(
          tablesPayloadResponse.csv ? tablesPayloadResponse.csv?.split('\n') : ['NO TABLES FOUND']
        );
      } catch (e) {
        setTablesError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [refreshTablesRequest, setTablesError, setTables]);

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
            {!schemes && (
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
                Choosed {filterSchemes.length} element{`${filterSchemes.length == 1 ? '' : 's'}`}
              </div>
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={20} collapsible collapsedSize={0}>
          <div className="h-full w-full min-h-0 flex flex-col">
            <div className="text-xs p-1 flex gap-1">
              <span>Tables</span>
              <RefreshCw
                className={`size-3.5 ${tables ? '' : 'opacity-25'}`}
                onClick={handleRefreshTables}
              />
            </div>
            {!tables && (
              <div className="flex p-1 gap-1">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span className="text-xs">Loading tables...</span>
              </div>
            )}
            <div className="flex-1 overflow-auto" data-key="FloatingSchemaExplorer-tables">
              {tablesError ? (
                <span className="text-xs text-red-500">{tablesError}</span>
              ) : (
                tables && (
                  <div className="p-1">
                    {tables.map((table) => {
                      return (
                        <div key={table} className="text-xs" onClick={() => alert(table)}>
                          {table}
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
