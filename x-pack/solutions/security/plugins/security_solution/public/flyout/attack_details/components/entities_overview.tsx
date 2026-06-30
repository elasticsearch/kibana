/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { EntitiesOverview as V2EntitiesOverview } from '../../../flyout_v2/attack/main/components/entities_overview';
import { useAttackDetailsContext } from '../context';

/**
 * Legacy wrapper: reads attack from context and delegates to the prop-driven v2 component.
 */
export const EntitiesOverview: React.FC = memo(() => {
  const { attack } = useAttackDetailsContext();

  if (!attack) {
    return null;
  }

  return <V2EntitiesOverview attack={attack} />;
});

EntitiesOverview.displayName = 'EntitiesOverview';
