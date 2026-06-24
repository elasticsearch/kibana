/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FeatureKibanaPrivileges } from '@kbn/features-plugin/server';

import { FeaturePrivilegeAlertsBuilder } from './alerts';
import { Actions } from '../../actions';

const createPrivilege = (alerts?: FeatureKibanaPrivileges['alerts']): FeatureKibanaPrivileges => ({
  ...(alerts ? { alerts } : {}),
  savedObject: {
    all: [],
    read: [],
  },
  ui: [],
});

describe(`alerts`, () => {
  describe(`feature_privilege_builder`, () => {
    it('grants no privileges when the `alerts` privilege is not defined', () => {
      const actions = new Actions();
      const alertsFeaturePrivilege = new FeaturePrivilegeAlertsBuilder(actions);

      expect(alertsFeaturePrivilege.getActions(createPrivilege())).toEqual([]);
    });

    it('grants the `alerts:read` action when `alerts.read` is `true`', () => {
      const actions = new Actions();
      const alertsFeaturePrivilege = new FeaturePrivilegeAlertsBuilder(actions);

      expect(alertsFeaturePrivilege.getActions(createPrivilege({ read: true }))).toEqual([
        'alerts:read',
      ]);
    });

    it('grants no privileges when `alerts.read` is `false`', () => {
      const actions = new Actions();
      const alertsFeaturePrivilege = new FeaturePrivilegeAlertsBuilder(actions);

      expect(alertsFeaturePrivilege.getActions(createPrivilege({ read: false }))).toEqual([]);
    });
  });
});
