/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import deepEqual from 'fast-deep-equal';
import {
  attachmentDataToDashboardState,
  type DashboardAttachmentData as DashboardAttachmentApiData,
} from '@kbn/agent-builder-dashboards-common';
import { DashboardRenderer } from '@kbn/dashboard-plugin/public';
import type {
  DashboardAttachmentData,
  DashboardAttachmentMetadata,
  DashboardConfig,
} from '../../../../common/types/domain_zod/attachment/dashboard/v2';
import type { UnifiedReferenceAttachmentViewProps } from '../../../client/attachment_framework/types';

type DashboardViewProps = UnifiedReferenceAttachmentViewProps<
  DashboardAttachmentMetadata,
  string,
  DashboardAttachmentData
>;

/**
 * Compile-time tripwire: if the upstream `DashboardAttachmentApiData` shape
 * drops or renames any of the fields our local `DashboardConfigSchema`
 * declares, this `Pick` assignment fails typecheck and forces us to sync the
 * inline schema in `common/types/domain_zod/attachment/dashboard/v2.ts`. The
 * local schema is intentionally loose (most fields typed as `unknown`) so
 * shape evolution within an existing field is allowed; only field
 * presence/renames trigger the tripwire.
 */
type DashboardConfigKey =
  | 'title'
  | 'description'
  | 'panels'
  | 'query'
  | 'time_range'
  | 'refresh_interval'
  | 'filters'
  | 'options'
  | 'tags'
  | 'pinned_panels'
  | 'access_control'
  | 'project_routing';

export type DashboardConfigMatchesAttachmentData = (
  config: Pick<DashboardAttachmentApiData, DashboardConfigKey>
) => Pick<DashboardConfig, DashboardConfigKey>;

/**
 * Inline dashboard embed. Module-level `import`s pull in `@kbn/dashboard-plugin`
 * + `@kbn/agent-builder-dashboards-common`; this module is loaded behind a
 * `React.lazy` boundary so the cost is deferred until a dashboard attachment
 * is actually rendered.
 *
 * Caller (`getDashboardAttachmentViewObject`) only mounts this when `data` is
 * present; with the schema-level requirement `data.config` is then guaranteed,
 * so we destructure directly without a narrowing helper.
 */
const DashboardEmbedAttachmentImpl: React.FC<DashboardViewProps> = ({ attachmentId, data }) => {
  const id = attachmentId as string;
  const initialInput = useMemo(
    () =>
      data
        ? {
            // Local `DashboardConfig` is a permissive structural subset of the
            // upstream API type; the tripwire above guarantees field parity.
            ...attachmentDataToDashboardState(data.config as DashboardAttachmentApiData),
            ...(data.timeRange ? { timeRange: data.timeRange } : {}),
            viewMode: 'view' as const,
          }
        : { viewMode: 'view' as const },
    [data]
  );
  const getCreationOptions = useCallback(
    async () => ({ getInitialInput: () => initialInput }),
    [initialInput]
  );

  if (!data) {
    return null;
  }
  return (
    <DashboardRenderer
      getCreationOptions={getCreationOptions}
      showPlainSpinner
      savedObjectId={id}
    />
  );
};

DashboardEmbedAttachmentImpl.displayName = 'DashboardEmbedAttachment';

export const DashboardEmbedAttachment = React.memo(DashboardEmbedAttachmentImpl, (prev, next) =>
  deepEqual(prev.data, next.data)
);
