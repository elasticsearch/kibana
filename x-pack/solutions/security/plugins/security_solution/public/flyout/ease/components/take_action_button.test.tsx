/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { useKibana } from '../../../common/lib/kibana';
import { mockCasesContract } from '@kbn/cases-plugin/public/mocks';
import { TAKE_ACTION_BUTTON_TEST_ID, TakeActionButton } from './take_action_button';
import { useAlertsPrivileges } from '../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import { useEaseDetailsContext } from '../context';
import userEvent from '@testing-library/user-event';

jest.mock('../../../common/lib/kibana');
jest.mock('../../../detections/containers/detection_engine/alerts/use_alerts_privileges');
jest.mock('../context');

describe('TakeActionButton', () => {
  it('should render component with all options', async () => {
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsUpdate: true });
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        cases: {
          ...mockCasesContract(),
          helpers: {
            canUseCases: jest.fn().mockReturnValue({
              read: true,
              createComment: true,
            }),
            getRuleIdFromEvent: jest.fn(),
          },
        },
      },
    });
    (useEaseDetailsContext as jest.Mock).mockReturnValue({
      dataAsNestedObject: {
        _id: '_id',
        _index: '_index',
        event: { kind: ['signal'] },
        kibana: { alert: { workflow_tags: [] } },
      },
    });

    const { getByTestId } = render(<TakeActionButton />);

    const button = getByTestId(TAKE_ACTION_BUTTON_TEST_ID);
    expect(button).toBeInTheDocument();

    await userEvent.click(button);

    expect(getByTestId('add-to-existing-case-action')).toBeInTheDocument();
    expect(getByTestId('add-to-new-case-action')).toBeInTheDocument();
    expect(getByTestId('alert-tags-context-menu-item')).toBeInTheDocument();
  });

  it('should not show cases actions if user is not authorized', async () => {
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasIndexWrite: true });
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        cases: {
          ...mockCasesContract(),
          helpers: {
            canUseCases: jest.fn().mockReturnValue({
              read: false,
              createComment: false,
            }),
            getRuleIdFromEvent: jest.fn(),
          },
        },
      },
    });
    (useEaseDetailsContext as jest.Mock).mockReturnValue({
      dataAsNestedObject: {
        _id: '_id',
        _index: '_index',
        event: { kind: ['signal'] },
        kibana: { alert: { workflow_tags: [] } },
      },
    });

    const { getByTestId, queryByTestId } = render(<TakeActionButton />);

    const button = getByTestId(TAKE_ACTION_BUTTON_TEST_ID);
    expect(button).toBeInTheDocument();

    await userEvent.click(button);

    expect(queryByTestId('add-to-existing-case-action')).not.toBeInTheDocument();
    expect(queryByTestId('add-to-new-case-action')).not.toBeInTheDocument();
  });

  it('should not show tags actions if user is not authorized', async () => {
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasIndexWrite: false });
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        cases: {
          ...mockCasesContract(),
          helpers: {
            canUseCases: jest.fn().mockReturnValue({
              read: true,
              createComment: true,
            }),
            getRuleIdFromEvent: jest.fn(),
          },
        },
      },
    });
    (useEaseDetailsContext as jest.Mock).mockReturnValue({
      dataAsNestedObject: {
        _id: '_id',
        _index: '_index',
        event: { kind: ['signal'] },
        kibana: { alert: { workflow_tags: [] } },
      },
    });

    const { getByTestId, queryByTestId } = render(<TakeActionButton />);

    const button = getByTestId(TAKE_ACTION_BUTTON_TEST_ID);
    expect(button).toBeInTheDocument();

    await userEvent.click(button);

    expect(queryByTestId('alert-tags-context-menu-item')).not.toBeInTheDocument();
  });
});
