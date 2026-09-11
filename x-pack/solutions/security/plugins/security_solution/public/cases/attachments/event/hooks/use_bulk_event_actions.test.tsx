/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act } from '@testing-library/react';
import {
  useBulkAddEventsToCaseActions,
  BULK_ADD_TO_CASE_ACTION_ID,
} from './use_bulk_event_actions';
import { TestProviders } from '../../../../common/mock';
import type { TimelineItem } from '@kbn/timelines-plugin/common';
import { SECURITY_EVENT_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';

const mockOpenExistingCase = jest.fn();
const mockCanUseCases = jest.fn(() => ({
  create: true,
  createComment: true,
  read: true,
  update: false,
}));
const mockGetCasesContext = jest.fn(() => ({}));
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

  it('returns one action when permissions and services are available', () => {
    const { result } = renderHook(() => useBulkAddEventsToCaseActions({ clearSelection }), {
      wrapper: TestProviders,
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].label).toBeDefined();
    // Key must match BULK_ADD_TO_CASE_ACTION_ID so the menu component's icon map hits it
    expect(result.current[0].key).toBe(BULK_ADD_TO_CASE_ACTION_ID);
  });

  it('returns one action when the user can only update existing cases', () => {
    mockCanUseCases.mockReturnValueOnce({
      create: false,
      createComment: true,
      read: true,
      update: true,
    });
    const { result } = renderHook(() => useBulkAddEventsToCaseActions({ clearSelection }), {
      wrapper: TestProviders,
    });

    expect(result.current).toHaveLength(1);
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
      result.current[0].onClick(events);
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

    const mappedEvents = mockOpenExistingCase.mock.lastCall[0].getAttachments();
    expect(mappedEvents).toEqual([
      {
        type: SECURITY_EVENT_ATTACHMENT_TYPE,
        attachmentId: '1',
        metadata: { index: 'foo' },
      },
    ]);
  });

  it('returns empty array if permissions are missing', () => {
    mockCanUseCases.mockReturnValueOnce({
      create: false,
      createComment: false,
      read: false,
      update: false,
    });
    const { result } = renderHook(() => useBulkAddEventsToCaseActions({ clearSelection }), {
      wrapper: TestProviders,
    });
    expect(result.current).toEqual([]);
  });
});
