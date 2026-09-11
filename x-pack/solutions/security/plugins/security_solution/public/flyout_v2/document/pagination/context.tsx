/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createContext, useContext } from 'react';
import type { PaginationStore } from './store';

const PaginationStoreContext = createContext<PaginationStore | null>(null);

export const PaginationStoreProvider = PaginationStoreContext.Provider;

export const usePaginationStore = (): PaginationStore | null => useContext(PaginationStoreContext);
