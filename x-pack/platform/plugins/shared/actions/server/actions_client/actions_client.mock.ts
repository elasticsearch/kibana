/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PublicMethodsOf } from '@kbn/utility-types';
import type { ActionsClient } from './actions_client';

type ActionsClientContract = PublicMethodsOf<ActionsClient>;
export type ActionsClientMock = jest.Mocked<ActionsClientContract>;

const createActionsClientMock = () => {
  const mocked: ActionsClientMock = {
    create: jest.fn(),
    createPreconfiguredConnector: jest.fn(),
    updatePreconfiguredConnector: jest.fn(),
    deletePreconfiguredConnector: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    getAll: jest.fn(),
    getAllSystemConnectors: jest.fn(),
    getAuthStatus: jest.fn(),
    getConnectorSpec: jest.fn(),
    getBulk: jest.fn(),
    getOAuthAccessToken: jest.fn(),
    execute: jest.fn(),
    bulkEnqueueExecution: jest.fn(),
    listTypes: jest.fn(),
    isActionTypeEnabled: jest.fn(),
    isPreconfigured: jest.fn(),
    isSystemAction: jest.fn(),
    getGlobalExecutionKpiWithAuth: jest.fn(),
    getGlobalExecutionLogWithAuth: jest.fn(),
    getAxiosInstance: jest.fn(),
  };
  return mocked;
};

export const actionsClientMock: {
  create: () => ActionsClientMock;
} = {
  create: createActionsClientMock,
};
