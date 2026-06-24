/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FeatureKibanaPrivileges } from '@kbn/features-plugin/server';

import { BaseFeaturePrivilegeBuilder } from './feature_privilege_builder';

export class FeaturePrivilegeAlertsBuilder extends BaseFeaturePrivilegeBuilder {
  public getActions(privilegeDefinition: FeatureKibanaPrivileges): string[] {
    if (privilegeDefinition.alerts?.read) {
      return [this.actions.alerts.read];
    }

    return [];
  }
}
