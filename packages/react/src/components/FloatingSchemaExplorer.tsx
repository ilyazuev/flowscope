import type { WindowManagerApi } from './floating-window';
import { useProject } from '@pondpilot/flowscope-app/src/lib/project-store';
import { DataLoadProvider } from '@pondpilot/flowscope-app/src/components/DataLoadContext';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@pondpilot/flowscope-app/src/components/ui/resizable';

function FloatingSchemaExplorer({ isDark }: { isDark: boolean }) {
  // const { currentProject } = useProject();
  return (
    <div className="h-full w-full min-h-0">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={10} collapsible collapsedSize={0}>
          <div className="h-full w-full min-h-0 flex">
            <div></div>
            <div>
              schemas schemas schemas schemas
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={20} collapsible collapsedSize={0}>
          tables tables tables tables
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={70} collapsible collapsedSize={0}>
          table
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export const openSchemaExplorer = (
  manager: Pick<WindowManagerApi, 'openWindow'>,
  isDark: boolean,
  database?: string,
  userName?: string
) => {
  manager.openWindow({
    id: `SchemaExplorer`,
    title: `Schema Explorer`,
    content: (
      <DataLoadProvider>
        <FloatingSchemaExplorer
          isDark={isDark}
        />
      </DataLoadProvider>
    ),
  });
};
