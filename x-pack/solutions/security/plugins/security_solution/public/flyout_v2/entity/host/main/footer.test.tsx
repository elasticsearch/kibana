/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TestProviders } from '../../../../common/mock';
import { Footer } from './footer';
import type { EntityStoreRecord } from '../../../../flyout/entity_details/shared/hooks/use_entity_from_store';
import { ADD_TO_CASE_TEST_ID } from '../../../../../common/cases/attachments/entity/test_ids';

jest.mock('@kbn/entity-store/public', () => ({
  useEntityStoreEuidApi: jest.fn(() => null),
}));

jest.mock('../../../../common/hooks/is_in_security_app', () => ({
  useIsInSecurityApp: jest.fn(() => true),
}));

const mockUseIsExperimentalFeatureEnabled = jest.fn();
jest.mock('../../../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: () => mockUseIsExperimentalFeatureEnabled(),
}));

const mockUseKibana = jest.fn();
jest.mock('../../../../common/lib/kibana', () => ({
  useKibana: () => mockUseKibana(),
}));

// Render additionalItems inline so tests can assert on them without opening the popover.
jest.mock('../../../../flyout/entity_details/shared/components/take_action', () => ({
  TakeAction: ({
    additionalItems,
  }: {
    additionalItems?: (close: () => void) => React.ReactElement[];
  }) => <div data-test-subj="mockTakeAction">{additionalItems?.(() => {}) ?? []}</div>,
}));

jest.mock(
  '../../../../entity_analytics/components/ai_assistant_button/ai_assistant_button',
  () => ({
    AiAssistantButton: ({ entityName }: { entityName: string }) => (
      <div data-test-subj="mockAiAssistantButton">{entityName}</div>
    ),
  })
);

jest.mock('../../../../cases/attachments/entity/components/add_to_case', () => ({
  AddToCase: ({ 'data-test-subj': testSubj }: { 'data-test-subj': string }) => (
    <div data-test-subj={testSubj} />
  ),
}));

const HOST_IDENTITY_FIELDS = { 'host.name': 'host-alice' };
const ENTITY_STORE_RECORD = {
  entity: { id: 'entity-store-id-abc' },
} as unknown as EntityStoreRecord;

const renderFooter = (
  entityAttachmentsEnabled: boolean,
  attachmentsEnabled: boolean,
  entity?: EntityStoreRecord,
  identityFields: Record<string, string> = HOST_IDENTITY_FIELDS,
  hostName = 'host-alice'
) => {
  mockUseIsExperimentalFeatureEnabled.mockReturnValue(entityAttachmentsEnabled);
  mockUseKibana.mockReturnValue({
    services: {
      cases: {
        config: { attachmentsEnabled },
        helpers: {
          canUseCases: () => ({ create: true, update: true, createComment: true, read: true }),
        },
      },
    },
  });

  return render(
    <TestProviders>
      <Footer hostName={hostName} identityFields={identityFields} entity={entity} />
    </TestProviders>
  );
};

describe('Footer – entity attachment actions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the Add to case action when all conditions are met', () => {
    renderFooter(true, true, ENTITY_STORE_RECORD);

    expect(screen.getByTestId(ADD_TO_CASE_TEST_ID)).toBeInTheDocument();
  });

  it('renders no case actions when entityAttachmentsEnabled is false', () => {
    renderFooter(false, true, ENTITY_STORE_RECORD);

    expect(screen.queryByTestId(ADD_TO_CASE_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders no case actions when cases attachmentsEnabled config is false', () => {
    renderFooter(true, false, ENTITY_STORE_RECORD);

    expect(screen.queryByTestId(ADD_TO_CASE_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders no case actions when there is no entity store record (entityStoreId is undefined)', () => {
    renderFooter(true, true, undefined);

    expect(screen.queryByTestId(ADD_TO_CASE_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders no case actions when hostName resolves to an empty string', () => {
    renderFooter(true, true, ENTITY_STORE_RECORD, { 'host.name': '' });

    expect(screen.queryByTestId(ADD_TO_CASE_TEST_ID)).not.toBeInTheDocument();
  });
});

describe('Footer – AiAssistantButton entity name', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes the raw hostName prop, not a value derived from identityFields', () => {
    // Regression for security-team/kibana#277619: when identityFields resolves to a
    // higher-ranked EUID field (e.g. host.id) with no host.name key at all, the footer must
    // still send the flyout's display name to "Add to chat" — the same value the risk-score
    // tab's AiAssistantButton sends for this entity — not the id.
    renderFooter(
      true,
      true,
      ENTITY_STORE_RECORD,
      { 'host.id': 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
      'host-alice'
    );

    expect(screen.getByTestId('mockAiAssistantButton')).toHaveTextContent('host-alice');
  });
});
