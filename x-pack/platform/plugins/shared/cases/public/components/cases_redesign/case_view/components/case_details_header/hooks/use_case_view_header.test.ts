/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react';

import { useCaseViewHeader } from './use_case_view_header';
import { basicCase } from '../../../../../../containers/mock';
import { TestProviders } from '../../../../../../common/mock';
import { useGetCaseConnectors } from '../../../../../../containers/use_get_case_connectors';
import { useDeleteCases } from '../../../../../../containers/use_delete_cases';
import { useShouldDisableStatus } from '../../../../../actions/status/use_should_disable_status';
import type { CaseUI } from '../../../../../../../common';

jest.mock('../../../../../../containers/use_get_case_connectors');
jest.mock('../../../../../../containers/use_delete_cases');
jest.mock('../../../../../actions/status/use_should_disable_status');
jest.mock('../../../../../../common/navigation/hooks');
jest.mock('../../../../../../common/lib/kibana');
jest.mock('../../../../../case_view/use_on_refresh_case_view_page');

const mockDeleteCases = jest.fn();
const mockOnStatusChanged = jest.fn();

(useGetCaseConnectors as jest.Mock).mockReturnValue({ data: {} });
(useDeleteCases as jest.Mock).mockReturnValue({ mutate: mockDeleteCases });
(useShouldDisableStatus as jest.Mock).mockReturnValue(() => false);

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(TestProviders, null, children);

describe('useCaseViewHeader', () => {
  const onUpdateField = jest.fn();
  const defaultArgs = {
    caseData: basicCase,
    onUpdateField,
    onStatusChanged: mockOnStatusChanged,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useGetCaseConnectors as jest.Mock).mockReturnValue({ data: {} });
    (useDeleteCases as jest.Mock).mockReturnValue({ mutate: mockDeleteCases });
    (useShouldDisableStatus as jest.Mock).mockReturnValue(() => false);
  });

  it('returns an editable title with case name only', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    expect(result.current.headerTitle).toEqual(expect.objectContaining({ text: basicCase.title }));
  });

  it('returns a plain string title when user lacks update permissions', () => {
    const readOnlyWrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        TestProviders,
        {
          permissions: {
            all: false,
            create: true,
            read: true,
            update: false,
            delete: false,
            push: false,
            connectors: false,
            settings: false,
            reopenCase: false,
            createComment: false,
            assign: false,
            manageTemplates: false,
          },
        } as React.ComponentProps<typeof TestProviders>,
        children
      );

    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper: readOnlyWrapper,
    });

    expect(typeof result.current.headerTitle).toBe('string');
    expect(result.current.headerTitle).toBe(basicCase.title);
  });

  it('rejects empty title on save', async () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    const title = result.current.headerTitle;
    expect(typeof title).not.toBe('string');
    if (typeof title !== 'string') {
      const error = await act(async () => title.onSave(''));
      expect(error).toBeDefined();
      expect(onUpdateField).not.toHaveBeenCalled();
    }
  });

  it('calls onUpdateField when editable title is saved', async () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    const title = result.current.headerTitle;
    expect(typeof title).not.toBe('string');
    if (typeof title !== 'string') {
      await act(async () => {
        await title.onSave('New Title');
      });
      expect(onUpdateField).toHaveBeenCalledWith({ key: 'title', value: 'New Title' });
    }
  });

  it('includes incremental ID in metadata when present', () => {
    const caseWithId: CaseUI = { ...basicCase, incrementalId: 42 };
    const { result } = renderHook(
      () => useCaseViewHeader({ ...defaultArgs, caseData: caseWithId }),
      { wrapper }
    );

    expect(result.current.metadata[0]).toEqual(
      expect.objectContaining({
        type: 'text',
        label: '#42',
        'data-test-subj': 'case-view-incremental-id',
      })
    );
  });

  it('does not include incremental ID in metadata when undefined', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    const incrementalIdItem = result.current.metadata.find(
      (m) => m?.['data-test-subj'] === 'case-view-incremental-id'
    );
    expect(incrementalIdItem).toBeUndefined();
  });

  it('returns metadata with reporter name and created date', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    expect(result.current.metadata).toBeDefined();

    const reportedBy = result.current.metadata.find(
      (m) => m?.['data-test-subj'] === 'case-view-reported-by'
    );
    expect(reportedBy).toEqual(
      expect.objectContaining({
        type: 'text',
        label: `Reported by: ${basicCase.createdBy.fullName!}`,
      })
    );

    const createdAt = result.current.metadata.find(
      (m) => m?.['data-test-subj'] === 'case-view-created-at'
    );
    expect(createdAt).toEqual(
      expect.objectContaining({
        type: 'text',
        label: expect.stringContaining('on: '),
      })
    );
  });

  it('returns a backHref', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    expect(result.current.backHref).toBeDefined();
  });

  it('returns severity and status badges', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    const severityBadge = result.current.badges.find(
      (b) => b['data-test-subj'] === 'case-view-severity-badge'
    );
    const statusBadge = result.current.badges.find(
      (b) => b['data-test-subj'] === 'case-view-status-badge'
    );

    expect(severityBadge).toBeDefined();
    expect(severityBadge?.label).toBe('Low');
    expect(statusBadge).toBeDefined();
  });

  it('includes alerts count badge when totalAlerts > 0', () => {
    const caseWithAlerts: CaseUI = { ...basicCase, totalAlerts: 5 };
    const { result } = renderHook(
      () => useCaseViewHeader({ ...defaultArgs, caseData: caseWithAlerts }),
      { wrapper }
    );

    const alertsBadge = result.current.badges.find(
      (b) => b['data-test-subj'] === 'case-view-alerts-count-badge'
    );

    expect(alertsBadge).toBeDefined();
    expect(alertsBadge?.label).toBe('5');
  });

  it('does not include alerts badge when totalAlerts is 0', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    const alertsBadge = result.current.badges.find(
      (b) => b['data-test-subj'] === 'case-view-alerts-count-badge'
    );

    expect(alertsBadge).toBeUndefined();
  });

  it('includes status dropdown items when status is not disabled', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    const statusBadge = result.current.badges.find(
      (b) => b['data-test-subj'] === 'case-view-status-badge'
    );

    expect(statusBadge?.items).toHaveLength(3);
  });

  it('does not include status dropdown items when status is disabled', () => {
    (useShouldDisableStatus as jest.Mock).mockReturnValue(() => true);

    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    const statusBadge = result.current.badges.find(
      (b) => b['data-test-subj'] === 'case-view-status-badge'
    );

    expect(statusBadge?.items).toBeUndefined();
  });

  it('returns menu items with refresh action', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    const refreshItem = result.current.menu.items!.find((item) => item.id === 'refreshCase');
    expect(refreshItem).toBeDefined();
  });

  it('returns settings menu item when user has update permissions', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    const settingsItem = result.current.menu.items!.find((item) => item.id === 'caseSettings');
    expect(settingsItem).toBeDefined();
  });

  it('returns delete menu item when user has delete permissions', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    const deleteItem = result.current.menu.items!.find((item) => item.id === 'deleteCase');
    expect(deleteItem).toBeDefined();
  });

  it('opens delete modal when delete action is triggered', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    expect(result.current.isDeleteModalVisible).toBe(false);

    act(() => {
      const deleteItem = result.current.menu.items!.find((item) => item.id === 'deleteCase');
      deleteItem?.run?.();
    });

    expect(result.current.isDeleteModalVisible).toBe(true);
  });

  it('calls deleteCases and navigates on confirm deletion', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    act(() => {
      result.current.onConfirmDeletion();
    });

    expect(mockDeleteCases).toHaveBeenCalledWith(
      expect.objectContaining({ caseIds: [basicCase.id] }),
      expect.anything()
    );
  });

  it('toggles settings open state when settings action is triggered', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    expect(result.current.isSettingsOpen).toBe(false);

    const mockElement = document.createElement('button');

    act(() => {
      const settingsItem = result.current.menu.items!.find((item) => item.id === 'caseSettings');
      settingsItem?.run?.({ triggerElement: mockElement, returnFocus: jest.fn() });
    });

    expect(result.current.isSettingsOpen).toBe(true);
    expect(result.current.settingsAnchor).toBe(mockElement);
  });

  it('calls onStatusChanged when status badge item is clicked', () => {
    const { result } = renderHook(() => useCaseViewHeader(defaultArgs), {
      wrapper,
    });

    const statusBadge = result.current.badges.find(
      (b) => b['data-test-subj'] === 'case-view-status-badge'
    );

    act(() => {
      statusBadge?.items?.[2]?.onClick?.();
    });

    expect(mockOnStatusChanged).toHaveBeenCalledWith('closed');
  });
});
