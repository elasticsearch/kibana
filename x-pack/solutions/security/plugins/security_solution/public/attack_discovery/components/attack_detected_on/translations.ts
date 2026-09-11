/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const DETECTED_ON_LABEL = (timestamp: string) =>
  i18n.translate('xpack.securitySolution.detectionEngine.attacks.group.subtitle.detectedOnLabel', {
    defaultMessage: 'Detected on {timestamp}',
    values: { timestamp },
  });
