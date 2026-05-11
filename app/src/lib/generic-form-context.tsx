import { createContext, Dispatch, type ReactNode, SetStateAction, useContext, useMemo, useState } from 'react';
import { ColumnInfoSchema } from '@pondpilot/flowscope-core';

interface GenericFormSchema {
  columnInfoSchema: ColumnInfoSchema | null;
  setColumnInfoSchema: Dispatch<SetStateAction<ColumnInfoSchema | null>>;
}

const GenericFormContext = createContext<GenericFormSchema | null>(null);

interface GenericFormProviderProps {
  children: ReactNode;
}

export function GenericFormProvider({
    children
}: GenericFormProviderProps) {
  const [columnInfoSchema, setColumnInfoSchema] = useState<ColumnInfoSchema|null>(null)


  const value = useMemo(
    () => ({
      columnInfoSchema,
      setColumnInfoSchema,
    }),[columnInfoSchema, setColumnInfoSchema]
  );

  return <GenericFormContext.Provider value={value}>{children}</GenericFormContext.Provider>;
}

export function useGenericForm() {
  const context = useContext(GenericFormContext);
  if (!context) {
    throw new Error('useGenericForm must be used within a GenericFormProvider');
  }
  return context;
}