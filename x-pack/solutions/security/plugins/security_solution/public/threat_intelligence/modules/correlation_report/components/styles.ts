/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';

export const dotBaseCss = css({
  display: 'inline-block',
  borderRadius: '50%',
  flexShrink: 0,
});

export const dotPairCss = css({
  display: 'inline-flex',
  gap: 3,
  alignItems: 'center',
});

export const evidenceItemRowCss = css({
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
});

export const evidenceGutterCss = css({
  flexShrink: 0,
  paddingTop: 2,
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  minWidth: 24,
});

export const evidenceColumnCss = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
});

export const diamondCenterCss = css({
  display: 'flex',
  justifyContent: 'center',
});

export const blufDotWrapperCss = css({
  display: 'flex',
  paddingTop: 3,
});

export const leadListCss = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const noMatchListCss = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const nextStepsListCss = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const accordionButtonCss = css({
  padding: '12px 16px',
});

export const leadButtonContentCss = css({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  minWidth: 0,
});

export const consolidatedListCss = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const leadHeaderCss = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const leadHeaderDotAlignCss = css({
  paddingTop: 2,
});

export const evidenceVertexBodyCss = css({
  paddingLeft: 12,
});

export const counterSubBlockCss = css({
  paddingLeft: 12,
});

export const sourceListCss = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const sourceChipListCss = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
});

export const markdownInlineCss = css({
  '& p': { margin: 0 },
});

export const markdownBodyCss = css({
  '& > p:first-child': { marginTop: 0 },
  '& > p:last-child': { marginBottom: 0 },
});

export const statRowCss = css({
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  flexWrap: 'wrap',
});

export const sourceItemCss = css({
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
});
