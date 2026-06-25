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

const adapter: ChangeHistoryAdapter = {
  listChanges: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  getChange: jest.fn(),
};

const Harness = ({ objectId }: { objectId: string }) => (
  <I18nProvider>
    <ChangeHistoryProvider
      objectId={objectId}
      adapter={adapter}
      renderPreview={() => <div data-test-subj="previewPanel" />}
    >
      <ChangeHistoryTrigger />
      <ChangeHistoryModal />
    </ChangeHistoryProvider>
  </I18nProvider>
);

describe('ChangeHistoryProvider', () => {
  it('closes the modal when objectId changes', () => {
    const { rerender } = render(<Harness objectId="workflow-a" />);

    fireEvent.click(screen.getByTestId('changeHistoryTrigger'));
    expect(screen.getByTestId('changeHistoryModal')).toBeInTheDocument();

    rerender(<Harness objectId="workflow-b" />);
    expect(screen.queryByTestId('changeHistoryModal')).not.toBeInTheDocument();
  });
});
