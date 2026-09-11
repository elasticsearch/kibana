/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, renderHook } from '@testing-library/react';
import { useAddToCaseActions } from './use_add_to_case_actions';
import { TestProviders } from '../../../../common/mock';
import { useKibana } from '../../../../common/lib/kibana';
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

const addToCase = jest.fn().mockReturnValue(caseHooksReturnedValue);
const useKibanaMock = useKibana as jest.Mock;

describe('useAddToCaseActions', () => {
  beforeEach(() => {
    useKibanaMock.mockReturnValue({
      services: {
        cases: {
          hooks: {
            useCasesAddToExistingCaseModal: addToCase,
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

  it('should render one case action when event is alert', () => {
    const { result } = renderHook(() => useAddToCaseActions(defaultProps), {
      wrapper: TestProviders,
    });

    expect(result.current.addToCaseActionItems).toHaveLength(1);
    expect(result.current.addToCaseActionItems[0]).toMatchObject({
      'data-test-subj': 'add-to-case-action',
      key: 'add-to-case-action',
      name: 'Add to case',
    });
  });

  it('should render one case action when event is not alert', () => {
    const { result } = renderHook(
      () => useAddToCaseActions({ ...defaultProps, ecsData: { _id: '123' } }),
      {
        wrapper: TestProviders,
      }
    );
    expect(result.current.addToCaseActionItems).toHaveLength(1);
  });

  it('should open the case modal with alert attachments', () => {
    const { result } = renderHook(() => useAddToCaseActions(defaultProps), {
      wrapper: TestProviders,
    });

    act(() => {
      result.current.handleAddToCaseClick();
    });

    expect(open).toHaveBeenCalledWith({
      getAttachments: expect.any(Function),
    });
    const { getAttachments } = open.mock.calls[0][0];
    expect(getAttachments()).toEqual([
      {
        type: 'security.alert',
        attachmentId: '123',
        metadata: {
          index: '',
          rule: null,
        },
      },
    ]);
    expect(refetch).toHaveBeenCalled();
  });

  it('should refetch when the modal succeeds', () => {
    renderHook(() => useAddToCaseActions(defaultProps), {
      wrapper: TestProviders,
    });

    addToCase.mock.calls[0][0].onSuccess();

    expect(refetch).toHaveBeenCalled();
  });
});
