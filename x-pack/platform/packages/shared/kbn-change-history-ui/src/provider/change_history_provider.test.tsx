/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with, at
 * your election, the Elastic License 2.0.
 */

import '@testing-library/jest-dom';
import { I18nProvider } from '@kbn/i18n-react';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ChangeHistoryModal } from '../components/modal/change_history_modal';
import { ChangeHistoryTrigger } from '../components/modal/change_history_trigger';
import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import { ChangeHistoryProvider } from './change_history_provider';
import {
  TEST_OBJECT_ID_A,
  TEST_OBJECT_ID_B,
  TEST_OBJECT_TITLE,
} from '../test_utils/change_history_test_fixtures';
import { createQueryClientWrapper } from '../test_utils/create_query_client_wrapper';

const { wrapper: QueryClientWrapper } = createQueryClientWrapper();

const adapter: ChangeHistoryAdapter = {
  listChanges: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  getChange: jest.fn(),
};

const Harness = ({ objectId }: { objectId: string }) => (
  <I18nProvider>
    <QueryClientWrapper>
      <ChangeHistoryProvider
        objectId={objectId}
        adapter={adapter}
        labels={{ previewTitle: TEST_OBJECT_TITLE }}
        renderPreview={() => <div data-test-subj="previewPanel" />}
      >
        <ChangeHistoryTrigger />
        <ChangeHistoryModal />
      </ChangeHistoryProvider>
    </QueryClientWrapper>
  </I18nProvider>
);

describe('ChangeHistoryProvider', () => {
  it('closes the modal when objectId changes', () => {
    const { rerender } = render(<Harness objectId={TEST_OBJECT_ID_A} />);

    fireEvent.click(screen.getByTestId('changeHistoryTrigger'));
    expect(screen.getByTestId('changeHistoryModal')).toBeInTheDocument();

    rerender(<Harness objectId={TEST_OBJECT_ID_B} />);
    expect(screen.queryByTestId('changeHistoryModal')).not.toBeInTheDocument();
  });
});
