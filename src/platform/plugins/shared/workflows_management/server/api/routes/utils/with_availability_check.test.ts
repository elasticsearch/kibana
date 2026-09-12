/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { httpServerMock } from '@kbn/core/server/mocks';
import { License } from '@kbn/licensing-plugin/common/license';
import { licenseMock } from '@kbn/licensing-plugin/common/licensing.mock';
import type { ILicense } from '@kbn/licensing-types';
import { withAvailabilityCheck } from './with_availability_check';
import type { WorkflowsRequestHandlerContext } from '../../../types';

const enterpriseLicense = () =>
  licenseMock.createLicense({
    license: { type: 'enterprise', mode: 'enterprise', status: 'active' },
  });

const basicLicense = () => licenseMock.createLicense();

const unavailableLicense = () =>
  new License({ error: 'Elasticsearch license API unavailable', signature: 'error-sig' });

const expiredEnterpriseLicense = () =>
  licenseMock.createLicense({
    license: { type: 'enterprise', mode: 'enterprise', status: 'expired' },
  });

function createWorkflowsContext({
  license,
  isWorkflowsAvailable = true,
  workflowsManagement = Promise.resolve(),
}: {
  license: ILicense;
  isWorkflowsAvailable?: boolean;
  workflowsManagement?: Promise<void>;
}): WorkflowsRequestHandlerContext {
  return {
    licensing: Promise.resolve({
      featureUsage: {} as never,
      license,
    }),
    workflows: Promise.resolve({
      isWorkflowsAvailable,
      emitEvent: jest.fn(),
      managedWorkflows: {
        install: jest.fn(),
        uninstall: jest.fn(),
        getWorkflowStatus: jest.fn(),
        execute: jest.fn(),
      },
    }),
    actions: {} as never,
    alerting: {} as never,
    workflowsManagement,
  } as unknown as WorkflowsRequestHandlerContext;
}

describe('withAvailabilityCheck', () => {
  const request = httpServerMock.createKibanaRequest();

  describe('license check', () => {
    it('calls the route handler when license is available, active, and enterprise', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const wrapped = withAvailabilityCheck(handler);
      const response = httpServerMock.createResponseFactory();
      const context = createWorkflowsContext({ license: enterpriseLicense() });

      await wrapped(context, request as never, response);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(context, request as never, response);
      expect(response.forbidden).not.toHaveBeenCalled();
    });

    it('returns forbidden when license information is not available', async () => {
      const handler = jest.fn();
      const wrapped = withAvailabilityCheck(handler);
      const response = httpServerMock.createResponseFactory();

      await wrapped(
        createWorkflowsContext({ license: unavailableLicense() }),
        request as never,
        response
      );

      expect(handler).not.toHaveBeenCalled();
      expect(response.forbidden).toHaveBeenCalledTimes(1);
      expect(response.forbidden).toHaveBeenCalledWith({
        body: expect.stringContaining('License information is not available'),
      });
    });

    it('returns forbidden when license is not active', async () => {
      const handler = jest.fn();
      const wrapped = withAvailabilityCheck(handler);
      const response = httpServerMock.createResponseFactory();

      await wrapped(
        createWorkflowsContext({ license: expiredEnterpriseLicense() }),
        request as never,
        response
      );

      expect(handler).not.toHaveBeenCalled();
      expect(response.forbidden).toHaveBeenCalledWith({
        body: expect.stringContaining('expired'),
      });
    });

    it('returns forbidden when license tier is below enterprise', async () => {
      const handler = jest.fn();
      const wrapped = withAvailabilityCheck(handler);
      const response = httpServerMock.createResponseFactory();

      await wrapped(
        createWorkflowsContext({ license: basicLicense() }),
        request as never,
        response
      );

      expect(handler).not.toHaveBeenCalled();
      expect(response.forbidden).toHaveBeenCalledWith({
        body: expect.stringContaining('does not support Workflows'),
      });
    });
  });

  describe('serverless availability check', () => {
    it('waits for the data-view bootstrap context before calling the handler', async () => {
      let completeBootstrap: () => void = () => {};
      const workflowsManagement = new Promise<void>((resolve) => {
        completeBootstrap = resolve;
      });
      const handler = jest.fn().mockResolvedValue(undefined);
      const wrapped = withAvailabilityCheck(handler);
      const response = httpServerMock.createResponseFactory();
      const result = wrapped(
        createWorkflowsContext({ license: enterpriseLicense(), workflowsManagement }),
        request as never,
        response
      );

      await Promise.resolve();
      expect(handler).not.toHaveBeenCalled();

      completeBootstrap();
      await result;
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('calls the route handler when workflows are available in this environment', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const wrapped = withAvailabilityCheck(handler);
      const response = httpServerMock.createResponseFactory();
      const context = createWorkflowsContext({
        license: enterpriseLicense(),
        isWorkflowsAvailable: true,
      });

      await wrapped(context, request as never, response);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(context, request as never, response);
      expect(response.forbidden).not.toHaveBeenCalled();
    });

    it('returns forbidden when workflows are not available in this environment', async () => {
      const handler = jest.fn();
      const wrapped = withAvailabilityCheck(handler);
      const response = httpServerMock.createResponseFactory();

      await wrapped(
        createWorkflowsContext({
          license: enterpriseLicense(),
          isWorkflowsAvailable: false,
        }),
        request as never,
        response
      );

      expect(handler).not.toHaveBeenCalled();
      expect(response.forbidden).toHaveBeenCalledTimes(1);
      expect(response.forbidden).toHaveBeenCalledWith({
        body: {
          message: expect.stringContaining('Your project does not have Workflows available'),
        },
      });
    });

    it('does not run the serverless availability check when the license check fails', async () => {
      const handler = jest.fn();
      const wrapped = withAvailabilityCheck(handler);
      const response = httpServerMock.createResponseFactory();

      await wrapped(
        createWorkflowsContext({
          license: basicLicense(),
          isWorkflowsAvailable: false,
        }),
        request as never,
        response
      );

      expect(handler).not.toHaveBeenCalled();
      expect(response.forbidden).toHaveBeenCalledTimes(1);
      expect(response.forbidden).toHaveBeenCalledWith({
        body: expect.stringContaining('does not support Workflows'),
      });
    });
  });
});
