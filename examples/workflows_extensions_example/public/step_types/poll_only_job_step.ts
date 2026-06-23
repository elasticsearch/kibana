/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { createPublicStepDefinition } from '@kbn/workflows-extensions/public';
import { pollOnlyJobStepCommonDefinition } from '../../common/step_types/poll_only_job_step';

export const pollOnlyJobStepDefinition = createPublicStepDefinition({
  ...pollOnlyJobStepCommonDefinition,
  icon: React.lazy(() =>
    import('@elastic/eui/es/components/icon/assets/clock').then(({ icon }) => ({
      default: icon,
    }))
  ),
});
