/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act } from '@testing-library/react';
import { useBulkAddEventsToCaseActions } from './use_bulk_event_actions';
import { TestProviders } from '../../../../common/mock';
import type { TimelineItem } from '@kbn/timelines-plugin/common';
import { SECURITY_EVENT_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';

const mockOpenNewCase = jest.fn();
const mockOpenExistingCase = jest.fn();
const mockCanUseCases = jest.fn(() => ({ create: true, read: true }));
const mockGetCasesContext = jest.fn(() => ({}));
const mockUseCasesAddToNewCaseFlyout = jest.fn(() => ({
  open: mockOpenNewCase,
}));
const mockUseCasesAddToExistingCaseModal = jest.fn(() => ({
  open: mockOpenExistingCase,
}));

jest.mock('../../../../common/lib/kibana', () => ({
  useKibana: () => ({
    services: {
      cases: {
        helpers: {
          canUseCases: mockCanUseCases,
        },
        ui: {
          getCasesContext: mockGetCasesContext,
        },
        hooks: {
          useCasesAddToNewCaseFlyout: mockUseCasesAddToNewCaseFlyout,
          useCasesAddToExistingCaseModal: mockUseCasesAddToExistingCaseModal,
        },
      },
    },
  }),
}));

describe('useBulkAddEventsToCaseActions', () => {
  const clearSelection = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns two actions when permissions and services are available', () => {
    const { result } = renderHook(() => useBulkAddEventsToCaseActions({ clearSelection }), {
      wrapper: TestProviders,
    });
    expect(result.current).toHaveLength(2);
    expect(result.current[0].label).toBeDefined();
    expect(result.current[1].label).toBeDefined();
  });

  it('calls createCaseFlyout.open with correct attachments', () => {
    const { result } = renderHook(() => useBulkAddEventsToCaseActions({ clearSelection }), {
      wrapper: TestProviders,
    });
    const events = [
      { _id: '1', _index: 'foo' },
      { _id: '2', _index: 'bar' },
    ] as unknown as TimelineItem[];
    act(() => {
      result.current[0].onClick(events);
    });
    expect(mockOpenNewCase).toHaveBeenCalledWith({
      attachments: [
        {
          type: SECURITY_EVENT_ATTACHMENT_TYPE,
          attachmentId: ['1', '2'],
          metadata: { index: ['foo', 'bar'] },
        },
      ],
    });
  });

  it('calls selectCaseModal.open with correct getAttachments', () => {
    const { result } = renderHook(() => useBulkAddEventsToCaseActions({ clearSelection }), {
      wrapper: TestProviders,
    });
    const events = [
      { _id: '1', _index: 'foo' },
      { _id: '2', _index: 'bar' },
    ] as unknown as TimelineItem[];
    act(() => {
      result.current[1].onClick(events);
    });
    expect(mockOpenExistingCase).toHaveBeenCalled();
    const mappedEvents = mockOpenExistingCase.mock.lastCall[0].getAttachments();
    expect(mappedEvents).toEqual([
      {
        type: SECURITY_EVENT_ATTACHMENT_TYPE,
        attachmentId: ['1', '2'],
        metadata: { index: ['foo', 'bar'] },
      },
    ]);
  });

  it('normalizes a single selected event to scalar attachment values', () => {
    const { result } = renderHook(() => useBulkAddEventsToCaseActions({ clearSelection }), {
      wrapper: TestProviders,
    });
    const events = [{ _id: '1', _index: 'foo' }] as unknown as TimelineItem[];

    act(() => {
      result.current[0].onClick(events);
    });

    expect(mockOpenNewCase).toHaveBeenCalledWith({
      attachments: [
        {
          type: SECURITY_EVENT_ATTACHMENT_TYPE,
          attachmentId: '1',
          metadata: { index: 'foo' },
        },
      ],
    });
  });

  it('returns empty array if permissions are missing', () => {
    mockCanUseCases.mockReturnValueOnce({ create: false, read: false });
    const { result } = renderHook(() => useBulkAddEventsToCaseActions({ clearSelection }), {
      wrapper: TestProviders,
    });
    expect(result.current).toEqual([]);
  });
});
