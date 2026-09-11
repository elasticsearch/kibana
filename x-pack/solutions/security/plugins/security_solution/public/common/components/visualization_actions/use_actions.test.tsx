/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import React from 'react';
import { mockAttributes } from './mocks';
import { DEFAULT_ACTIONS, useActions, VISUALIZATION_CONTEXT_MENU_TRIGGER } from './use_actions';
import { TestProviders } from '../../mock';

jest.mock('./use_add_to_existing_case', () => {
  return {
    useAddToExistingCase: jest.fn().mockReturnValue({
      disabled: false,
      onAddToExistingCaseClicked: jest.fn(),
    }),
  };
});
jest.mock('./use_redirect_to_dashboard_from_lens', () => ({
  useRedirectToDashboardFromLens: jest.fn().mockReturnValue({
    redirectTo: jest.fn(),
    getEditOrCreateDashboardPath: jest.fn().mockReturnValue('mockDashboardPath'),
  }),
}));

jest.mock('../../lib/kibana/kibana_react', () => {
  return {
    useKibana: jest.fn().mockReturnValue({
      services: {
        lens: {
          navigateToPrefilledEditor: jest.fn(),
          canUseEditor: jest.fn().mockReturnValue(true),
          SaveModalComponent: jest
            .fn()
            .mockReturnValue(() => <div data-test-subj="saveModalComponent" />),
        },
        notifications: {
          toasts: {
            addWarning: jest.fn(),
          },
        },
        application: { capabilities: { visualize_v2: { save: true } } },
      },
    }),
  };
});

const props = {
  withActions: DEFAULT_ACTIONS,
  attributes: mockAttributes,
  timeRange: {
    from: '2022-10-26T23:00:00.000Z',
    to: '2022-11-03T15:16:50.053Z',
  },
  inspectActionProps: {
    handleInspectClick: jest.fn(),
    isInspectButtonDisabled: false,
  },
};

describe(`useActions`, () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render actions', () => {
    const { result } = renderHook(() => useActions(props), {
      wrapper: TestProviders,
    });
    expect(result.current[0].id).toEqual('inspect');
    expect(result.current[0].order).toEqual(3);
    expect(result.current[1].id).toEqual('addToCase');
    expect(
      result.current[1].getDisplayName({ trigger: VISUALIZATION_CONTEXT_MENU_TRIGGER })
    ).toEqual('Add to case');
    expect(result.current[1].order).toEqual(2);
    expect(result.current[2].id).toEqual('saveToLibrary');
    expect(result.current[2].order).toEqual(1);
    expect(result.current[3].id).toEqual('openInLens');
    expect(result.current[3].order).toEqual(0);
  });

  it('should render extra actions if available', () => {
    const mockExtraAction = [
      {
        id: 'mockExtraAction',
        getDisplayName(): string {
          return 'mockExtraAction';
        },
        getIconType(): string | undefined {
          return 'redo';
        },
        type: 'actionButton',
        async isCompatible(): Promise<boolean> {
          return true;
        },
        async execute(): Promise<void> {},
        order: 0,
      },
    ];
    const { result } = renderHook(
      () =>
        useActions({
          ...props,
          extraActions: mockExtraAction,
        }),
      {
        wrapper: TestProviders,
      }
    );

    expect(result.current[0].id).toEqual('inspect');
    expect(result.current[0].order).toEqual(4);
    expect(result.current[1].id).toEqual('addToCase');
    expect(result.current[1].order).toEqual(3);
    expect(result.current[2].id).toEqual('saveToLibrary');
    expect(result.current[2].order).toEqual(2);
    expect(result.current[3].id).toEqual('openInLens');
    expect(result.current[3].order).toEqual(1);
    expect(result.current[4].id).toEqual('mockExtraAction');
    expect(result.current[4].order).toEqual(0);
  });
});
