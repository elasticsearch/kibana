/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useCasesLocalStorage } from '../../../../common/use_cases_local_storage';
import { LOCAL_STORAGE_KEYS } from '../../../../../common/constants';

interface SidebarContextValue {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

const SidebarCtx = createContext<SidebarContextValue | undefined>(undefined);

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useCasesLocalStorage<boolean>(
    LOCAL_STORAGE_KEYS.caseViewSidebarOpen,
    true
  );

  const value = useMemo(
    () => ({
      isSidebarOpen,
      toggleSidebar: () => setIsSidebarOpen(!isSidebarOpen),
    }),
    [isSidebarOpen, setIsSidebarOpen]
  );

  return <SidebarCtx.Provider value={value}>{children}</SidebarCtx.Provider>;
};

SidebarProvider.displayName = 'SidebarProvider';

export const useSidebar = (): SidebarContextValue => {
  const ctx = useContext(SidebarCtx);
  if (!ctx) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return ctx;
};
