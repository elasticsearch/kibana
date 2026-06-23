/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertingAuthorizationFilterOpts } from '../../authorization';
import { AlertingAuthorizationFilterType } from '../../authorization';

export {
  systemConnectorActionRefPrefix,
  preconfiguredConnectorActionRefPrefix,
} from '../../../common';

// NOTE: Changing this prefix will require a migration to update the prefix in all existing `rule` saved objects
export const extractedSavedObjectParamReferenceNamePrefix = 'param:';

export const alertingAuthorizationFilterOpts: AlertingAuthorizationFilterOpts = {
  type: AlertingAuthorizationFilterType.KQL,
  fieldNames: { ruleTypeId: 'alert.attributes.alertTypeId', consumer: 'alert.attributes.consumer' },
};

export const MAX_RULES_NUMBER_FOR_BULK_OPERATION = 10000;
export const API_KEY_GENERATE_CONCURRENCY = 50;
export const RULE_TYPE_CHECKS_CONCURRENCY = 50;

export const MIN_BULK_CREATE_BATCH_SIZE = 10;
export const DEFAULT_BULK_CREATE_BATCH_SIZE = 100;
export const MAX_BULK_CREATE_BATCH_SIZE = 500;
