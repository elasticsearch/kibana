/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { flatten } from 'lodash';

import type { FeatureKibanaPrivileges, KibanaFeature } from '@kbn/features-plugin/server';

import { FeaturePrivilegeAlertingBuilder } from './alerting';
import { FeaturePrivilegeAlertsBuilder } from './alerts';
import { FeaturePrivilegeApiBuilder } from './api';
import { FeaturePrivilegeAppBuilder } from './app';
import { FeaturePrivilegeCasesBuilder } from './cases';
import { FeaturePrivilegeCatalogueBuilder } from './catalogue';
import type { FeaturePrivilegeBuilder } from './feature_privilege_builder';
import { FeaturePrivilegeManagementBuilder } from './management';
import { FeaturePrivilegeNavlinkBuilder } from './navlink';
import { FeaturePrivilegeSavedObjectBuilder } from './saved_object';
import { FeaturePrivilegeUIBuilder } from './ui';
import type { Actions } from '../../actions';

export type { CasesSupportedOperations } from './cases';
export type { FeaturePrivilegeBuilder };

export const featurePrivilegeBuilderFactory = (actions: Actions): FeaturePrivilegeBuilder => {
  const builders = [
    new FeaturePrivilegeAlertsBuilder(actions),
    new FeaturePrivilegeApiBuilder(actions),
    new FeaturePrivilegeAppBuilder(actions),
    new FeaturePrivilegeCatalogueBuilder(actions),
    new FeaturePrivilegeManagementBuilder(actions),
    new FeaturePrivilegeNavlinkBuilder(actions),
    new FeaturePrivilegeSavedObjectBuilder(actions),
    new FeaturePrivilegeUIBuilder(actions),
    new FeaturePrivilegeAlertingBuilder(actions),
    new FeaturePrivilegeCasesBuilder(actions),
  ];

  return {
    getActions(privilege: FeatureKibanaPrivileges, feature: KibanaFeature) {
      return flatten(builders.map((builder) => builder.getActions(privilege, feature)));
    },
  };
};
