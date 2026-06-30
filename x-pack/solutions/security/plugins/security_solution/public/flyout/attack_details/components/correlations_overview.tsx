/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { CorrelationsOverview as V2CorrelationsOverview } from '../../../flyout_v2/attack/main/components/correlations_overview';
import { useAttackDetailsContext } from '../context';

/**
 * Legacy wrapper: reads attack from context and delegates to the prop-driven v2 component.
 */
export const CorrelationsOverview: React.FC = memo(() => {
  const { attack } = useAttackDetailsContext();

  if (!attack) {
    return null;
  }

  return <V2CorrelationsOverview attack={attack} />;
});

CorrelationsOverview.displayName = 'CorrelationsOverview';
