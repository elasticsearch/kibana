/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, render, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { TestProviders } from '../../../common/mock';
import { useGroupTakeActionsItems } from './use_group_take_action_items';
import { useAlertsPrivileges } from '../../containers/detection_engine/alerts/use_alerts_privileges';
import { updateAlertStatus } from '../../../common/components/toolbar/bulk_actions/update_alerts';

jest.mock('../../containers/detection_engine/alerts/use_alerts_privileges', () => ({
  useAlertsPrivileges: jest.fn(),
}));
jest.mock('../../../common/components/toolbar/bulk_actions/update_alerts');

const mockUseAlertsPrivileges = useAlertsPrivileges as jest.Mock;

describe('useGroupTakeActionsItems', () => {
  const wrapperContainer: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <TestProviders>{children}</TestProviders>
  );
  const getActionItemsParams = {
    tableId: 'mock-id',
    groupNumber: 0,
    selectedGroup: 'test',
    closePopover: () => {},
    groupBucket: {
      key: ['bucket-test'],
      key_as_string: 'bucket-test',
      selectedGroup: 'test',
      doc_count: 0,
    },
  };

  beforeEach(() => {
    mockUseAlertsPrivileges.mockReturnValue({ hasAlertsUpdate: true });
    (updateAlertStatus as jest.Mock).mockResolvedValue({ updated: 5, version_conflicts: 0 });
  });

  it('returns all take actions items if showAlertStatusActions is true and currentStatus is undefined', async () => {
    const { result } = renderHook(
      () =>
        useGroupTakeActionsItems({
          showAlertStatusActions: true,
        }),
      {
        wrapper: wrapperContainer,
      }
    );

    const { queryAllByRole } = render(result.current(getActionItemsParams));
    const items = queryAllByRole('menuitem');

    expect(items.length).toBe(3);
  });

  it('returns all take actions items if currentStatus is []', async () => {
    const { result } = renderHook(
      () =>
        useGroupTakeActionsItems({
          currentStatus: [],
          showAlertStatusActions: true,
        }),
      {
        wrapper: wrapperContainer,
      }
    );
    const { queryAllByRole } = render(result.current(getActionItemsParams));
    const items = queryAllByRole('menuitem');

    expect(items.length).toBe(3);
  });

  it('returns all take actions items if currentStatus.length > 1', async () => {
    const { result } = renderHook(
      () =>
        useGroupTakeActionsItems({
          currentStatus: ['open', 'closed'],
          showAlertStatusActions: true,
        }),
      {
        wrapper: wrapperContainer,
      }
    );
    const { queryAllByRole } = render(result.current(getActionItemsParams));
    const items = queryAllByRole('menuitem');

    expect(items.length).toBe(3);
  });

  it('returns acknowledged & closed take actions items if currentStatus === ["open"]', async () => {
    const { result } = renderHook(
      () =>
        useGroupTakeActionsItems({
          currentStatus: ['open'],
          showAlertStatusActions: true,
        }),
      {
        wrapper: wrapperContainer,
      }
    );

    const { queryAllByRole } = render(result.current(getActionItemsParams));
    const items = queryAllByRole('menuitem');

    expect(items.length).toBe(2);
    expect(items[0].getAttribute('data-test-subj')).toBe('acknowledged-alert-status');
    expect(items[1].getAttribute('data-test-subj')).toBe('alert-close-context-menu-item');
  });

  it('returns open & acknowledged take actions items if currentStatus === ["closed"]', async () => {
    const { result } = renderHook(
      () =>
        useGroupTakeActionsItems({
          currentStatus: ['closed'],
          showAlertStatusActions: true,
        }),
      {
        wrapper: wrapperContainer,
      }
    );

    const { queryAllByRole } = render(result.current(getActionItemsParams));
    const items = queryAllByRole('menuitem');

    expect(items.length).toBe(2);
    expect(items[0].getAttribute('data-test-subj')).toBe('open-alert-status');
    expect(items[1].getAttribute('data-test-subj')).toBe('acknowledged-alert-status');
  });

  it('returns open & closed take actions items if currentStatus === ["acknowledged"]', async () => {
    const { result } = renderHook(
      () =>
        useGroupTakeActionsItems({
          currentStatus: ['acknowledged'],
          showAlertStatusActions: true,
        }),
      {
        wrapper: wrapperContainer,
      }
    );

    const { queryAllByRole } = render(result.current(getActionItemsParams));
    const items = queryAllByRole('menuitem');

    expect(items.length).toBe(2);
    expect(items[0].getAttribute('data-test-subj')).toBe('open-alert-status');
    expect(items[1].getAttribute('data-test-subj')).toBe('alert-close-context-menu-item');
  });

  it('returns empty take actions items if showAlertStatusActions is false', async () => {
    const { result } = renderHook(
      () =>
        useGroupTakeActionsItems({
          showAlertStatusActions: false,
        }),
      {
        wrapper: wrapperContainer,
      }
    );
    const { queryAllByRole } = render(result.current(getActionItemsParams));
    const items = queryAllByRole('menuitem');

    expect(items.length).toBe(0);
  });

  it('returns array take actions items if showAlertStatusActions is true', async () => {
    const { result } = renderHook(
      () =>
        useGroupTakeActionsItems({
          showAlertStatusActions: true,
        }),
      {
        wrapper: wrapperContainer,
      }
    );
    const { queryAllByRole } = render(result.current(getActionItemsParams));
    const items = queryAllByRole('menuitem');

    expect(items.length).toBe(3);
  });

  describe('when the user does not have alert edit privileges', () => {
    beforeEach(() => {
      mockUseAlertsPrivileges.mockReturnValue({ hasAlertsUpdate: false });
    });

    it('returns empty take actions items', async () => {
      const { result } = renderHook(
        () =>
          useGroupTakeActionsItems({
            showAlertStatusActions: true,
          }),
        {
          wrapper: wrapperContainer,
        }
      );
      await waitFor(() => expect(result.current(getActionItemsParams)).toBeUndefined());
    });
  });

  describe('runtimeMappings forwarding (group take-actions fix)', () => {
    // These tests assert that runtimeMappings is passed through to updateAlertStatus
    // so the group-level status update can resolve data view runtime fields that are
    // not natively mapped on the alerts index (including scripted fields).

    const scriptedMappings = {
      display_name: {
        type: 'keyword' as const,
        script: { source: "emit(doc['first'].value + ' ' + doc['last'].value)" },
      },
    };

    const paramsWithQuery = { ...getActionItemsParams, query: '{"bool":{"filter":[]}}' };

    it('forwards runtimeMappings (with script) to updateAlertStatus when the open action is clicked', async () => {
      const { result } = renderHook(
        () => useGroupTakeActionsItems({ showAlertStatusActions: true }),
        { wrapper: wrapperContainer }
      );

      const { getByTestId } = render(
        result.current({ ...paramsWithQuery, runtimeMappings: scriptedMappings })!
      );

      await act(async () => {
        getByTestId('open-alert-status').click();
      });

      expect(updateAlertStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeMappings: scriptedMappings,
        })
      );
    });

    it('forwards runtimeMappings to updateAlertStatus when the acknowledged action is clicked', async () => {
      const { result } = renderHook(
        () => useGroupTakeActionsItems({ showAlertStatusActions: true }),
        { wrapper: wrapperContainer }
      );

      const { getByTestId } = render(
        result.current({ ...paramsWithQuery, runtimeMappings: scriptedMappings })!
      );

      await act(async () => {
        getByTestId('acknowledged-alert-status').click();
      });

      expect(updateAlertStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeMappings: scriptedMappings,
        })
      );
    });

    it('passes runtimeMappings as undefined when not provided', async () => {
      const { result } = renderHook(
        () => useGroupTakeActionsItems({ showAlertStatusActions: true }),
        { wrapper: wrapperContainer }
      );

      const { getByTestId } = render(result.current(paramsWithQuery)!);

      await act(async () => {
        getByTestId('open-alert-status').click();
      });

      expect(updateAlertStatus).toHaveBeenCalledWith(
        expect.objectContaining({ runtimeMappings: undefined })
      );
    });
  });
});
