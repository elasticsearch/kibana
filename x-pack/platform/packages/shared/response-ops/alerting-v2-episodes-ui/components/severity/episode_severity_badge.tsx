/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiBadgeProps } from '@elastic/eui';
import { EuiBadge } from '@elastic/eui';
import { EPISODE_SEVERITY_BADGE_COLORS } from './severity_utils';
import {
  getEpisodeSeverityLabel,
  isSupportedEpisodeSeverity,
  normalizeEpisodeSeverity,
} from './severity_utils';

const SEVERITY_COLORS: Record<string, EuiBadgeProps['color']> = EPISODE_SEVERITY_BADGE_COLORS;

export interface AlertEpisodeSeverityBadgeProps {
  severity: string | undefined | null;
}

export const AlertEpisodeSeverityBadge = ({ severity }: AlertEpisodeSeverityBadgeProps) => {
  if (!isSupportedEpisodeSeverity(severity)) {
    return null;
  }

  const normalized = normalizeEpisodeSeverity(severity);

  return (
    <EuiBadge
      color={SEVERITY_COLORS[normalized]}
      fill
      data-test-subj={`alertingV2EpisodeSeverityBadge-${normalized}`}
    >
      {getEpisodeSeverityLabel(normalized)}
    </EuiBadge>
  );
};
