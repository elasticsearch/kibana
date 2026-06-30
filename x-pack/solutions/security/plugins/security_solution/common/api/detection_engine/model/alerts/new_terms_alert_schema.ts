/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConvertSchemaType } from '@kbn/rule-registry-plugin/common/schemas/schema';
import type { ALERT_NEW_TERMS } from '../../../../field_maps/field_names';
import type { DetectionAlertLatest } from './schema';

type Version840 = '8.4.0';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type NewTermsAlertFields = {
  [ALERT_NEW_TERMS]: {
    type: Array<string | number | boolean | null>;
    version: Version840;
  };
};

export type NewTermsAlertLatest = ConvertSchemaType<string, NewTermsAlertFields> &
  DetectionAlertLatest;
