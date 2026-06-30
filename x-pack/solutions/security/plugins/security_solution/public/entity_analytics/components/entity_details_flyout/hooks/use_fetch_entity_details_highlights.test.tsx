/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act } from '@testing-library/react';
import type { AnonymizationFieldResponse, Replacements } from '@kbn/elastic-assistant-common';
import { useFetchEntityDetailsHighlights } from './use_fetch_entity_details_highlights';
import { useKibana } from '../../../../common/lib/kibana/kibana_react';
import type { EntityHighlightsResponse } from '../types';

const mockFetchEntityDetailsHighlights = jest.fn();
const mockAddError = jest.fn();
const mockInferenceOutput = jest.fn();

const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;

jest.mock('../../../api/api', () => ({
  useEntityAnalyticsRoutes: () => ({
    fetchEntityDetailsHighlights: mockFetchEntityDetailsHighlights,
  }),
}));

jest.mock('../../../../common/hooks/use_app_toasts', () => ({
  useAppToasts: () => ({
    addError: mockAddError,
  }),
}));

jest.mock('../../../../common/lib/kibana/kibana_react', () => ({
  useKibana: jest.fn(),
}));

const mockProps = {
  connectorId: 'test-connector-id',
  anonymizationFields: [
    {
      id: 'field1',
      field: 'test.field',
      allowed: true,
      anonymized: false,
    },
  ] as AnonymizationFieldResponse[],
  entityType: 'user',
  entityIdentifier: 'test-user',
};

const mockEntityDetailsResponse = {
  summary: { entitySummary: 'Test summary data' },
  replacements: { 'anonymized-user': 'test-user' } as Replacements,
  prompt: 'Test prompt for AI',
};

const mockSuccessfulInferenceOutput: {
  output: EntityHighlightsResponse;
  content: string;
} = {
  output: {
    highlights: [{ title: 'Test Highlight', text: 'Test highlight text' }],
    recommendedActions: ['Action 1', 'Action 2'],
  },
  content: 'AI generated analysis of the entity',
};

describe('useFetchEntityDetailsHighlights', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseKibana.mockReturnValue({
      services: {
        inference: {
          output: mockInferenceOutput,
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it('returns the expected initial state and functions', () => {
    const { result } = renderHook(() => useFetchEntityDetailsHighlights(mockProps));

    expect(result.current).toEqual({
      fetchEntityHighlights: expect.any(Function),
      isChatLoading: false,
      abortStream: expect.any(Function),
      result: null,
      error: null,
    });
  });

  it('successfully fetches entity highlights and sends message to AI', async () => {
    mockFetchEntityDetailsHighlights.mockResolvedValueOnce(mockEntityDetailsResponse);
    mockInferenceOutput.mockResolvedValueOnce(mockSuccessfulInferenceOutput);

    const { result } = renderHook(() => useFetchEntityDetailsHighlights(mockProps));

    await act(async () => {
      await result.current.fetchEntityHighlights();
    });

    expect(mockFetchEntityDetailsHighlights).toHaveBeenCalledWith({
      entityType: 'user',
      entityIdentifier: 'test-user',
      anonymizationFields: mockProps.anonymizationFields,
      from: expect.any(Number),
      to: expect.any(Number),
      connectorId: 'test-connector-id',
    });

    expect(mockInferenceOutput).toHaveBeenCalledWith({
      id: 'entity-highlights',
      connectorId: 'test-connector-id',
      schema: expect.any(Object),
      system: 'Test prompt for AI',
      input: expect.stringContaining('Context:'),
      abortSignal: expect.any(AbortSignal),
    });

    // Verify the result state is updated
    expect(result.current.result).toEqual({
      summaryAsText: JSON.stringify(mockEntityDetailsResponse.summary),
      response: mockSuccessfulInferenceOutput.output,
      replacements: mockEntityDetailsResponse.replacements,
      generatedAt: expect.any(Number),
    });

    // Verify no errors were added
    expect(mockAddError).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('handles error from fetchEntityDetailsHighlights API', async () => {
    const apiError = new Error('API Error');
    mockFetchEntityDetailsHighlights.mockRejectedValueOnce(apiError);

    const { result } = renderHook(() => useFetchEntityDetailsHighlights(mockProps));

    await act(async () => {
      await result.current.fetchEntityHighlights();
    });

    expect(mockAddError).toHaveBeenCalledWith(apiError, {
      title: 'Failed to run LLM',
    });

    // Verify inference.output was not called due to early return
    expect(mockInferenceOutput).not.toHaveBeenCalled();

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('handles error from inference.output', async () => {
    const inferenceError = new Error('Error processing request');
    mockFetchEntityDetailsHighlights.mockResolvedValueOnce(mockEntityDetailsResponse);
    mockInferenceOutput.mockRejectedValueOnce(inferenceError);

    const { result } = renderHook(() => useFetchEntityDetailsHighlights(mockProps));

    await act(async () => {
      await result.current.fetchEntityHighlights();
    });

    expect(mockFetchEntityDetailsHighlights).toHaveBeenCalled();

    expect(mockInferenceOutput).toHaveBeenCalled();

    expect(mockAddError).toHaveBeenCalledWith(inferenceError, {
      title: 'Failed to run LLM',
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('returns early when fetchEntityDetailsHighlights returns null summary', async () => {
    mockFetchEntityDetailsHighlights.mockResolvedValueOnce({
      summary: null,
      replacements: mockEntityDetailsResponse.replacements,
      prompt: mockEntityDetailsResponse.prompt,
    });

    const { result } = renderHook(() => useFetchEntityDetailsHighlights(mockProps));

    await act(async () => {
      await result.current.fetchEntityHighlights();
    });

    expect(mockInferenceOutput).not.toHaveBeenCalled();
    expect(result.current.result).toBeNull();
  });

  it('returns early when fetchEntityDetailsHighlights returns null replacements', async () => {
    mockFetchEntityDetailsHighlights.mockResolvedValueOnce({
      summary: mockEntityDetailsResponse.summary,
      replacements: null,
      prompt: mockEntityDetailsResponse.prompt,
    });

    const { result } = renderHook(() => useFetchEntityDetailsHighlights(mockProps));

    await act(async () => {
      await result.current.fetchEntityHighlights();
    });

    expect(mockInferenceOutput).not.toHaveBeenCalled();
    expect(result.current.result).toBeNull();
  });

  it('returns early when fetchEntityDetailsHighlights returns null prompt', async () => {
    mockFetchEntityDetailsHighlights.mockResolvedValueOnce({
      summary: mockEntityDetailsResponse.summary,
      replacements: mockEntityDetailsResponse.replacements,
      prompt: null,
    });

    const { result } = renderHook(() => useFetchEntityDetailsHighlights(mockProps));

    await act(async () => {
      await result.current.fetchEntityHighlights();
    });

    expect(mockInferenceOutput).not.toHaveBeenCalled();
    expect(result.current.result).toBeNull();
  });

  it('formats the input correctly with entity context', async () => {
    mockFetchEntityDetailsHighlights.mockResolvedValueOnce(mockEntityDetailsResponse);
    mockInferenceOutput.mockResolvedValueOnce(mockSuccessfulInferenceOutput);

    const { result } = renderHook(() => useFetchEntityDetailsHighlights(mockProps));

    await act(async () => {
      await result.current.fetchEntityHighlights();
    });

    const expectedInput = `Context:
            EntityType: user,
            EntityIdentifier: anonymized-user,
          ${JSON.stringify(mockEntityDetailsResponse.summary)}`;

    expect(mockInferenceOutput).toHaveBeenCalledWith({
      id: 'entity-highlights',
      connectorId: 'test-connector-id',
      schema: expect.any(Object),
      system: 'Test prompt for AI',
      input: expectedInput,
      abortSignal: expect.any(AbortSignal),
    });
  });
});
