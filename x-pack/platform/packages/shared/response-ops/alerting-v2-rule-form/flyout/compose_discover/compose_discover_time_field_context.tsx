/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { createContext, useContext } from 'react';

export interface TimeFieldOption {
  value: string;
  text: string;
}

export interface ComposeDiscoverTimeFieldContextValue {
  timeFieldOptions: TimeFieldOption[];
  isTimeFieldResolved: boolean;
}

const ComposeDiscoverTimeFieldContext = createContext<ComposeDiscoverTimeFieldContextValue | null>(
  null
);

export const useComposeDiscoverTimeField = (): ComposeDiscoverTimeFieldContextValue => {
  const ctx = useContext(ComposeDiscoverTimeFieldContext);
  if (!ctx) {
    throw new Error(
      'useComposeDiscoverTimeField must be used within ComposeDiscoverTimeFieldContextProvider'
    );
  }
  return ctx;
};

export const ComposeDiscoverTimeFieldContextProvider: React.FC<{
  value: ComposeDiscoverTimeFieldContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <ComposeDiscoverTimeFieldContext.Provider value={value}>
    {children}
  </ComposeDiscoverTimeFieldContext.Provider>
);
