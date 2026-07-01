/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
import { useEuiTheme } from '@elastic/eui';
import type { KbnCalloutColor } from './base_callout';

type EuiColors = UseEuiTheme['euiTheme']['colors'];
type StringColorToken = {
  [K in keyof EuiColors]: EuiColors[K] extends string ? K : never;
}[keyof EuiColors];

const STRIPE_COLOR_TOKEN: Record<KbnCalloutColor, StringColorToken> = {
  primary: 'borderStrongPrimary',
  success: 'borderStrongSuccess',
  warning: 'borderStrongWarning',
  danger: 'borderStrongDanger',
};

const BORDER_COLOR_TOKEN: Record<KbnCalloutColor, StringColorToken> = {
  primary: 'borderBasePrimary',
  success: 'borderBaseSuccess',
  warning: 'borderBaseWarning',
  danger: 'borderBaseDanger',
};

/** Resolves a variant's stripe (`--kbnCalloutTypeColor`) and border colors from the theme. */
export const useCalloutColors = (color: KbnCalloutColor) => {
  const { euiTheme } = useEuiTheme();
  return {
    stripeColor: euiTheme.colors[STRIPE_COLOR_TOKEN[color]],
    borderColor: euiTheme.colors[BORDER_COLOR_TOKEN[color]],
  };
};
