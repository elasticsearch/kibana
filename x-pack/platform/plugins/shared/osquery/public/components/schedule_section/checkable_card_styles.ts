/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';

/**
 * Stretches an `EuiCheckableCard` to fill its flex item so two cards placed
 * side-by-side in an `EuiFlexGroup` read as one matched, equal-height pair.
 * `EuiCheckableCard` exposes no `fullHeight` prop and its height is
 * content-driven, so this `css` override is the supported way to do it.
 */
export const FULL_HEIGHT_CSS = css({ height: '100%' });
