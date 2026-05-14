
import { FloatingWindow } from './FloatingWindow';
import type { FloatingWindowsProps } from './types';

export function FloatingWindows({ manager, theme }: FloatingWindowsProps) {
  const isDark = theme === 'dark';

  return (
    <>
      {manager.windows
        .filter((item) => item.open)
        .map((item) => (
          <FloatingWindow
            key={item.id}
            item={item}
            isTopmost={manager.topmostId === item.id}
            isDark={isDark}
            onActivate={manager.bringToFront}
            onClose={manager.closeWindow}
            onScale={manager.scaleWindow}
            onDragStart={manager.startDrag}
            onResizeStart={manager.startResize}
          />
        ))}
    </>
  );
}
