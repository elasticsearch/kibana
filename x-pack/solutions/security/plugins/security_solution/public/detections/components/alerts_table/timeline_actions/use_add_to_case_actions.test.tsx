/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiContextMenu, EuiPopover } from '@elastic/eui';
import { render, screen, renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAddToCaseActions } from './use_add_to_case_actions';
import { TestProviders } from '../../../../common/mock';
import { useKibana } from '../../../../common/lib/kibana';

import type { AlertTableContextMenuItem } from '../types';
import { allCasesPermissions } from '../../../../cases_test_utils';

jest.mock('../../../../common/lib/kibana');

const refetch = jest.fn();
const submit = jest.fn();
const open = jest.fn().mockImplementation(() => {
  refetch();
});

const caseHooksReturnedValue = {
  open,
  close: jest.fn(),
  submit,
};

const defaultProps = {
  onMenuItemClick: () => null,
  isActiveTimelines: false,
  isInDetections: true,
  ecsData: {
    _id: '123',
    event: {
      kind: ['signal'],
    },
    host: {
      name: ['test-host'],
    },
  },
  nonEcsData: [
    { field: 'event.kind', value: ['signal'] },
    { field: 'host.name', value: ['test-host'] },
  ],
  refetch,
};

const addToNewCase = jest.fn().mockReturnValue(caseHooksReturnedValue);
const addToExistingCase = jest.fn().mockReturnValue(caseHooksReturnedValue);
const useKibanaMock = useKibana as jest.Mock;

const renderContextMenu = (items: AlertTableContextMenuItem[]) => {
  const panels = [{ id: 0, items }];
  render(
    <EuiPopover
      aria-label="Context menu"
      isOpen={true}
      panelPaddingSize="none"
      anchorPosition="downLeft"
      closePopover={() => {}}
      button={<></>}
    >
      <EuiContextMenu initialPanelId={0} panels={panels} />
    </EuiPopover>
  );
};

describe('useAddToCaseActions', () => {
  beforeEach(() => {
    useKibanaMock.mockReturnValue({
      services: {
        cases: {
          hooks: {
            useCasesAddToNewCaseFlyout: addToNewCase,
            useCasesAddToExistingCaseModal: addToExistingCase,
          },
          helpers: {
            getRuleIdFromEvent: () => null,
            canUseCases: jest.fn().mockReturnValue(allCasesPermissions()),
          },
        },
      },
    });
    jest.clearAllMocks();
  });

  it('should render case options when event is alert ', () => {
    const { result } = renderHook(() => useAddToCaseActions(defaultProps), {
      wrapper: TestProviders,
    });
    expect(result.current.addToCaseActionItems.length).toEqual(2);
    expect(result.current.addToCaseActionItems[0]['data-test-subj']).toEqual(
      'add-to-existing-case-action'
    );
    expect(result.current.addToCaseActionItems[1]['data-test-subj']).toEqual(
      'add-to-new-case-action'
    );
  });

  it('should render case options when event is not alert ', () => {
    const { result } = renderHook(
      () => useAddToCaseActions({ ...defaultProps, ecsData: { _id: '123' } }),
      {
        wrapper: TestProviders,
      }
    );
    expect(result.current.addToCaseActionItems.length).toEqual(2);
  });

  it('should call useCasesAddToNewCaseFlyout with attachments only when step is not active', () => {
    const { result } = renderHook(() => useAddToCaseActions(defaultProps), {
      wrapper: TestProviders,
    });
    act(() => {
      result.current.handleAddToNewCaseClick();
    });
    expect(open).toHaveBeenCalledWith({
      attachments: [
        {
          type: 'security.alert',
          attachmentId: '123',
          metadata: {
            index: '',
            rule: null,
          },
        },
      ],
    });
  });

  it('should not prefill useCasesAddToNewCaseFlyout with tour step when step is not active', () => {
    renderHook(() => useAddToCaseActions(defaultProps), {
      wrapper: TestProviders,
    });
    expect(addToNewCase.mock.calls[0][0]).not.toHaveProperty('initialValue');
  });

  it('should refetch when adding an alert to a new case', async () => {
    const { result } = renderHook(() => useAddToCaseActions(defaultProps), {
      wrapper: TestProviders,
    });

    expect(result.current.addToCaseActionItems.length).toEqual(2);

    renderContextMenu(result.current.addToCaseActionItems);

    expect(screen.getByTestId('add-to-new-case-action')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('add-to-new-case-action'));

    expect(refetch).toHaveBeenCalled();
  });

  it('should refetch when calling onSuccess of useCasesAddToNewCaseFlyout', () => {
    const { result } = renderHook(() => useAddToCaseActions(defaultProps), {
      wrapper: TestProviders,
    });

    expect(result.current.addToCaseActionItems.length).toEqual(2);

    addToNewCase.mock.calls[0][0].onSuccess();

    expect(refetch).toHaveBeenCalled();
  });

  it('should refetch when adding an alert to an existing case', async () => {
    const { result } = renderHook(() => useAddToCaseActions(defaultProps), {
      wrapper: TestProviders,
    });

    expect(result.current.addToCaseActionItems.length).toEqual(2);

    renderContextMenu(result.current.addToCaseActionItems);

    expect(screen.getByTestId('add-to-existing-case-action')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('add-to-existing-case-action'));

    expect(refetch).toHaveBeenCalled();
  });

  it('should refetch when calling onSuccess of useCasesAddToExistingCaseModal', () => {
    const { result } = renderHook(() => useAddToCaseActions(defaultProps), {
      wrapper: TestProviders,
    });

    expect(result.current.addToCaseActionItems.length).toEqual(2);

    addToExistingCase.mock.calls[0][0].onSuccess();

    expect(refetch).toHaveBeenCalled();
  });
});
