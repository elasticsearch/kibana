/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { KibanaRequest, SavedObjectsClientContract } from '@kbn/core/server';
import { CasesAnalyticsV2Service, V2_NOOP_DATA_VIEW_REFRESHER } from './service';
import { V2_NOOP_WRITER, type CasesAnalyticsV2WriterContract } from './writer';

describe('CasesAnalyticsV2Service', () => {
  describe('writer proxy ↔ contract parity', () => {
    // Regression guard: the writer proxy held inside the service is what the
    // reconciliation task and SO-service hooks actually call. If a new method
    // is added to `CasesAnalyticsV2WriterContract` and only the real writer +
    // no-op constant are updated (forgetting the proxy), reconciliation
    // crashes at runtime with "writer.<method> is not a function". This test
    // fails the moment that drift happens.
    it('proxies every method on CasesAnalyticsV2WriterContract', () => {
      const service = new CasesAnalyticsV2Service({
        logger: loggerMock.create(),
        enabled: false, // doesn't matter for proxy shape
        reconciliationIntervalMinutes: 30,
        enableAdminRoutes: false,
        resetTaskTimeoutMinutes: 60,
        resetPageDelayMs: 0,
        templatesEnabled: true,
      });
      const proxy = service.getWriter();

      // The no-op constant is the canonical implementation of the contract —
      // every key on it must exist as a function on the proxy.
      const contractKeys = Object.keys(V2_NOOP_WRITER) as Array<
        keyof CasesAnalyticsV2WriterContract
      >;
      expect(contractKeys.length).toBeGreaterThan(0); // sanity

      for (const key of contractKeys) {
        expect(typeof proxy[key]).toBe('function');
      }
    });
  });

  describe('data view refresher proxy', () => {
    // Same pattern as the writer proxy: the refresher reference is captured
    // by the cases client factory once at initialize-time and bound into
    // every templates service instance. It must stay stable + always
    // resolvable across the v2 service's whole lifecycle.

    it('returns the same callable reference across calls', () => {
      const service = new CasesAnalyticsV2Service({
        logger: loggerMock.create(),
        enabled: false,
        reconciliationIntervalMinutes: 30,
        enableAdminRoutes: false,
        resetTaskTimeoutMinutes: 60,
        resetPageDelayMs: 0,
        templatesEnabled: true,
      });
      const refA = service.getDataViewRefresher();
      const refB = service.getDataViewRefresher();

      expect(refA).toBe(refB);
      expect(typeof refA).toBe('function');
    });

    it('no-ops safely when v2 is disabled (no underlying data view service)', () => {
      const service = new CasesAnalyticsV2Service({
        logger: loggerMock.create(),
        enabled: false,
        reconciliationIntervalMinutes: 30,
        enableAdminRoutes: false,
        resetTaskTimeoutMinutes: 60,
        resetPageDelayMs: 0,
        templatesEnabled: true,
      });
      const refresher = service.getDataViewRefresher();

      expect(() =>
        refresher({
          spaceId: 'default',
          request: {} as unknown as KibanaRequest,
          savedObjectsClient: {} as unknown as SavedObjectsClientContract,
        })
      ).not.toThrow();
    });

    it('exposes a no-op sentinel for callers that need a default before the service initializes', () => {
      expect(typeof V2_NOOP_DATA_VIEW_REFRESHER).toBe('function');
      // No-op sentinel must accept the same shape callers will actually pass.
      expect(() =>
        V2_NOOP_DATA_VIEW_REFRESHER({
          spaceId: 'default',
          request: {} as unknown as KibanaRequest,
          savedObjectsClient: {} as unknown as SavedObjectsClientContract,
        })
      ).not.toThrow();
      // Returns void.
      expect(
        V2_NOOP_DATA_VIEW_REFRESHER({
          spaceId: 'default',
          request: {} as unknown as KibanaRequest,
          savedObjectsClient: {} as unknown as SavedObjectsClientContract,
        })
      ).toBeUndefined();
    });
  });
});
