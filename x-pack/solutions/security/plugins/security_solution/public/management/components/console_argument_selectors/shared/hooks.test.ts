/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import type { EuiSelectableOption } from '@elastic/eui';
import { usePendingActionsOptions } from './hooks';
import { useDateFormat, useTimeZone } from '../../../../common/lib/kibana';
import type { ActionListApiResponse, ActionDetails } from '../../../../../common/endpoint/types';

const getOptionValue = (option: EuiSelectableOption): string => {
  // Since we know our options have a value property, we can safely access it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (option as any).value as string;
};

// Mock the date format and timezone hooks
jest.mock('../../../../common/lib/kibana');
const mockUseDateFormat = useDateFormat as jest.Mock;
const mockUseTimeZone = useTimeZone as jest.Mock;

describe('usePendingActionsOptions hook', () => {
  const mockDateFormat = 'MMM D, YYYY @ HH:mm:ss.SSS';
  const mockTimeZone = 'UTC';

  beforeEach(() => {
    mockUseDateFormat.mockReturnValue(mockDateFormat);
    mockUseTimeZone.mockReturnValue(mockTimeZone);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockActionDetails = (overrides: Partial<ActionDetails> = {}): ActionDetails => ({
    id: 'action-123-abc',
    command: 'isolate',
    agents: ['agent-1'],
    hosts: {
      'agent-1': { name: 'test-host' },
    },
    agentState: {
      'agent-1': {
        isCompleted: false,
        wasSuccessful: false,
        wasCanceled: false,
        errors: undefined,
        completedAt: undefined,
      },
    },
    isExpired: false,
    isCompleted: false,
    wasSuccessful: false,
    wasCanceled: false,
    startedAt: '2023-11-01T10:00:00.000Z',
    completedAt: undefined,
    status: 'pending',
    createdBy: 'test-user',
    agentType: 'endpoint',
    errors: undefined,
    ...overrides,
  });

  const createMockApiResponse = (
    data: ActionDetails[] = [createMockActionDetails()]
  ): ActionListApiResponse => ({
    page: 1,
    pageSize: 10,
    total: data.length,
    data,
    agentTypes: [],
    elasticAgentIds: undefined,
    endDate: undefined,
    startDate: undefined,
    userIds: undefined,
    commands: undefined,
    statuses: undefined,
  });

  describe('basic functionality', () => {
    it('should return empty array when response is null', () => {
      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: null,
        })
      );

      expect(result.current).toEqual([]);
    });

    it('should return empty array when response is empty array', () => {
      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [],
        })
      );

      expect(result.current).toEqual([]);
    });

    it('should return empty array when response has no data', () => {
      const emptyResponse = createMockApiResponse([]);
      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [emptyResponse],
        })
      );

      expect(result.current).toEqual([]);
    });

    it('should return empty array when response data is not an array', () => {
      const invalidResponse = createMockApiResponse();
      // Intentionally make data invalid for testing error handling
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (invalidResponse as any).data = null;
      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [invalidResponse],
        })
      );

      expect(result.current).toEqual([]);
    });
  });

  describe('option formatting', () => {
    it('should transform single pending action to correct option format', () => {
      const mockAction = createMockActionDetails();
      const mockResponse = createMockApiResponse([mockAction]);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
        })
      );

      expect(result.current).toHaveLength(1);
      const option = result.current[0];
      expect(option).toMatchObject({
        label: 'isolate',
        data: mockAction,
        checked: undefined,
        disabled: true, // Default when no privilege checker
      });
      // Type assertion for accessing value property
      expect(getOptionValue(option)).toBe('action-123-abc');
    });

    it('should include properly formatted description with timestamp', () => {
      const mockAction = createMockActionDetails({
        startedAt: '2023-11-01T10:00:00.000Z',
      });
      const mockResponse = createMockApiResponse([mockAction]);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
        })
      );

      expect(result.current[0].description).toContain(
        'Action id action-123-abc submitted by test-user on'
      );
      // Should include the formatted timestamp
      expect(result.current[0].description).toMatch(/Nov 1, 2023 @ 10:00:00\.000/);
    });

    it('should include action ID in description', () => {
      const mockAction = createMockActionDetails({
        id: 'custom-action-id-456',
        agents: ['unknown-agent'],
        hosts: {},
      });
      const mockResponse = createMockApiResponse([mockAction]);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
        })
      );

      expect(result.current[0].description).toContain(
        'Action id custom-action-id-456 submitted by test-user'
      );
    });

    it('should map unisolate command to release display name', () => {
      const mockAction = createMockActionDetails({
        id: 'action-unisolate-123',
        command: 'unisolate',
      });
      const mockResponse = createMockApiResponse([mockAction]);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
        })
      );

      const option = result.current[0];
      expect(option.label).toBe('release');
      expect(getOptionValue(option)).toBe('action-unisolate-123');
      expect(result.current[0].description).toContain(
        'Action id action-unisolate-123 submitted by test-user'
      );
    });

    it('should handle various command types correctly', () => {
      const actions = [
        createMockActionDetails({ id: 'action-1', command: 'isolate' }),
        createMockActionDetails({ id: 'action-2', command: 'unisolate' }),
        createMockActionDetails({ id: 'action-3', command: 'get-file' }),
        createMockActionDetails({ id: 'action-4', command: 'execute' }),
        createMockActionDetails({ id: 'action-5', command: 'kill-process' }),
      ];
      const mockResponse = createMockApiResponse(actions);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
        })
      );

      expect(result.current).toHaveLength(5);
      expect(result.current[0].label).toBe('isolate');
      expect(result.current[1].label).toBe('release'); // unisolate -> release
      expect(result.current[2].label).toBe('get-file');
      expect(result.current[3].label).toBe('execute');
      expect(result.current[4].label).toBe('kill-process');
    });

    it('should handle edge cases with very long action IDs', () => {
      const longId =
        'very-long-action-id-that-might-cause-ui-issues-123456789012345678901234567890';
      const mockAction = createMockActionDetails({
        id: longId,
        command: 'execute',
      });
      const mockResponse = createMockApiResponse([mockAction]);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
        })
      );

      const option = result.current[0];
      expect(option.label).toBe('execute');
      expect(getOptionValue(option)).toBe(longId);
    });
  });

  describe('selected value handling', () => {
    it('should mark correct option as checked when selectedValue matches', () => {
      const mockAction = createMockActionDetails({ id: 'selected-action' });
      const mockResponse = createMockApiResponse([mockAction]);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
          selectedValue: 'selected-action',
        })
      );

      const option = result.current[0];
      expect(option.checked).toBe('on');
      expect(getOptionValue(option)).toBe('selected-action');
    });

    it('should not mark any options as checked when selectedValue does not match', () => {
      const mockAction = createMockActionDetails({ id: 'action-1' });
      const mockResponse = createMockApiResponse([mockAction]);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
          selectedValue: 'non-matching-id',
        })
      );

      const option = result.current[0];
      expect(option.checked).toBeUndefined();
      expect(getOptionValue(option)).toBe('action-1');
    });

    it('should handle multiple actions with only one selected', () => {
      const actions = [
        createMockActionDetails({ id: 'action-1' }),
        createMockActionDetails({ id: 'action-2' }),
        createMockActionDetails({ id: 'action-3' }),
      ];
      const mockResponse = createMockApiResponse(actions);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
          selectedValue: 'action-2',
        })
      );

      expect(result.current).toHaveLength(3);
      expect(result.current[0].checked).toBeUndefined();
      expect(result.current[1].checked).toBe('on');
      expect(result.current[2].checked).toBeUndefined();
    });
  });

  const createPrivilegeChecker = (canCancel: boolean, reason?: string) => (command: string) => ({
    canCancel,
    reason: canCancel ? undefined : reason || `No permission to cancel ${command}`,
  });

  describe('privilege checking', () => {
    it('should enable actions when privilege checker returns canCancel: true', () => {
      const mockAction = createMockActionDetails();
      const mockResponse = createMockApiResponse([mockAction]);
      const privilegeChecker = createPrivilegeChecker(true);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
          privilegeChecker,
        })
      );

      const option = result.current[0];
      expect(option.disabled).toBe(false);
    });

    it('should disable actions when privilege checker returns canCancel: false', () => {
      const mockAction = createMockActionDetails({ command: 'isolate' });
      const mockResponse = createMockApiResponse([mockAction]);
      const privilegeChecker = createPrivilegeChecker(false, 'Permission denied for isolate');

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
          privilegeChecker,
        })
      );

      const option = result.current[0];
      expect(option.disabled).toBe(true);
    });

    it('should pass command to privilege checker correctly', () => {
      const mockAction = createMockActionDetails({ command: 'execute' });
      const mockResponse = createMockApiResponse([mockAction]);
      const privilegeChecker = jest.fn().mockReturnValue({ canCancel: true });

      renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
          privilegeChecker,
        })
      );

      expect(privilegeChecker).toHaveBeenCalledWith('execute');
    });

    it('should handle different permissions for different commands', () => {
      const actions = [
        createMockActionDetails({ id: 'action-1', command: 'isolate' }),
        createMockActionDetails({ id: 'action-2', command: 'execute' }),
      ];
      const mockResponse = createMockApiResponse(actions);
      const privilegeChecker = jest.fn().mockImplementation((command: string) => ({
        canCancel: command === 'isolate',
        reason: command === 'execute' ? 'No execute permission' : undefined,
      }));

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
          privilegeChecker,
        })
      );

      expect(result.current).toHaveLength(2);
      const option1 = result.current[0];
      const option2 = result.current[1];
      expect(option1.disabled).toBe(false);
      expect(option2.disabled).toBe(true);
    });

    it('should default to disabled when no privilege checker is provided', () => {
      const mockAction = createMockActionDetails();
      const mockResponse = createMockApiResponse([mockAction]);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
        })
      );

      const option = result.current[0];
      expect(option.disabled).toBe(true);
    });
  });

  describe('date formatting integration', () => {
    it('should use correct date format from hook', () => {
      const customDateFormat = 'YYYY-MM-DD HH:mm';
      mockUseDateFormat.mockReturnValue(customDateFormat);

      const mockAction = createMockActionDetails({
        startedAt: '2023-11-01T10:00:00.000Z',
      });
      const mockResponse = createMockApiResponse([mockAction]);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
        })
      );

      expect(result.current[0].description).toContain('2023-11-01 10:00');
    });

    it('should use correct timezone from hook', () => {
      const customTimeZone = 'America/New_York';
      mockUseTimeZone.mockReturnValue(customTimeZone);

      const mockAction = createMockActionDetails({
        startedAt: '2023-11-01T10:00:00.000Z',
      });
      const mockResponse = createMockApiResponse([mockAction]);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
        })
      );

      // Should format the time in EST (UTC-4/5 depending on DST)
      expect(result.current[0].description).toContain('Nov 1, 2023 @ 06:00:00.000');
    });

    it('should call date format and timezone hooks', () => {
      const mockAction = createMockActionDetails();
      const mockResponse = createMockApiResponse([mockAction]);

      renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
        })
      );

      expect(mockUseDateFormat).toHaveBeenCalled();
      expect(mockUseTimeZone).toHaveBeenCalled();
    });
  });

  describe('memoization and performance', () => {
    it('should use memoization correctly', () => {
      const mockAction = createMockActionDetails();
      const mockResponse = createMockApiResponse([mockAction]);
      const privilegeChecker = createPrivilegeChecker(true);

      const { result, rerender } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
          selectedValue: 'action-123-abc',
          privilegeChecker,
        })
      );

      const firstResult = result.current;

      // Rerender with same inputs should return same structure
      rerender();

      expect(result.current).toEqual(firstResult);
      const option = result.current[0];
      expect(getOptionValue(option)).toBe('action-123-abc');
      expect(option.checked).toBe('on');
    });

    it('should return new reference when response changes', () => {
      const mockAction1 = createMockActionDetails({ id: 'action-1' });
      const mockAction2 = createMockActionDetails({ id: 'action-2' });
      const mockResponse1 = createMockApiResponse([mockAction1]);
      const mockResponse2 = createMockApiResponse([mockAction2]);

      const { result, rerender } = renderHook(
        ({ response }) => usePendingActionsOptions({ response }),
        {
          initialProps: { response: [mockResponse1] },
        }
      );

      const firstResult = result.current;

      rerender({ response: [mockResponse2] });

      expect(result.current).not.toBe(firstResult);
      expect(getOptionValue(result.current[0])).toBe('action-2');
    });

    it('should return new reference when selectedValue changes', () => {
      const mockAction = createMockActionDetails();
      const mockResponse = createMockApiResponse([mockAction]);

      const { result, rerender } = renderHook(
        ({ selectedValue }: { selectedValue?: string }) =>
          usePendingActionsOptions({
            response: [mockResponse],
            selectedValue,
          }),
        {
          initialProps: { selectedValue: undefined as string | undefined },
        }
      );

      const firstResult = result.current;

      rerender({ selectedValue: 'action-123-abc' });

      expect(result.current).not.toBe(firstResult);
      expect(result.current[0].checked).toBe('on');
    });

    it('should return new reference when privilegeChecker changes', () => {
      const mockAction = createMockActionDetails();
      const mockResponse = createMockApiResponse([mockAction]);
      const privilegeChecker1 = createPrivilegeChecker(true);
      const privilegeChecker2 = createPrivilegeChecker(false);

      const { result, rerender } = renderHook(
        ({
          privilegeChecker,
        }: {
          privilegeChecker?: (command: string) => { canCancel: boolean; reason?: string };
        }) =>
          usePendingActionsOptions({
            response: [mockResponse],
            privilegeChecker,
          }),
        {
          initialProps: { privilegeChecker: privilegeChecker1 },
        }
      );

      const firstResult = result.current;

      rerender({ privilegeChecker: privilegeChecker2 });

      expect(result.current).not.toBe(firstResult);
      expect(result.current[0].disabled).toBe(true);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle malformed action data gracefully', () => {
      const malformedAction = createMockActionDetails();
      // Intentionally make data malformed for testing error handling
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (malformedAction as any).hosts = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (malformedAction as any).agents = null;
      const mockResponse = createMockApiResponse([malformedAction]);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
        })
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0].description).toContain(
        'Action id action-123-abc submitted by test-user'
      );
    });

    it('should handle missing timestamp gracefully', () => {
      const actionWithoutTimestamp = {
        ...createMockActionDetails(),
        startedAt: '',
      };
      const mockResponse = createMockApiResponse([actionWithoutTimestamp]);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
        })
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0].description).toBeDefined();
    });

    it('should handle empty or invalid command names', () => {
      const actions = [
        (() => {
          const action1 = createMockActionDetails({ id: 'action-1', command: 'isolate' });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (action1 as any).command = ''; // Intentionally invalid
          return action1;
        })(),
        (() => {
          const action2 = createMockActionDetails({ id: 'action-2', command: 'isolate' });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (action2 as any).command = null; // Intentionally invalid
          return action2;
        })(),
      ];
      const mockResponse = createMockApiResponse(actions);

      const { result } = renderHook(() =>
        usePendingActionsOptions({
          response: [mockResponse],
        })
      );

      expect(result.current).toHaveLength(2);
      // Should still generate valid options even with invalid command names
      expect(getOptionValue(result.current[0])).toBe('action-1');
      expect(getOptionValue(result.current[1])).toBe('action-2');
    });
  });
});
