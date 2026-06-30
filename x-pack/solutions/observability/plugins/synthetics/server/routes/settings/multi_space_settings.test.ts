/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { SyntheticsMultiSpaceSettingsWithSpaces } from '../../../common/runtime_types';
import { DefaultSyntheticsMultiSpaceSettingsRepository } from '../../services/synthetics_multi_space_settings_repository';
import type { RouteContext } from '../types';
import {
  createGetMultiSpaceSettingsRoute,
  createPutMultiSpaceSettingsRoute,
} from './multi_space_settings';

const NOT_FOUND_SENTINEL = { status: 404 };

const buildServer = ({
  isElasticsearchServerless = false,
}: { isElasticsearchServerless?: boolean } = {}) =>
  ({
    isElasticsearchServerless,
  } as unknown as RouteContext['server']);

const buildResponse = () =>
  ({
    notFound: jest.fn().mockReturnValue(NOT_FOUND_SENTINEL),
  } as unknown as RouteContext['response']);

const buildRouteContext = (overrides: Partial<RouteContext> = {}): RouteContext =>
  ({
    savedObjectsClient: savedObjectsClientMock.create(),
    server: buildServer(),
    response: buildResponse(),
    ...overrides,
  } as unknown as RouteContext);

describe('multi space settings routes', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createGetMultiSpaceSettingsRoute', () => {
    it('returns the settings produced by the repository on stateful', async () => {
      const expected: SyntheticsMultiSpaceSettingsWithSpaces = {
        useAllRemoteClusters: true,
        selectedRemoteClusters: ['cluster-a'],
        spaces: ['default'],
      };
      const getSpy = jest
        .spyOn(DefaultSyntheticsMultiSpaceSettingsRepository.prototype, 'get')
        .mockResolvedValue(expected);

      const route = createGetMultiSpaceSettingsRoute();
      const result = await route.handler(buildRouteContext());

      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expected);
    });

    it('returns 404 when running on serverless', async () => {
      const getSpy = jest.spyOn(DefaultSyntheticsMultiSpaceSettingsRepository.prototype, 'get');
      const response = buildResponse();

      const route = createGetMultiSpaceSettingsRoute();
      const result = await route.handler(
        buildRouteContext({
          server: buildServer({ isElasticsearchServerless: true }),
          response,
        })
      );

      expect(response.notFound).toHaveBeenCalledTimes(1);
      expect(result).toBe(NOT_FOUND_SENTINEL);
      expect(getSpy).not.toHaveBeenCalled();
    });
  });

  describe('createPutMultiSpaceSettingsRoute', () => {
    it('persists attributes via the repository without spaces when none are provided', async () => {
      const expected: SyntheticsMultiSpaceSettingsWithSpaces = {
        useAllRemoteClusters: true,
        selectedRemoteClusters: ['cluster-a'],
        spaces: ['default'],
      };
      const saveSpy = jest
        .spyOn(DefaultSyntheticsMultiSpaceSettingsRepository.prototype, 'save')
        .mockResolvedValue(expected);

      const route = createPutMultiSpaceSettingsRoute();
      const body = { useAllRemoteClusters: true, selectedRemoteClusters: ['cluster-a'] };
      const result = await route.handler(
        buildRouteContext({ request: { body } as unknown as RouteContext['request'] })
      );

      expect(saveSpy).toHaveBeenCalledWith(body, undefined);
      expect(result).toEqual(expected);
    });

    it('forwards the spaces array to the repository', async () => {
      const expected: SyntheticsMultiSpaceSettingsWithSpaces = {
        useAllRemoteClusters: true,
        selectedRemoteClusters: ['cluster-a'],
        spaces: ['default', 'marketing'],
      };
      const saveSpy = jest
        .spyOn(DefaultSyntheticsMultiSpaceSettingsRepository.prototype, 'save')
        .mockResolvedValue(expected);

      const route = createPutMultiSpaceSettingsRoute();
      const body = {
        useAllRemoteClusters: true,
        selectedRemoteClusters: ['cluster-a'],
        spaces: ['default', 'marketing'],
      };
      const result = await route.handler(
        buildRouteContext({ request: { body } as unknown as RouteContext['request'] })
      );

      expect(saveSpy).toHaveBeenCalledWith(
        { useAllRemoteClusters: true, selectedRemoteClusters: ['cluster-a'] },
        ['default', 'marketing']
      );
      expect(result).toEqual(expected);
    });

    it('returns 404 on serverless without persisting anything', async () => {
      const saveSpy = jest.spyOn(DefaultSyntheticsMultiSpaceSettingsRepository.prototype, 'save');
      const response = buildResponse();

      const route = createPutMultiSpaceSettingsRoute();
      const result = await route.handler(
        buildRouteContext({
          server: buildServer({ isElasticsearchServerless: true }),
          response,
          request: { body: { useAllRemoteClusters: true } } as unknown as RouteContext['request'],
        })
      );

      expect(response.notFound).toHaveBeenCalledTimes(1);
      expect(result).toBe(NOT_FOUND_SENTINEL);
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });
});
