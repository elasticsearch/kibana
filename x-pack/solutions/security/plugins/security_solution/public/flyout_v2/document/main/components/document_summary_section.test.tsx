/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { TestProviders } from '../../../../common/mock';
import {
  DOCUMENT_SUMMARY_SECTION_TEST_ID,
  DocumentSummarySection,
} from './document_summary_section';
import { DOCUMENT_SUMMARY_OPTIONS_MENU_BUTTON_TEST_ID } from './document_summary_options_menu';
import { useKibana as mockUseKibana } from '../../../../common/lib/kibana/__mocks__';

jest.mock('../../../../common/hooks/use_ai_connectors', () => ({
  useAIConnectors: jest.fn().mockReturnValue({
    aiConnectors: [
      {
        id: 'test-connector-id',
        name: 'Test Connector',
        actionTypeId: '.gen-ai',
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

jest.mock('../hooks/use_anonymization_toggle', () => ({
  useAnonymizationToggle: () => ({
    showAnonymizedValues: false,
    setShowAnonymizedValues: jest.fn(),
  }),
}));

const mockedUseKibana = {
  ...mockUseKibana(),
  services: {
    ...mockUseKibana().services,
    application: {
      ...mockUseKibana().services.application,
      capabilities: {
        management: {
          kibana: {
            settings: true,
          },
        },
      },
    },
    uiSettings: {
      get: jest.fn().mockReturnValue('default-connector-id'),
    },
    featureFlags: {
      getBooleanValue: jest.fn().mockReturnValue(false),
    },
  },
};
jest.mock('../../../../common/lib/kibana', () => {
  return {
    ...jest.requireActual('../../../../common/lib/kibana'),
    useKibana: () => mockedUseKibana,
  };
});

describe('DocumentSummarySection', () => {
  it('should render the AI summary section with title, sparkles icon, options menu, and trailing rule', () => {
    const getPromptContext = jest.fn();

    const { getByTestId, container } = render(
      <TestProviders>
        <DocumentSummarySection documentId="test-document-id" getPromptContext={getPromptContext} />
      </TestProviders>
    );

    const section = getByTestId(DOCUMENT_SUMMARY_SECTION_TEST_ID);
    expect(section).toHaveTextContent('AI summary');
    // The section title renders the sparkles icon next to the text (mirrors
    // the "Entity summary" section).
    expect(section.querySelector('[data-euiicon-type="sparkles"]')).toBeInTheDocument();
    expect(getByTestId(DOCUMENT_SUMMARY_OPTIONS_MENU_BUTTON_TEST_ID)).toBeInTheDocument();
    // The section owns its own trailing horizontal rule for parity with
    // the entity summary section.
    expect(container.querySelector('hr')).toBeInTheDocument();
  });

  it('should render with custom data-test-subj', () => {
    const getPromptContext = jest.fn();

    const { getByTestId } = render(
      <TestProviders>
        <DocumentSummarySection
          documentId="test-document-id"
          getPromptContext={getPromptContext}
          data-test-subj="custom-test-id"
        />
      </TestProviders>
    );

    expect(getByTestId('custom-test-id')).toHaveTextContent('AI summary');
  });
});
