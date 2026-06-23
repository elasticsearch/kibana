/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { createContext, useMemo, useState } from 'react';
import { createUseContext } from './create_use_context';

export type FilterMode = 'regex' | 'jq';

export interface OutputFilterState {
  expression: string;
  mode: FilterMode;
  invertMatch: boolean;
  isExpanded: boolean;
}

export interface OutputFilterActions {
  setExpression: (expression: string) => void;
  setMode: (mode: FilterMode) => void;
  setInvertMatch: (invertMatch: boolean) => void;
  setIsExpanded: (isExpanded: boolean) => void;
}

const defaultState: OutputFilterState = {
  expression: '',
  mode: 'jq',
  invertMatch: false,
  isExpanded: false,
};

const defaultActions: OutputFilterActions = {
  setExpression: () => {},
  setMode: () => {},
  setInvertMatch: () => {},
  setIsExpanded: () => {},
};

const OutputFilterReadContext = createContext<OutputFilterState>(defaultState);
const OutputFilterActionContext = createContext<OutputFilterActions>(defaultActions);

export function OutputFilterContextProvider({ children }: { children: React.ReactNode }) {
  const [expression, setExpression] = useState('');
  const [mode, setMode] = useState<FilterMode>('jq');
  const [invertMatch, setInvertMatch] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const state = useMemo(
    () => ({ expression, mode, invertMatch, isExpanded }),
    [expression, mode, invertMatch, isExpanded]
  );
  const actions = useMemo(() => ({ setExpression, setMode, setInvertMatch, setIsExpanded }), []);

  return (
    <OutputFilterReadContext.Provider value={state}>
      <OutputFilterActionContext.Provider value={actions}>
        {children}
      </OutputFilterActionContext.Provider>
    </OutputFilterReadContext.Provider>
  );
}

export const useOutputFilterReadContext = createUseContext(
  OutputFilterReadContext,
  'OutputFilterReadContext'
);
export const useOutputFilterActionContext = createUseContext(
  OutputFilterActionContext,
  'OutputFilterActionContext'
);
