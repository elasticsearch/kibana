/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { deriveEntityAnalyticsStatus } from './use_entity_analytics_status';

describe('deriveEntityAnalyticsStatus', () => {
  describe('when a mutation is loading', () => {
    it('returns enabling regardless of entity store status', () => {
      expect(
        deriveEntityAnalyticsStatus({
          entityStoreStatus: 'running',
          isMutationLoading: true,
        })
      ).toBe('enabling');
    });
  });

  describe('when entity store is installing', () => {
    it('returns enabling', () => {
      expect(
        deriveEntityAnalyticsStatus({
          entityStoreStatus: 'installing',
        })
      ).toBe('enabling');
    });
  });

  describe('when entity store has an error', () => {
    it('returns error', () => {
      expect(
        deriveEntityAnalyticsStatus({
          entityStoreStatus: 'error',
        })
      ).toBe('error');
    });
  });

  describe('when entity store is running', () => {
    it('returns enabled', () => {
      expect(
        deriveEntityAnalyticsStatus({
          entityStoreStatus: 'running',
        })
      ).toBe('enabled');
    });
  });

  describe('when entity store is stopped', () => {
    it('returns disabled', () => {
      expect(
        deriveEntityAnalyticsStatus({
          entityStoreStatus: 'stopped',
        })
      ).toBe('disabled');
    });
  });

  describe('when entity store is not_installed', () => {
    it('returns not_installed', () => {
      expect(
        deriveEntityAnalyticsStatus({
          entityStoreStatus: 'not_installed',
        })
      ).toBe('not_installed');
    });

    it('returns not_installed when status is undefined', () => {
      expect(deriveEntityAnalyticsStatus({})).toBe('not_installed');
    });
  });
});
