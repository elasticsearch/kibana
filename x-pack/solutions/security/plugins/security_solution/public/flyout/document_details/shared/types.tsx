/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FlyoutPanelProps, PanelPath } from '@kbn/expandable-flyout';
import type {
  DocumentDetailsLeftPanelKey,
  DocumentDetailsRightPanelKey,
} from './constants/panel_keys';

export interface DocumentDetailsProps extends FlyoutPanelProps {
  key: typeof DocumentDetailsLeftPanelKey | typeof DocumentDetailsRightPanelKey;
  path?: PanelPath;
  params?: {
    id: string;
    indexName: string;
    scopeId: string;
    isPreviewMode?: boolean;
    jumpToEntityId?: string;
    jumpToCursor?: string;
    /**
     * Per-source-instance UUID minted at the source's mount time (e.g. in
     * `AlertsTableComponent` or `TimelineDataTableComponent`). When present,
     * `DocumentDetailsContext` exposes it so that `alert_header_title.tsx`
     * can look up the caller's pagination slice and render in-flyout
     * `EuiPagination` chevrons keyed to that source.
     */
    paginationInstanceId?: string;
  };
}
