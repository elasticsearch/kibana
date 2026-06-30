/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';

export const SubFeatureCardFlexItem = () =>
  css({
    minInlineSize: 'min(20rem, 50%)',
  });

export const MinWidthZeroContainer = () =>
  css({
    minWidth: 0,
  });

export const EndpointIdTextLabel = () =>
  css({
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });
