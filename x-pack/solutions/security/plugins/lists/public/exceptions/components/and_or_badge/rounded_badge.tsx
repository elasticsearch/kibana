/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiBadge } from '@elastic/eui';
import React from 'react';
import styled from '@emotion/styled';

import * as i18n from './translations';

import type { AndOr } from '.';

const RoundBadge = styled(EuiBadge)`
  align-items: center;
  border-radius: 100%;
  display: inline-flex;
  font-size: 9px;
  justify-content: center;
  margin: 0 5px 0 5px;
  padding: 7px 6px 4px 6px;
  user-select: none;
  width: 40px;
  height: 40px;
  .euiBadge__content {
    position: relative;
    top: -1px;
  }
  .euiBadge__text {
    text-overflow: clip;
  }
` as unknown as typeof EuiBadge;

RoundBadge.displayName = 'RoundBadge';

export const RoundedBadge: React.FC<{ type: AndOr }> = ({ type }) => (
  <RoundBadge data-test-subj="and-or-badge" color="hollow">
    {type === 'and' ? i18n.AND : i18n.OR}
  </RoundBadge>
);

RoundedBadge.displayName = 'RoundedBadge';
