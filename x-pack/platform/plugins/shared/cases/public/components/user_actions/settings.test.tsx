/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCommentList } from '@elastic/eui';
import { screen } from '@testing-library/react';
import { UserActionActions } from '../../../common/types/domain';

import { renderWithTestingProviders } from '../../common/mock';
import { getUserAction } from '../../containers/mock';
import { getMockBuilderArgs } from './mock';
import { createSettingsUserActionBuilder } from './settings';

jest.mock('../../common/lib/kibana');
jest.mock('../../common/navigation/hooks');

describe('createSettingsUserActionBuilder ', () => {
  const builderArgs = getMockBuilderArgs();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const tests = [
    [false, 'disabled', false, 'disabled'],
    [false, 'disabled', true, 'enabled'],
    [true, 'enabled', false, 'disabled'],
    [true, 'enabled', true, 'enabled'],
  ];

  const tests2 = [
    [false, 'disabled'],
    [true, 'enabled'],
  ];

  it.each(tests)(
    'renders correctly when both settings are changed',
    async (syncAlerts, syncAlertsLabel, extractObservables, extractObservablesLabel) => {
      const userAction = getUserAction('settings', UserActionActions.update, {
        payload: { settings: { syncAlerts, extractObservables } },
      });
      const builder = createSettingsUserActionBuilder({
        ...builderArgs,
        userAction,
      });

      const createdUserAction = builder.build();
      renderWithTestingProviders(<EuiCommentList comments={createdUserAction} />);

      expect(screen.getByTestId('settings-update-action-settings-update')).toBeTruthy();
      expect(
        screen.getByText(
          `${syncAlertsLabel} sync detections, ${extractObservablesLabel} extract observables`
        )
      ).toBeTruthy();
    }
  );

  it.each(tests2)(
    'renders correctly when sync alerts is changed and extract observables is not changed',
    async (syncAlerts, syncAlertsLabel) => {
      const userAction = getUserAction('settings', UserActionActions.update, {
        payload: { settings: { syncAlerts } },
      });
      const builder = createSettingsUserActionBuilder({
        ...builderArgs,
        userAction,
      });

      const createdUserAction = builder.build();
      renderWithTestingProviders(<EuiCommentList comments={createdUserAction} />);

      expect(screen.getByText(`${syncAlertsLabel} sync detections`)).toBeTruthy();
    }
  );

  it.each(tests2)(
    'renders correctly when extract observables is changed and sync alerts is not changed',
    async (extractObservables, extractObservablesLabel) => {
      const userAction = getUserAction('settings', UserActionActions.update, {
        payload: { settings: { extractObservables } },
      });
      const builder = createSettingsUserActionBuilder({
        ...builderArgs,
        userAction,
      });

      const createdUserAction = builder.build();
      renderWithTestingProviders(<EuiCommentList comments={createdUserAction} />);

      expect(screen.getByText(`${extractObservablesLabel} extract observables`)).toBeTruthy();
    }
  );
});
