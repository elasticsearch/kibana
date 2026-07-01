/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import type { TimelineEventsDetailsItem } from '@kbn/timelines-plugin/common';
import { render } from '@testing-library/react';
import React from 'react';
import { AISummarySection } from './ai_summary_section';
import { AI_SUMMARY_SECTION_TEST_ID } from './test_ids';
import { useEventDetails } from '../../../../flyout/document_details/shared/hooks/use_event_details';
import { getRawData } from '../../../../assistant/helpers';

const MOCK_DOCUMENT_SUMMARY_SECTION_STUB_TEST_ID = 'document-summary-section-stub';

const mockDocumentSummarySection = jest.fn();

jest.mock('./document_summary_section', () => ({
  DocumentSummarySection: (props: Record<string, unknown>) => {
    mockDocumentSummarySection(props);
    return (
      <div
        data-test-subj={
          (props['data-test-subj'] as string) ?? MOCK_DOCUMENT_SUMMARY_SECTION_STUB_TEST_ID
        }
      />
    );
  },
}));

jest.mock('../../../../flyout/document_details/shared/hooks/use_event_details', () => ({
  useEventDetails: jest.fn(),
}));

const mockDataFormattedForFieldBrowser: TimelineEventsDetailsItem[] = [
  {
    category: 'host',
    field: 'host.name',
    values: ['test-host'],
    originalValue: ['test-host'],
    isObjectArray: false,
  },
  {
    category: 'user',
    field: 'user.name',
    values: ['test-user'],
    originalValue: ['test-user'],
    isObjectArray: false,
  },
];

const createMockHit = (overrides: Record<string, unknown> = {}): DataTableRecord =>
  ({
    id: 'event-id-1',
    raw: {
      _id: 'event-id-1',
      _index: 'alerts-index',
    },
    flattened: {
      'event.kind': 'signal',
      ...overrides,
    },
    isAnchor: false,
  } as unknown as DataTableRecord);

describe('AISummarySection', () => {
  const mockUseEventDetails = jest.mocked(useEventDetails);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseEventDetails.mockReturnValue({
      browserFields: {},
      dataAsNestedObject: null,
      dataFormattedForFieldBrowser: mockDataFormattedForFieldBrowser,
      getFieldsData: jest.fn(),
      loading: false,
      refetchFlyoutData: jest.fn(),
      searchHit: undefined,
    });
  });

  it('renders the shared DocumentSummarySection for an alert with the wrapper data-test-subj', () => {
    const { getByTestId } = render(<AISummarySection hit={createMockHit()} />);

    expect(getByTestId(AI_SUMMARY_SECTION_TEST_ID)).toBeInTheDocument();
  });

  it('forwards the document id and prompt context derived from the document hit', async () => {
    const hit = createMockHit();
    render(<AISummarySection hit={hit} />);

    expect(mockDocumentSummarySection).toHaveBeenCalledTimes(1);
    const props = mockDocumentSummarySection.mock.calls[0][0];

    expect(props.documentId).toBe(hit.raw._id);
    expect(props['data-test-subj']).toBe(AI_SUMMARY_SECTION_TEST_ID);
    expect(typeof props.getPromptContext).toBe('function');

    await expect(props.getPromptContext()).resolves.toEqual(
      getRawData(mockDataFormattedForFieldBrowser)
    );
  });

  it('falls back to an empty payload when useEventDetails returns no fields', async () => {
    mockUseEventDetails.mockReturnValue({
      browserFields: {},
      dataAsNestedObject: null,
      dataFormattedForFieldBrowser: null,
      getFieldsData: jest.fn(),
      loading: false,
      refetchFlyoutData: jest.fn(),
      searchHit: undefined,
    });

    render(<AISummarySection hit={createMockHit()} />);

    const props = mockDocumentSummarySection.mock.calls[0][0];
    await expect(props.getPromptContext()).resolves.toEqual({});
  });

  it('renders nothing when the document is not an alert', () => {
    const eventHit = createMockHit({ 'event.kind': 'event' });

    const { queryByTestId } = render(<AISummarySection hit={eventHit} />);

    expect(queryByTestId(AI_SUMMARY_SECTION_TEST_ID)).not.toBeInTheDocument();
    expect(mockDocumentSummarySection).not.toHaveBeenCalled();
  });
});
