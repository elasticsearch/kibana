/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';

/** Renders the footer chrome below the preview panel (validation, diff nav, etc.). */
export type ChangeHistoryPreviewFooterRenderFn = (props: {
  objectId: string;
  selectedChangeId?: string;
}) => ReactNode;
