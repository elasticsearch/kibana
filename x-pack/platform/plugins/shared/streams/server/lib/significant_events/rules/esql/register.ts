/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertInstanceContext, RuleTypeState } from '@kbn/alerting-plugin/server';
import { alertFieldMap } from '@kbn/alerts-as-data-utils';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import type { LicenseType } from '@kbn/licensing-types';
import { STREAMS_ESQL_RULE_TYPE_ID } from '@kbn/rule-data-utils';
import type { PersistenceAlertType } from '@kbn/rule-registry-plugin/server';
import {
  STREAMS_PRODUCER,
  STREAMS_RULE_REGISTRATION_CONTEXT,
} from '../../../../../common/constants';
import { getRuleExecutor } from './executor';
import type { EsqlRuleParams } from './types';
import { esqlRuleParams } from './types';

export function esqlRuleType(): PersistenceAlertType<
  EsqlRuleParams,
  RuleTypeState,
  AlertInstanceContext,
  'default'
> {
  return {
    id: STREAMS_ESQL_RULE_TYPE_ID,
    name: 'ES|QL Rule',
    validate: {
      params: {
        validate: (object: unknown) => {
          return esqlRuleParams.parse(object);
        },
      },
    },
    schemas: {
      params: { type: 'zod', schema: esqlRuleParams },
    },
    defaultActionGroupId: 'default',
    actionGroups: [
      {
        id: 'default',
        name: 'Default',
      },
    ],
    minimumLicenseRequired: 'enterprise' as LicenseType,
    category: DEFAULT_APP_CATEGORIES.observability.id,
    producer: STREAMS_PRODUCER,
    solution: 'observability',
    isExportable: false,
    actionVariables: {},
    executor: getRuleExecutor,
    autoRecoverAlerts: false,
    alerts: {
      context: STREAMS_RULE_REGISTRATION_CONTEXT,
      mappings: { dynamic: false, fieldMap: { ...alertFieldMap } },
      shouldWrite: false,
      isSpaceAware: false,
      dangerouslyCreateAlertsInAllSpaces: true,
    },
    internallyManaged: true,
  };
}
