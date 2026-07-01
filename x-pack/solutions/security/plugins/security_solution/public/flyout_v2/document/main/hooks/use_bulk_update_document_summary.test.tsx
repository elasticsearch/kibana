/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { renderHook, act } from '@testing-library/react';
import { useBulkUpdateDocumentSummary } from './use_bulk_update_document_summary';
import { useAssistantContext } from '@kbn/elastic-assistant';

jest.mock('@kbn/elastic-assistant', () => ({
  useAssistantContext: jest.fn(),
}));

describe('useBulkUpdateDocumentSummary', () => {
  const mockHttp = {
    fetch: jest.fn(),
  };
  const mockToasts = {
    addDanger: jest.fn(),
    addError: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAssistantContext as jest.Mock).mockReturnValue({
      http: mockHttp,
      toasts: mockToasts,
    });
  });

  it('should call the API with the correct parameters', async () => {
    const { result } = renderHook(() => useBulkUpdateDocumentSummary());

    const documentSummary = { update: [], create: [] };
    mockHttp.fetch.mockResolvedValue({ success: true });

    await act(async () => {
      await result.current.bulkUpdate({ documentSummary });
    });

    expect(mockHttp.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(documentSummary),
      })
    );
  });

  it('should handle API errors and show a toast message', async () => {
    const { result } = renderHook(() => useBulkUpdateDocumentSummary());

    const documentSummary = { update: [], create: [] };
    const errorMessage = 'API error';
    mockHttp.fetch.mockRejectedValue(new Error(errorMessage));

    await act(async () => {
      await result.current.bulkUpdate({ documentSummary });
    });

    expect(mockToasts.addDanger).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update alert summaries')
    );
  });

  it('should abort the request when abortStream is called', () => {
    const { result } = renderHook(() => useBulkUpdateDocumentSummary());

    act(() => {
      result.current.abortStream();
    });

    expect(mockHttp.fetch).not.toHaveBeenCalled();
  });
});
