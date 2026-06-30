/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { InsightsSection as V2InsightsSection } from '../../../flyout_v2/attack/main/components/insights_section';
import { useAttackDetailsContext } from '../context';

/**
 * Renders the Overview tab - InsightsSection content in the Attack Details flyout.
 * Delegates to the v2 prop-driven InsightsSection using the context attack value.
 */
export const InsightsSection = memo(() => {
  const { attack } = useAttackDetailsContext();

  if (!attack) {
    return null;
  }

  return <V2InsightsSection attack={attack} />;
});

InsightsSection.displayName = 'InsightsSection';
