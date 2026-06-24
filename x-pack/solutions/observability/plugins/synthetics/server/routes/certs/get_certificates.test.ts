/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as getAllMonitors from '../../saved_objects/synthetics_monitor/process_monitors';
import * as getCerts from '../../queries/get_certs';
import { getSyntheticsCertsRoute } from './get_certificates';
import { MonitorConfigRepository } from '../../services/monitor_config_repository';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';

const buildServer = (ccsEnabled: boolean) =>
  ({
    isElasticsearchServerless: false,
    config: {
      experimental: {
        ccs: { enabled: ccsEnabled },
      },
    },
  } as any);

describe('getSyntheticsCertsRoute', () => {
  afterEach(() => jest.clearAllMocks());
  const soClient = savedObjectsClientMock.create();
  const encryptedSavedObjectsClient = encryptedSavedObjectsMock.createStart().getClient();

  const mockMonitorConfigRepository = new MonitorConfigRepository(
    soClient,
    encryptedSavedObjectsClient
  );

  it('returns empty set when no monitors are found and CCS is disabled', async () => {
    const route = getSyntheticsCertsRoute();
    mockMonitorConfigRepository.getAll = jest.fn().mockReturnValue([]);
    expect(
      await route.handler({
        // @ts-expect-error partial implementation for testing
        request: { query: {} },
        // @ts-expect-error partial implementation for testing
        syntheticsEsClient: jest.fn(),
        savedObjectClient: soClient,
        monitorConfigRepository: mockMonitorConfigRepository,
        server: buildServer(false),
        spaceId: 'default',
      })
    ).toEqual({
      data: {
        certs: [],
        total: 0,
      },
    });
    expect(mockMonitorConfigRepository.getAll).toHaveBeenCalledTimes(1);
  });

  it('returns cert data when monitors are found', async () => {
    const getMonitorsResult = [
      {
        id: 'test-id',
        monitor: {
          type: 'browser',
          name: 'test-monitor',
          enabled: true,
          schedule: {
            interval: 1,
            timezone: 'UTC',
          },
        },
      },
    ] as any;
    const processMonitorsSpy = jest.spyOn(getAllMonitors, 'processMonitors').mockReturnValue({
      // @ts-expect-error partial implementation for testing
      enableMonitorQueryIds: ['test-id'],
    });
    const getCertsResult = {
      total: 1,
      certs: [
        {
          monitors: [
            {
              name: 'test-monitor',
              id: 'test-id',
              configId: 'test-id',
              url: 'https://elastic.co',
            },
          ],
          sha256: 'some-hash',
          configId: 'test-id',
        },
      ],
    };
    const getSyntheticsCertsSpy = jest
      .spyOn(getCerts, 'getSyntheticsCerts')
      // @ts-expect-error partial implementation for testing
      .mockReturnValue(getCertsResult);
    const route = getSyntheticsCertsRoute();
    const getAll = jest.fn().mockReturnValue(getMonitorsResult);
    const result = await route.handler({
      // @ts-expect-error partial implementation for testing
      request: { query: {} },
      // @ts-expect-error partial implementation for testing
      syntheticsEsClient: jest.fn(),
      savedObjectClient: jest.fn(),
      // @ts-expect-error partial implementation for testing
      monitorConfigRepository: { getAll },
      server: buildServer(false),
      spaceId: 'default',
    });
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(processMonitorsSpy).toHaveBeenCalledTimes(1);
    expect(processMonitorsSpy).toHaveBeenCalledWith(getMonitorsResult);
    expect(getSyntheticsCertsSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: { ...getCertsResult } });
  });

  it('runs the cert search even with no local monitors when CCS is enabled', async () => {
    // Remote-only monitors have no local SO; the search itself surfaces them
    // via the route wrapper's CCS-expanded index pattern.
    // @ts-expect-error partial implementation for testing
    jest.spyOn(getAllMonitors, 'processMonitors').mockReturnValue({
      enabledMonitorQueryIds: [],
    });
    const remoteOnlyCerts = {
      total: 1,
      certs: [
        {
          monitors: [
            {
              name: 'remote-monitor',
              id: 'remote-id',
              configId: 'remote-id',
              url: 'https://example.com',
              remote: { remoteName: 'cluster1' },
            },
          ],
          sha256: 'remote-hash',
          configId: 'remote-id',
          remote: { remoteName: 'cluster1' },
        },
      ],
    };
    const getSyntheticsCertsSpy = jest
      .spyOn(getCerts, 'getSyntheticsCerts')
      // @ts-expect-error partial implementation for testing
      .mockReturnValue(remoteOnlyCerts);
    const route = getSyntheticsCertsRoute();
    const getAll = jest.fn().mockReturnValue([]);
    const result = await route.handler({
      // @ts-expect-error partial implementation for testing
      request: { query: { remoteNames: 'cluster1,cluster2' } },
      // @ts-expect-error partial implementation for testing
      syntheticsEsClient: jest.fn(),
      // @ts-expect-error partial implementation for testing
      monitorConfigRepository: { getAll },
      server: buildServer(true),
      spaceId: 'default',
    });
    expect(getSyntheticsCertsSpy).toHaveBeenCalledTimes(1);
    const passed = getSyntheticsCertsSpy.mock.calls[0][0];
    expect(passed).toMatchObject({
      ccsEnabled: true,
      remoteNames: ['cluster1', 'cluster2'],
      spaceId: 'default',
      includeBrowserCerts: true,
    });
    expect(result).toEqual({ data: { ...remoteOnlyCerts } });
  });
});
