/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import type { ThreatCategory } from '../../../../common/threat_intelligence/hub';
import {
  getThreatCategoryBadgeStyle,
  getThreatCategoryLabel,
} from '../../../../common/threat_intelligence/hub';

const badgeBaseCss = css({
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '9999px',
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
});

const sizeCss = {
  sm: css({
    fontSize: '10px',
    lineHeight: '14px',
    padding: '2px 8px',
  }),
  md: css({
    fontSize: '12px',
    lineHeight: '16px',
    padding: '4px 10px',
  }),
};

export const ThreatCategoryBadge: React.FC<{
  category: ThreatCategory | string;
  size?: 'sm' | 'md';
}> = ({ category, size = 'sm' }) => {
  const { background, color } = getThreatCategoryBadgeStyle(category);
  const label = getThreatCategoryLabel(category);

  return (
    <span
      css={[badgeBaseCss, sizeCss[size], css({ backgroundColor: background, color })]}
      data-test-subj={`threatIntelCategoryBadge-${category}`}
    >
      {label}
    </span>
  );
};
