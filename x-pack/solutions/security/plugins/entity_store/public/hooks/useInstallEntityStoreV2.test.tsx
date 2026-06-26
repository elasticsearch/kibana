/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useInstallEntityStoreV2, type Services } from './useInstallEntityStoreV2';
import { EntityStoreStatus } from '../../common';
import { ENTITY_STORE_ROUTES } from '../../common';

interface MockServices {
  http: { get: jest.Mock; post: jest.Mock; fetch: jest.Mock };
  uiSettings: { get: jest.Mock };
  logger: { error: jest.Mock };
  spaces: { getActiveSpace: jest.Mock };
}

const createMockServices = (): MockServices => ({
  http: { get: jest.fn(), post: jest.fn(), fetch: jest.fn() },
  uiSettings: { get: jest.fn() },
  logger: { error: jest.fn() },
  spaces: { getActiveSpace: jest.fn() },
});

const asServices = (mock: MockServices): Services => mock as unknown as Services;

describe('useInstallEntityStoreV2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not auto-install in non-default space when v1 was never installed', async () => {
    const mockServices = createMockServices();
    mockServices.spaces.getActiveSpace.mockResolvedValue({ id: 'custom-space' });
    mockServices.http.get.mockResolvedValueOnce({ status: EntityStoreStatus.enum.not_installed });
    mockServices.http.fetch.mockResolvedValueOnce({ total: 0 });

    renderHook(() => useInstallEntityStoreV2(asServices(mockServices)));

    await waitFor(() => {
      expect(mockServices.http.fetch).toHaveBeenCalledTimes(1);
    });

    expect(mockServices.http.fetch).toHaveBeenCalledWith('/api/saved_objects/_find', {
      method: 'GET',
      query: { type: 'entity-engine-status', per_page: 0 },
    });
    expect(mockServices.http.post).not.toHaveBeenCalled();
  });

  it('should auto-install in non-default space when v1 was previously installed', async () => {
    const mockServices = createMockServices();

    mockServices.spaces.getActiveSpace.mockResolvedValue({ id: 'custom-space' });
    mockServices.http.get.mockResolvedValueOnce({ status: EntityStoreStatus.enum.not_installed });
    mockServices.http.fetch.mockResolvedValueOnce({ total: 2 });
    mockServices.http.post.mockResolvedValue({});

    renderHook(() => useInstallEntityStoreV2(asServices(mockServices)));

    await waitFor(() => {
      expect(mockServices.http.post).toHaveBeenCalledTimes(1);
    });

    expect(mockServices.http.post).toHaveBeenCalledWith({
      path: ENTITY_STORE_ROUTES.public.INSTALL,
      body: JSON.stringify({}),
    });
  });

  it('should init entity maintainers when not in default space and entity store is already running', async () => {
    const mockServices = createMockServices();

    mockServices.spaces.getActiveSpace.mockResolvedValue({ id: 'custom-space' });
    mockServices.http.get.mockResolvedValueOnce({ status: EntityStoreStatus.enum.running });
    mockServices.http.post.mockResolvedValue({});

    renderHook(() => useInstallEntityStoreV2(asServices(mockServices)));

    await waitFor(() => {
      expect(mockServices.http.post).toHaveBeenCalledTimes(1);
    });

    expect(mockServices.http.fetch).not.toHaveBeenCalled();
    expect(mockServices.http.post).toHaveBeenCalledWith({
      path: ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_INIT,
      body: JSON.stringify({}),
      query: { apiVersion: '2' },
    });
  });

  it('should init entity maintainers when entity store status is running in the default space', async () => {
    const mockServices = createMockServices();

    mockServices.spaces.getActiveSpace.mockResolvedValue({ id: 'default' });
    mockServices.http.get.mockResolvedValueOnce({ status: EntityStoreStatus.enum.running });
    mockServices.http.post.mockResolvedValue({});

    renderHook(() => useInstallEntityStoreV2(asServices(mockServices)));

    await waitFor(() => {
      expect(mockServices.http.post).toHaveBeenCalledTimes(1);
    });

    expect(mockServices.http.get).toHaveBeenCalledWith({
      path: ENTITY_STORE_ROUTES.public.STATUS,
      query: { include_components: false },
    });
    expect(mockServices.http.post).toHaveBeenCalledWith({
      path: ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_INIT,
      body: JSON.stringify({}),
      query: { apiVersion: '2' },
    });
    expect(mockServices.http.post).not.toHaveBeenCalledWith({
      path: ENTITY_STORE_ROUTES.public.INSTALL,
      body: JSON.stringify({}),
    });
  });

  it('installs entity store in the default space when not installed (install API inits maintainers)', async () => {
    const mockServices = createMockServices();

    mockServices.spaces.getActiveSpace.mockResolvedValue({ id: 'default' });
    mockServices.http.get.mockResolvedValueOnce({ status: EntityStoreStatus.enum.not_installed });
    mockServices.http.post.mockResolvedValue({});

    renderHook(() => useInstallEntityStoreV2(asServices(mockServices)));

    await waitFor(() => {
      expect(mockServices.http.post).toHaveBeenCalledTimes(1);
    });

    expect(mockServices.http.get).toHaveBeenCalledWith({
      path: ENTITY_STORE_ROUTES.public.STATUS,
      query: { include_components: false },
    });
    expect(mockServices.http.post).toHaveBeenCalledWith({
      path: ENTITY_STORE_ROUTES.public.INSTALL,
      body: JSON.stringify({}),
    });
    expect(mockServices.http.fetch).not.toHaveBeenCalled();
    expect(mockServices.http.post).not.toHaveBeenCalledWith({
      path: ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_INIT,
      body: JSON.stringify({}),
      query: { apiVersion: '2' },
    });
  });
});
