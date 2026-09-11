/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { chunk } from 'lodash/fp';
import type { SecurityRuleChangeTracking } from '../../../../../../common/detection_engine/rule_management/rule_change_tracking';
import type { RuleToImport } from '../../../../../../common/api/detection_engine';
import { type BulkError, createBulkErrorObject } from '../../../routes/utils';
import type {
  IDetectionRulesClient,
  ImportRuleError,
} from '../detection_rules_client/detection_rules_client_interface';
import { RULE_IMPORT_BULK_CREATE_BATCH_SIZE } from '../../api/constants';

/**
 * Takes the parsed rules to be imported and either creates or updates rules
 * based on user overwrite preferences. Chunks at `RULE_IMPORT_BULK_CREATE_BATCH_SIZE`
 * so each call to `detectionRulesClient.importRules` — and the inner
 * `rulesClient.bulkCreateRules` — stays inside ES/alerting caps.
 */
export const importRules = async ({
  rules,
  changeTracking,
  overwriteRules,
  detectionRulesClient,
  allowMissingConnectorSecrets,
}: {
  rules: RuleToImport[];
  changeTracking?: SecurityRuleChangeTracking;
  overwriteRules: boolean;
  detectionRulesClient: IDetectionRulesClient;
  allowMissingConnectorSecrets?: boolean;
}): Promise<{ successes: Array<{ rule_id: string }>; errors: BulkError[] }> => {
  if (rules.length === 0) {
    return { successes: [], errors: [] };
  }

  const successes: Array<{ rule_id: string }> = [];
  const errors: BulkError[] = [];

  for (const batch of chunk(RULE_IMPORT_BULK_CREATE_BATCH_SIZE, rules)) {
    const result = await detectionRulesClient.importRules({
      allowMissingConnectorSecrets,
      overwriteRules,
      rules: batch,
      changeTracking,
    });
    successes.push(...result.successes.map(({ rule_id }) => ({ rule_id })));
    errors.push(...result.errors.map(toErrorResponse));
  }

  return { successes, errors };
};

const toErrorResponse = (item: ImportRuleError): BulkError => {
  const { ruleId, message, type } = item.error;

  return createBulkErrorObject({
    message,
    statusCode: type === 'conflict' ? 409 : 400,
    ruleId,
  });
};
