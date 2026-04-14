
import { FloatingWindow } from './FloatingWindow';
import { useWindowManager } from './useWindowManager';
import type { FloatingWindowsProps } from './types';

export function FloatingWindows({ manager, theme }: FloatingWindowsProps) {
  const isDark = theme === 'dark';

  const internalManager = manager as ReturnType<typeof useWindowManager>;

  return (
    <>
      {internalManager.windows
        .filter((item) => item.open)
        .map((item) => (
          <FloatingWindow
            key={item.id}
            item={item}
            isTopmost={internalManager.topmostId === item.id}
            isDark={isDark}
            onActivate={internalManager.bringToFront}
            onClose={internalManager.closeWindow}
            onDragStart={internalManager.startDrag}
            onResizeStart={internalManager.startResize}
          />
        ))}
    </>
  );
}
