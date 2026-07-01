/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useDocumentSummary } from './use_document_summary';
import type { PromptContext } from '@kbn/elastic-assistant';
import { useFetchAnonymizationFields } from '@kbn/elastic-assistant/impl/assistant/api/anonymization_fields/use_fetch_anonymization_fields';
import { useChatComplete } from '@kbn/elastic-assistant/impl/assistant/api/chat_complete/use_chat_complete';
import { useFetchDocumentSummary } from './use_fetch_document_summary';
import { useBulkUpdateDocumentSummary } from './use_bulk_update_document_summary';

jest.mock('@kbn/elastic-assistant/impl/assistant/api/chat_complete/use_chat_complete');
jest.mock(
  '@kbn/elastic-assistant/impl/assistant/api/anonymization_fields/use_fetch_anonymization_fields'
);
jest.mock('./use_fetch_document_summary');
jest.mock('./use_bulk_update_document_summary');
const promptContext: PromptContext = {
  category: 'alert',
  description: 'Alert summary',
  getPromptContext: jest
    .fn()
    .mockResolvedValue('{ host.name: "test-host", more.data: 123, "user.name": "test-user"}'),
  id: '_promptContextId',
  suggestedUserPrompt: '_suggestedUserPrompt',
  tooltip: '_tooltip',
  replacements: { 'host.name': '12345' },
};
describe('useDocumentSummary', () => {
  const mockSendMessage = jest.fn();
  const mockAbortStream = jest.fn();
  const mockRefetchSummary = jest.fn();
  const mockBulkUpdate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useChatComplete as jest.Mock).mockReturnValue({
      sendMessage: mockSendMessage,
      abortStream: mockAbortStream,
    });

    (useFetchAnonymizationFields as jest.Mock).mockReturnValue({
      data: [],
      isFetched: true,
    });

    (useFetchDocumentSummary as jest.Mock).mockReturnValue({
      data: { data: [] },
      refetch: mockRefetchSummary,
      isFetched: true,
    });

    (useBulkUpdateDocumentSummary as jest.Mock).mockReturnValue({
      bulkUpdate: mockBulkUpdate,
    });
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() =>
      useDocumentSummary({
        documentId: 'test-document-id',
        defaultConnectorId: 'test-connector-id',
        promptContext,
        showAnonymizedValues: false,
      })
    );

    expect(result.current.summary).toBe('No summary available');
    expect(result.current.hasSummary).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.messageAndReplacements).toBeNull();
    expect(result.current.recommendedActions).toBeUndefined();
  });

  it('should fetch AI summary when fetchAISummary is called', async () => {
    (useFetchDocumentSummary as jest.Mock)
      .mockReturnValueOnce({
        data: {
          data: [{ id: 'summary-id', summary: '', replacements: {} }],
          prompt: 'Generate an alert summary!',
        },
        refetch: mockRefetchSummary,
        isFetched: true,
      })
      .mockReturnValue({
        data: {
          data: [
            {
              id: 'summary-id',
              summary: 'Generated summary',
              recommendedActions: 'Generated actions',
              replacements: {},
            },
          ],
          prompt: 'Generate an alert summary!',
        },
        refetch: mockRefetchSummary,
        isFetched: true,
      });

    const mockResponse = {
      response: JSON.stringify({
        summary: 'Generated summary',
        recommendedActions: 'Generated actions',
      }),
      isError: false,
    };

    const { result } = renderHook(() =>
      useDocumentSummary({
        documentId: 'test-document-id',
        defaultConnectorId: 'test-connector-id',
        promptContext,
        showAnonymizedValues: false,
      })
    );
    const expectedMessageAndReplacements = {
      message:
        'CONTEXT:\n"""\n{ host.name: "test-host", more.data: 123, "user.name": "test-user"}\n"""\n\nGenerate an alert summary!',
      replacements: { 'host.name': '12345' },
    };
    await waitFor(() => {
      expect(result.current.messageAndReplacements).toEqual(expectedMessageAndReplacements);
    });

    mockSendMessage.mockResolvedValue(mockResponse);

    await act(async () => {
      await result.current.fetchAISummary();
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      ...expectedMessageAndReplacements,
      promptIds: { promptGroupId: 'ease', promptId: 'alertSummarySystemPrompt' },
      query: { content_references_disabled: true },
    });

    expect(mockBulkUpdate).toHaveBeenCalledWith({
      documentSummary: {
        update: [
          {
            id: 'summary-id',
            summary: 'Generated summary',
            recommendedActions: 'Generated actions',
            replacements: { 'host.name': '12345' },
          },
        ],
      },
    });

    expect(mockRefetchSummary).toHaveBeenCalled();
    expect(result.current.summary).toBe('Generated summary');
    expect(result.current.recommendedActions).toBe('Generated actions');
  });

  it('should abort stream on unmount', () => {
    const { unmount } = renderHook(() =>
      useDocumentSummary({
        documentId: 'test-document-id',
        defaultConnectorId: 'test-connector-id',
        promptContext,
        showAnonymizedValues: false,
      })
    );

    unmount();

    expect(mockAbortStream).toHaveBeenCalled();
  });
});
