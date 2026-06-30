/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_DETECTIONS_CLOSE_REASONS_KEY } from '../../../../../../common/constants';
import { AlertStatusEnum, type Reason } from '../../../../../../common/api/model';
import type { SecuritySolutionRequestHandlerContext } from '../../../../../types';
import { DefaultClosingReasonSchema } from '../../../../../../common/types';
import { ALERT_CLOSING_REASON_VALIDATION_ERROR } from '../../signals/translations';

type ValidateClosingReasonResult =
  | { valid: true; reason?: string }
  | { valid: false; message: string };

/**
 * Validates a closing reason against the list of default and custom (advanced settings) reasons.
 *
 * - When `status` is not `closed`, no reason applies and `{ valid: true, reason: undefined }` is returned.
 * - When the reason is omitted or recognized, `{ valid: true, reason }` is returned.
 * - When the reason is unknown, `{ valid: false, message }` is returned for the route to map to a 400.
 */
export const validateClosingReason = async ({
  core,
  status,
  reason,
}: {
  core: Awaited<SecuritySolutionRequestHandlerContext['core']>;
  status: string;
  reason?: string;
}): Promise<ValidateClosingReasonResult> => {
  if (status !== AlertStatusEnum.closed) {
    return { valid: true, reason: undefined };
  }

  const customReasons =
    (await core.uiSettings.client.get<Reason[]>(DEFAULT_DETECTIONS_CLOSE_REASONS_KEY)) ?? [];
  const validReasons = new Set([...DefaultClosingReasonSchema.options, ...customReasons]);

  if (reason === undefined || validReasons.has(reason)) {
    return { valid: true, reason };
  }

  return { valid: false, message: ALERT_CLOSING_REASON_VALIDATION_ERROR(reason) };
};
