/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, waitFor, renderHook } from '@testing-library/react';
import { useSeverityAction } from './use_severity_action';

import { basicCase } from '../../../containers/mock';
import { CaseSeverity } from '../../../../common/types/domain';
import { TestProviders } from '../../../common/mock';
import { useUpdateCases } from '../../../containers/use_bulk_update_case';
import React from 'react';
import { coreMock } from '@kbn/core/public/mocks';

jest.mock('../../../containers/api');
// Wrap the real hook so individual tests can swap in a synchronous `mutate`; the toaster tests below still exercise the real mutation lifecycle.
jest.mock('../../../containers/use_bulk_update_case', () => ({
  ...jest.requireActual('../../../containers/use_bulk_update_case'),
  useUpdateCases: jest.fn(),
}));

const { useUpdateCases: realUseUpdateCases } = jest.requireActual(
  '../../../containers/use_bulk_update_case'
);

describe('useSeverityAction', () => {
  const onAction = jest.fn();
  const onActionSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useUpdateCases as jest.Mock).mockImplementation(realUseUpdateCases);
  });

  it('renders an action', async () => {
    const { result } = renderHook(
      () =>
        useSeverityAction({
          onAction,
          onActionSuccess,
          isDisabled: false,
        }),
      {
        wrapper: TestProviders,
      }
    );

    expect(result.current.getActions([basicCase])).toMatchInlineSnapshot(`
      Array [
        Object {
          "data-test-subj": "cases-bulk-action-severity-low",
          "disabled": true,
          "icon": "empty",
          "key": "cases-bulk-action-severity-low",
          "name": "Low",
          "onClick": [Function],
        },
        Object {
          "data-test-subj": "cases-bulk-action-severity-medium",
          "disabled": false,
          "icon": "empty",
          "key": "cases-bulk-action-severity-medium",
          "name": "Medium",
          "onClick": [Function],
        },
        Object {
          "data-test-subj": "cases-bulk-action-severity-high",
          "disabled": false,
          "icon": "empty",
          "key": "cases-bulk-action-severity-high",
          "name": "High",
          "onClick": [Function],
        },
        Object {
          "data-test-subj": "cases-bulk-action-severity-critical",
          "disabled": false,
          "icon": "empty",
          "key": "cases-bulk-action-severity-critical",
          "name": "Critical",
          "onClick": [Function],
        },
      ]
    `);
  });

  it('update the severity cases', async () => {
    const mutate = jest.fn();
    (useUpdateCases as jest.Mock).mockReturnValue({ mutate, isLoading: false });

    const { result } = renderHook(
      () => useSeverityAction({ onAction, onActionSuccess, isDisabled: false }),
      {
        wrapper: TestProviders,
      }
    );

    const actions = result.current.getActions([basicCase]);

    for (const [index, severity] of [
      CaseSeverity.LOW,
      CaseSeverity.MEDIUM,
      CaseSeverity.HIGH,
      CaseSeverity.CRITICAL,
    ].entries()) {
      act(() => {
        // @ts-expect-error: onClick expects a MouseEvent argument
        actions[index]!.onClick();
      });

      expect(onAction).toHaveBeenCalled();
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          cases: [{ severity, id: basicCase.id, version: basicCase.version }],
        }),
        expect.objectContaining({ onSuccess: onActionSuccess })
      );
    }
  });

  const singleCaseTests = [
    [CaseSeverity.LOW, 0, 'Case "Another horrible breach!!" was set to Low'],
    [CaseSeverity.MEDIUM, 1, 'Case "Another horrible breach!!" was set to Medium'],
    [CaseSeverity.HIGH, 2, 'Case "Another horrible breach!!" was set to High'],
    [CaseSeverity.CRITICAL, 3, 'Case "Another horrible breach!!" was set to Critical'],
  ];

  it.each(singleCaseTests)(
    'shows the success toaster correctly when updating the severity of the case: %s',
    async (_, index, expectedMessage) => {
      const coreStart = coreMock.createStart();

      const { result } = renderHook(
        () => useSeverityAction({ onAction, onActionSuccess, isDisabled: false }),
        {
          wrapper: (props) => <TestProviders {...props} coreStart={coreStart} />,
        }
      );

      const actions = result.current.getActions([basicCase]);

      act(() => {
        // @ts-expect-error: onClick expects a MouseEvent argument
        actions[index]!.onClick();
      });

      await waitFor(() => {
        expect(coreStart.notifications.toasts.addSuccess).toHaveBeenCalledWith({
          title: expectedMessage,
          className: 'eui-textBreakWord',
        });
      });
    }
  );

  const multipleCasesTests: Array<[CaseSeverity, number, string]> = [
    [CaseSeverity.LOW, 0, '2 cases were set to Low'],
    [CaseSeverity.MEDIUM, 1, '2 cases were set to Medium'],
    [CaseSeverity.HIGH, 2, '2 cases were set to High'],
    [CaseSeverity.CRITICAL, 3, '2 cases were set to Critical'],
  ];

  it.each(multipleCasesTests)(
    'shows the success toaster correctly when updating the severity of the case: %s',
    async (_, index, expectedMessage) => {
      const coreStart = coreMock.createStart();

      const { result } = renderHook(
        () => useSeverityAction({ onAction, onActionSuccess, isDisabled: false }),
        {
          wrapper: (props) => <TestProviders {...props} coreStart={coreStart} />,
        }
      );

      const actions = result.current.getActions([basicCase, basicCase]);

      act(() => {
        // @ts-expect-error: onClick expects a MouseEvent argument
        actions[index]!.onClick();
      });

      await waitFor(() => {
        expect(coreStart.notifications.toasts.addSuccess).toHaveBeenCalledWith({
          title: expectedMessage,
          className: 'eui-textBreakWord',
        });
      });
    }
  );

  const disabledTests: Array<[CaseSeverity, number]> = [
    [CaseSeverity.LOW, 0],
    [CaseSeverity.MEDIUM, 1],
    [CaseSeverity.HIGH, 2],
    [CaseSeverity.CRITICAL, 3],
  ];

  it.each(disabledTests)('disables the severity button correctly: %s', async (severity, index) => {
    const { result } = renderHook(
      () => useSeverityAction({ onAction, onActionSuccess, isDisabled: false }),
      {
        wrapper: TestProviders,
      }
    );

    const actions = result.current.getActions([{ ...basicCase, severity }]);
    expect(actions[index].disabled).toBe(true);
  });

  it.each(disabledTests)(
    'disables the severity button correctly if isDisabled=true: %s',
    async (severity, index) => {
      const { result } = renderHook(
        () => useSeverityAction({ onAction, onActionSuccess, isDisabled: true }),
        {
          wrapper: TestProviders,
        }
      );

      const actions = result.current.getActions([basicCase]);
      expect(actions[index].disabled).toBe(true);
    }
  );
});
