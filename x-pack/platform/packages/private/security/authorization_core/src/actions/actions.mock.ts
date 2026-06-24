/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Actions } from './actions';
import { AlertingActions } from './alerting';
import { AlertsActions } from './alerts';
import { ApiActions } from './api';
import { AppActions } from './app';
import { CasesActions } from './cases';
import { SavedObjectActions } from './saved_object';
import { SpaceActions } from './space';
import { UIActions } from './ui';

jest.mock('./api');
jest.mock('./app');
jest.mock('./saved_object');
jest.mock('./space');
jest.mock('./ui');
jest.mock('./alerting');
jest.mock('./alerts');
jest.mock('./cases');

const create = (versionNumber: string) => {
  const t = {
    alerts: new AlertsActions(),
    api: new ApiActions(),
    app: new AppActions(),
    login: 'login:',
    savedObject: new SavedObjectActions(),
    alerting: new AlertingActions(),
    cases: new CasesActions(),
    space: new SpaceActions(),
    ui: new UIActions(),
  } as unknown as jest.Mocked<Actions>;
  return t;
};

export const actionsMock = { create };
