import type { WindowManagerApi } from './floating-window';
import { useProject } from '@pondpilot/flowscope-app/src/lib/project-store';
import { DataLoadProvider } from '@pondpilot/flowscope-app/src/components/DataLoadContext';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@pondpilot/flowscope-app/src/components/ui/resizable';
import {
  CredentialsPayload,
  ObjectTypes,
  objectTypes,
} from '@pondpilot/flowscope-app/src/lib/backend-adapter';
import { Checkbox } from '@pondpilot/flowscope-app/src/components/ui/checkbox';
import { useEffect, useRef, useState } from 'react';
import { devLineageLoadSchemes } from '@pondpilot/flowscope-app/src/lib/utils_backend';
import { LoaderCircle } from 'lucide-react';

function FloatingSchemaExplorer({ _isDark }: { _isDark: boolean }) {
  const { currentProject } = useProject();
  const [schemes, setSchemes] = useState<string[] | null>(null);
  const [filterObjectTypes, setFilterObjectTypes] = useState<ObjectTypes[]>(['TABLE']);
  const [filterSchemes, setFilterSchemes] = useState<string[]>([currentProject?.userName]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentProject) {
      return;
    }
    void (async () => {
      const credentialsPayload: CredentialsPayload = {
        database: currentProject.database,
        userName: currentProject.userName,
      };
      const schemesPayloadResponse = await devLineageLoadSchemes(credentialsPayload);
      setSchemes(schemesPayloadResponse.schemes);
      if(currentProject.userName) {
        setTimeout(()=>{
            const selectedItem = rootRef.current?.querySelector(`#FloatingSchemaExplorer-scheme-${currentProject.userName.replace(/\s/g, '-')}`);
            selectedItem?.scrollIntoView({
              block: 'center',
              behavior: 'smooth',
            });
        }, 200);
      }
    })();
  }, []);
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
            <div className="flex-1 overflow-auto">
              {schemes ? (
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
              ) : (
                <div className="flex p-1 gap-1">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Loading schemes...</span>
                </div>
              )}
            </div>
            {schemes && <div className="text-xs p-1">Choosed {filterSchemes.length} element{`${filterSchemes.length == 1 ? '' : 's'}`}</div>}
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={20} collapsible collapsedSize={0}>
          tables tables tables tables
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
  isDark: boolean
) => {
  manager.openWindow({
    id: `SchemaExplorer`,
    title: `Schema Explorer`,
    content: (
      <DataLoadProvider>
        <FloatingSchemaExplorer _isDark={isDark} />
      </DataLoadProvider>
    ),
  });
};
