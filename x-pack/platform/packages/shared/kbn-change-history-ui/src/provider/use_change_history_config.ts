/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useContext } from 'react';
import { ChangeHistoryContext } from './change_history_context';

export const useChangeHistoryConfig = () => {
  const context = useContext(ChangeHistoryContext);

  if (!context) {
    throw new Error('useChangeHistoryConfig must be used within ChangeHistoryProvider');
  }

  return context;
};
