// FloatingWindowsProvider.tsx
import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from 'react';

import { FloatingWindows } from './FloatingWindows';
import { useWindowManager } from './useWindowManager';
import type {
  ResolvedTheme,
  UseWindowManagerOptions,
  WindowManagerApi,
} from './types';

type FloatingWindowsProviderProps = {
  children: ReactNode;
  theme: ResolvedTheme;
  initialWindows?: UseWindowManagerOptions['initialWindows'];
};

const FloatingWindowsContext = createContext<WindowManagerApi | null>(null);

let activeWindowManager: Pick<
  WindowManagerApi,
  'openWindow' | 'updateWindow' | 'closeWindow' | 'bringToFront'
> | null = null;

export function getFloatingWindowManager() {
  return activeWindowManager;
}

export function FloatingWindowsProvider({
                                          children,
                                          theme,
                                          initialWindows,
                                        }: FloatingWindowsProviderProps) {
  const manager = useWindowManager({
    theme,
    initialWindows,
  });

  useEffect(() => {
    activeWindowManager = manager;

    return () => {
      if (activeWindowManager === manager) {
        activeWindowManager = null;
      }
    };
  }, [manager]);

  return (
    <FloatingWindowsContext.Provider value={manager}>
      {children}
      <FloatingWindows manager={manager} theme={theme} />
    </FloatingWindowsContext.Provider>
  );
}

export function useFloatingWindows() {
  const manager = useContext(FloatingWindowsContext);

  if (!manager) {
    throw new Error('useFloatingWindows must be used inside FloatingWindowsProvider');
  }

  return manager;
}