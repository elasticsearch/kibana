/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TestProviders } from '../../../common/mock';
import { ServicePanelFooter } from './footer';
import {
  ADD_TO_NEW_CASE_TEST_ID,
  ADD_TO_EXISTING_CASE_TEST_ID,
} from '../../../../common/cases/attachments/entity/test_ids';
import type { EntityStoreRecord } from '../shared/hooks/use_entity_from_store';

jest.mock('@kbn/entity-store/public', () => ({
  useEntityStoreEuidApi: jest.fn(() => null),
}));

const mockUseIsExperimentalFeatureEnabled = jest.fn();
jest.mock('../../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: () => mockUseIsExperimentalFeatureEnabled(),
}));

const mockUseKibana = jest.fn();
jest.mock('../../../common/lib/kibana', () => ({
  useKibana: () => mockUseKibana(),
}));

// Render additionalItems inline so tests can assert on them without opening the popover.
jest.mock('../shared/components/take_action', () => ({
  TakeAction: ({
    additionalItems,
  }: {
    additionalItems?: (close: () => void) => React.ReactElement[];
  }) => <div data-test-subj="mockTakeAction">{additionalItems?.(() => {}) ?? []}</div>,
}));

jest.mock('../../../entity_analytics/components/ai_assistant_button/ai_assistant_button', () => ({
  AiAssistantButton: () => <div data-test-subj="mockAiAssistantButton" />,
}));

// Render the real menu items but with minimal markup — footer tests only care about presence.
jest.mock('../../../cases/attachments/entity/components/add_to_new_case', () => ({
  AddToNewCase: ({ 'data-test-subj': testSubj }: { 'data-test-subj'?: string }) => (
    <div data-test-subj={testSubj} />
  ),
}));
jest.mock('../../../cases/attachments/entity/components/add_to_existing_case', () => ({
  AddToExistingCase: ({ 'data-test-subj': testSubj }: { 'data-test-subj'?: string }) => (
    <div data-test-subj={testSubj} />
  ),
}));

const SERVICE_IDENTITY_FIELDS = { 'service.name': 'service-alice' };
const ENTITY_STORE_RECORD = {
  entity: { id: 'entity-store-id-abc' },
} as unknown as EntityStoreRecord;

const renderFooter = (
  entityAttachmentsEnabled: boolean,
  attachmentsEnabled: boolean,
  entity?: EntityStoreRecord,
  identityFields = SERVICE_IDENTITY_FIELDS
) => {
  mockUseIsExperimentalFeatureEnabled.mockReturnValue(entityAttachmentsEnabled);
  mockUseKibana.mockReturnValue({
    services: {
      cases: {
        config: { attachmentsEnabled },
        helpers: {
          canUseCases: () => ({ create: true, update: true, createComment: true }),
        },
      },
    },
  });

  return render(
    <TestProviders>
      <ServicePanelFooter identityFields={identityFields} entity={entity} />
    </TestProviders>
  );
};

describe('ServicePanelFooter – entity attachment actions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders Add to new case and Add to existing case when all conditions are met', () => {
    renderFooter(true, true, ENTITY_STORE_RECORD);

    expect(screen.getByTestId(ADD_TO_NEW_CASE_TEST_ID)).toBeInTheDocument();
    expect(screen.getByTestId(ADD_TO_EXISTING_CASE_TEST_ID)).toBeInTheDocument();
  });

  it('renders no case actions when entityAttachmentsEnabled is false', () => {
    renderFooter(false, true, ENTITY_STORE_RECORD);

    expect(screen.queryByTestId(ADD_TO_NEW_CASE_TEST_ID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ADD_TO_EXISTING_CASE_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders no case actions when cases attachmentsEnabled config is false', () => {
    renderFooter(true, false, ENTITY_STORE_RECORD);

    expect(screen.queryByTestId(ADD_TO_NEW_CASE_TEST_ID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ADD_TO_EXISTING_CASE_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders no case actions when there is no entity store record (entityStoreId is undefined)', () => {
    renderFooter(true, true, undefined);

    expect(screen.queryByTestId(ADD_TO_NEW_CASE_TEST_ID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ADD_TO_EXISTING_CASE_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders no case actions when serviceName resolves to an empty string', () => {
    renderFooter(true, true, ENTITY_STORE_RECORD, { 'service.name': '' });

    expect(screen.queryByTestId(ADD_TO_NEW_CASE_TEST_ID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ADD_TO_EXISTING_CASE_TEST_ID)).not.toBeInTheDocument();
  });
});
