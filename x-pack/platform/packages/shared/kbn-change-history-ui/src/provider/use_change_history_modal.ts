/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useContext } from 'react';
import { ChangeHistoryModalContext } from './change_history_modal_context';

export const useChangeHistoryModal = () => {
  const context = useContext(ChangeHistoryModalContext);

  if (!context) {
    throw new Error('useChangeHistoryModal must be used within ChangeHistoryProvider');
  }

  return context;
};
