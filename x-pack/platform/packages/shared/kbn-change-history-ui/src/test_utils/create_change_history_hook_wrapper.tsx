/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { ChangeHistoryProvider } from '../provider/change_history_provider';
import type { ChangeHistoryScope } from '../types/change_history_scope';
import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import {
  TEST_CHANGE_HISTORY_SCOPE,
  TEST_OBJECT_ID,
  TEST_OBJECT_TITLE,
} from './change_history_test_fixtures';
import { createQueryClientWrapper } from './create_query_client_wrapper';

export const createChangeHistoryHookWrapper = ({
  adapter,
  objectId = TEST_OBJECT_ID,
  scope = TEST_CHANGE_HISTORY_SCOPE,
}: {
  adapter: ChangeHistoryAdapter;
  objectId?: string;
  scope?: ChangeHistoryScope;
}) => {
  const { wrapper: QueryClientWrapper, queryClient } = createQueryClientWrapper();

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientWrapper>
      <ChangeHistoryProvider
        objectId={objectId}
        adapter={adapter}
        labels={{ previewTitle: TEST_OBJECT_TITLE }}
        renderPreview={() => null}
        scope={scope}
      >
        {children}
      </ChangeHistoryProvider>
    </QueryClientWrapper>
  );

  return { wrapper, queryClient };
};
