/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { PublicTriggerDefinition } from '@kbn/workflows-extensions/public';
import { entityRiskScoreChangedTriggerDefinition } from '../../../common/workflow/triggers';

export const entityRiskScoreChangedPublicDefinition: PublicTriggerDefinition = {
  ...entityRiskScoreChangedTriggerDefinition,
  icon: React.lazy(() =>
    import('@elastic/eui/es/components/icon/assets/sortable').then(({ icon }) => ({
      default: icon,
    }))
  ),
};
