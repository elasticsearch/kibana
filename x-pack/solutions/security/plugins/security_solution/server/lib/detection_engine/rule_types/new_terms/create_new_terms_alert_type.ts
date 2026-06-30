/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { firstValueFrom } from 'rxjs';

import { NEW_TERMS_RULE_TYPE_ID } from '@kbn/securitysolution-rules';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core-application-common';

import { SERVER_APP_ID } from '../../../../../common/constants';

import { NewTermsRuleParams } from '../../rule_schema';
import type { SecurityAlertType } from '../types';
import { validateIndexPatterns } from '../utils';
import {
  hasCrossClusterIndices,
  hasDataViewRuntimeFields,
  hasFieldsWithUnsupportedEsqlTypes,
  validateHistoryWindowStart,
} from './utils';
import { executeNewTermsAggregationApproach } from './execute_new_terms_aggregation_approach';
import { executeNewTermsEsqlApproach } from './execute_new_terms_esql_approach';

export const createNewTermsAlertType = (): SecurityAlertType<
  NewTermsRuleParams,
  { isLoggedRequestsEnabled?: boolean }
> => {
  return {
    id: NEW_TERMS_RULE_TYPE_ID,
    name: 'New Terms Rule',
    validate: {
      params: {
        validate: (object: unknown) => {
          const validated = NewTermsRuleParams.parse(object);
          validateHistoryWindowStart({
            historyWindowStart: validated.historyWindowStart,
            from: validated.from,
          });
          return validated;
        },
        /**
         * validate rule params when rule is bulk edited (update and created in future as well)
         * returned params can be modified (useful in case of version increment)
         * @param mutatedRuleParams
         * @returns mutatedRuleParams
         */
        validateMutatedParams: (mutatedRuleParams) => {
          validateIndexPatterns(mutatedRuleParams.index);

          return mutatedRuleParams;
        },
      },
    },
    schemas: {
      params: {
        type: 'zod',
        schema: NewTermsRuleParams,
      },
    },
    actionGroups: [
      {
        id: 'default',
        name: 'Default',
      },
    ],
    defaultActionGroupId: 'default',
    actionVariables: {
      context: [{ name: 'server', description: 'the server' }],
    },
    minimumLicenseRequired: 'basic',
    isExportable: false,
    category: DEFAULT_APP_CATEGORIES.security.id,
    producer: SERVER_APP_ID,
    solution: 'security',
    async executor(execOptions) {
      const { licensing, inputIndex, runtimeMappings, experimentalFeatures, ruleExecutionLogger } =
        execOptions.sharedParams;
      const { newTermsFields } = execOptions.params;

      if (!experimentalFeatures.newTermsEsqlApproachEnabled) {
        ruleExecutionLogger.debug('New Terms: using aggregation approach (feature flag disabled)');
        return executeNewTermsAggregationApproach(execOptions);
      }

      const license = await firstValueFrom(licensing.license$);
      const hasEnterpriseLicense = license.hasAtLeast('enterprise');

      if (!hasEnterpriseLicense && hasCrossClusterIndices(inputIndex)) {
        ruleExecutionLogger.debug(
          'New Terms: using aggregation approach (cross-cluster indices without enterprise license)'
        );
        return executeNewTermsAggregationApproach(execOptions);
      }

      if (hasDataViewRuntimeFields({ fields: newTermsFields, runtimeMappings })) {
        ruleExecutionLogger.debug(
          'New Terms: using aggregation approach (data view runtime field used as a new terms field)'
        );
        return executeNewTermsAggregationApproach(execOptions);
      }

      let hasUnsupportedFields = false;
      try {
        hasUnsupportedFields = await hasFieldsWithUnsupportedEsqlTypes({
          esClient: execOptions.services.scopedClusterClient.asCurrentUser,
          index: inputIndex,
          fields: newTermsFields,
        });
      } catch (_error) {
        ruleExecutionLogger.debug(
          'New Terms: using aggregation approach (field_caps check failed)'
        );
        return executeNewTermsAggregationApproach(execOptions);
      }

      if (hasUnsupportedFields) {
        ruleExecutionLogger.debug(
          'New Terms: using aggregation approach (unsupported field types: nested or flattened)'
        );
        return executeNewTermsAggregationApproach(execOptions);
      }

      ruleExecutionLogger.debug('New Terms: using ES|QL approach');
      return executeNewTermsEsqlApproach(execOptions);
    },
  };
};
