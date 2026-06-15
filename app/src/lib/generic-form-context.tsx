import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ColumnInfoSchema } from '@pondpilot/flowscope-core';
import { loadGenericForms } from '@/lib/utils_backend';

interface GenericFormContextValue {
  columnInfoSchema: ColumnInfoSchema | null;
  ensureColumnInfoSchema: () => Promise<ColumnInfoSchema | null>;
}

const GenericFormContext = createContext<GenericFormContextValue | null>(null);

interface GenericFormProviderProps {
  children: ReactNode;
}

export function GenericFormProvider({ children }: GenericFormProviderProps) {
  const [columnInfoSchema, setColumnInfoSchema] = useState<ColumnInfoSchema | null>(null);

  const schemaRef = useRef<ColumnInfoSchema | null>(null);
  const loadingRef = useRef<Promise<ColumnInfoSchema | null> | null>(null);

  const ensureColumnInfoSchema = useCallback(async (): Promise<ColumnInfoSchema | null> => {
    if (schemaRef.current) {
      return schemaRef.current;
    }

    if (loadingRef.current) {
      return loadingRef.current;
    }

    loadingRef.current = loadGenericForms()
      .then((response) => {
        const schema = response ?? null;

        if (schema) {
          schemaRef.current = schema;
          setColumnInfoSchema(schema);
        }

        return schema;
      })
      .finally(() => {
        loadingRef.current = null;
      });

    return loadingRef.current;
  }, []);

  const value = useMemo<GenericFormContextValue>(
    () => ({
      columnInfoSchema,
      ensureColumnInfoSchema,
    }),
    [columnInfoSchema, ensureColumnInfoSchema]
  );

  return <GenericFormContext.Provider value={value}>{children}</GenericFormContext.Provider>;
}

export function useGenericForm(): GenericFormContextValue {
  const context = useContext(GenericFormContext);

  if (!context) {
    throw new Error('useGenericForm must be used within a GenericFormProvider');
  }

  return context;
}
