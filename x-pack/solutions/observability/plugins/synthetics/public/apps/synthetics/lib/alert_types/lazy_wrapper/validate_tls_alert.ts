/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ValidationResult } from '@kbn/triggers-actions-ui-plugin/public';
import { TLSParamsType } from '../../../../../../common/runtime_types/zod/alerts';
import { formatZodErrors } from '../../../../../../common/runtime_types/zod/format_errors';

export function validateTLSAlertParams(ruleParams: any): ValidationResult {
  const errors: Record<string, any> = {};
  const decoded = TLSParamsType.safeParse(ruleParams);

  if (!decoded.success) {
    return {
      errors: {
        typeCheckFailure: 'Provided parameters do not conform to the expected type.',
        typeCheckParsingMessage: formatZodErrors(decoded.error, { input: ruleParams }),
      },
    };
  }

  return { errors };
}
