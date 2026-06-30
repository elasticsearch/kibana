/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApplicationStart } from '@kbn/core/public';
import { applicationServiceMock } from '@kbn/core-application-browser-mocks';
import { UserCapabilities } from './user_capabilities';

const buildService = (capabilities: Record<string, Record<string, boolean>>) => {
  const application = applicationServiceMock.createStartContract();
  return new UserCapabilities({
    ...application,
    capabilities: capabilities as ApplicationStart['capabilities'],
  });
};

describe('UserCapabilities', () => {
  describe('can', () => {
    it('returns true when the capability key is granted', () => {
      const caps = buildService({ alerting_v2_rules: { read: true, all: false } });
      expect(caps.can('rules', 'read')).toBe(true);
    });

    it('returns false when the capability key is denied', () => {
      const caps = buildService({ alerting_v2_rules: { read: true, all: false } });
      expect(caps.can('rules', 'all')).toBe(false);
    });

    it('returns false when the capability key is missing from the feature block', () => {
      const caps = buildService({ alerting_v2_rules: {} });
      expect(caps.can('rules', 'read')).toBe(false);
    });

    it('returns false when the feature block is entirely absent', () => {
      const caps = buildService({});
      expect(caps.can('rules', 'read')).toBe(false);
    });
  });

  describe('canRead', () => {
    it('maps to the top-level read capability for a feature', () => {
      const caps = buildService({ alerting_v2_alerts: { read: true, all: false } });
      expect(caps.canRead('alerts')).toBe(true);
    });

    it('returns true when only the all capability is granted (all implies read)', () => {
      const caps = buildService({ alerting_v2_alerts: { read: false, all: true } });
      expect(caps.canRead('alerts')).toBe(true);
    });

    it('returns false when neither read nor all is granted', () => {
      const caps = buildService({ alerting_v2_alerts: { read: false, all: false } });
      expect(caps.canRead('alerts')).toBe(false);
    });

    it('returns false when the feature block is absent', () => {
      const caps = buildService({});
      expect(caps.canRead('alerts')).toBe(false);
    });
  });

  describe('canWrite', () => {
    it('maps to the top-level all capability for a feature', () => {
      const caps = buildService({ alerting_v2_action_policies: { read: true, all: true } });
      expect(caps.canWrite('actionPolicies')).toBe(true);
    });

    it('returns false when the all capability is denied even if read is granted', () => {
      const caps = buildService({ alerting_v2_action_policies: { read: true, all: false } });
      expect(caps.canWrite('actionPolicies')).toBe(false);
    });

    it('returns false when the feature block is absent', () => {
      const caps = buildService({});
      expect(caps.canWrite('actionPolicies')).toBe(false);
    });
  });
});
