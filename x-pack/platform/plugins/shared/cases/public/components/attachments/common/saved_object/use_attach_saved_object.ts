/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useState } from 'react';
import {
  dashboardStateToAttachmentData,
  type DashboardAttachmentData as DashboardAttachmentApiData,
} from '@kbn/agent-builder-dashboards-common';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  DASHBOARD_SO_TYPE,
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  DISCOVER_SESSION_SO_TYPE,
  MAP_ATTACHMENT_TYPE,
  MAP_SO_TYPE,
} from '../../../../../common/constants/attachments';
import type {
  MapAttributesSnapshot,
  MapAttachmentPayload,
} from '../../../../../common/types/domain_zod/attachment/map/v2';
import type { DashboardAttachmentPayload } from '../../../../../common/types/domain_zod/attachment/dashboard/v2';
import type { DiscoverSessionAttachmentPayload } from '../../../../../common/types/domain_zod/attachment/saved_object/v2';
import { useKibana, useToasts } from '../../../../common/lib/kibana';
import { useCreateAttachments } from '../../../../containers/use_create_attachments';
import { useRefreshCaseViewPage } from '../../../case_view/use_on_refresh_case_view_page';
import { SO_TYPE_TO_ATTACHMENT_TYPE, type SupportedSavedObjectType } from './helpers';
import type { FoundSavedObject } from './types';
import * as i18n from './translations';

// Each payload below describes what `useCreateAttachments` accepts (owner is
// stamped on by the container). The union is narrower than
// `CaseAttachmentWithoutOwner` and lets the SO attach hook build payloads
// without any casts.
type DashboardAttachmentRequest = Omit<DashboardAttachmentPayload, 'owner'>;
type MapAttachmentRequest = Omit<MapAttachmentPayload, 'owner'>;
type DiscoverSessionAttachmentRequest = Omit<DiscoverSessionAttachmentPayload, 'owner'>;

/**
 * Hard ceiling on the serialized size (bytes) of a dashboard/map snapshot we
 * embed in the cases-attachment SO. Beyond this we drop the snapshot and
 * degrade to a title-only attachment — the SO is still attached, just without
 * the inline embed. Lifted high enough to accommodate typical dashboards
 * (dozens of panels) but well below ES per-document limits.
 */
const MAX_SNAPSHOT_BYTES = 200_000;

const fitsSnapshotBudget = (snapshot: unknown): boolean => {
  try {
    return JSON.stringify(snapshot).length <= MAX_SNAPSHOT_BYTES;
  } catch {
    return false;
  }
};

export interface UseAttachSavedObjectArgs {
  caseId: string;
  caseOwner: string;
  onAttached: () => void;
}

export interface UseAttachSavedObjectResult {
  attach: (object: FoundSavedObject) => Promise<void>;
  attachmentId: string | null;
  /** True while any attach request from this hook (or its dependencies) is in flight. */
  isAttaching: boolean;
}

/**
 * Builds the right attachment payload for the SO type (dashboard/map snapshot
 * the SO content at attach time; reference-typed search just stores the id),
 * creates the attachment, and refreshes the case view.
 */
export const useAttachSavedObject = ({
  caseId,
  caseOwner,
  onAttached,
}: UseAttachSavedObjectArgs): UseAttachSavedObjectResult => {
  const {
    services: { contentManagement, dashboard },
  } = useKibana();
  const toasts = useToasts();
  const refreshCaseViewPage = useRefreshCaseViewPage();
  const { mutateAsync: createAttachments, isLoading: isAttaching } = useCreateAttachments();
  const [attachmentId, setAttachmentId] = useState<string | null>(null);

  /**
   * Fetch a Dashboard SO and convert its `DashboardState` to the
   * `DashboardAttachmentData` API shape (panels, sections, controls, …) so the
   * renderer can embed the dashboard inline. Returns `undefined` on failure or
   * when the dashboard plugin isn't installed.
   */
  const fetchDashboardConfig = useCallback(
    async (id: string): Promise<DashboardAttachmentApiData | undefined> => {
      if (!dashboard) {
        return undefined;
      }
      try {
        const findService = await dashboard.findDashboardsService();
        const result = await findService.findById(id);
        if (result.status !== 'success') {
          return undefined;
        }
        const config = dashboardStateToAttachmentData(result.attributes);
        // Drop oversize snapshots; the attachment still gets created (title-only).
        return fitsSnapshotBudget(config) ? config : undefined;
      } catch {
        return undefined;
      }
    },
    [dashboard]
  );

  /**
   * Fetch a Map SO and snapshot its `attributes` verbatim. The CM client
   * returns the parsed REST shape (`layers`, `center`, `settings`, …), which
   * the renderer forwards to `services.maps.Map`. Returns `undefined` on any
   * failure; the attachment then degrades to a title-only event.
   */
  const fetchMapAttributes = useCallback(
    async (id: string): Promise<MapAttributesSnapshot | undefined> => {
      try {
        const result = (await contentManagement.client.get({
          contentTypeId: MAP_SO_TYPE,
          id,
        })) as { item?: { attributes?: MapAttributesSnapshot } } | undefined;
        const attributes = result?.item?.attributes ?? undefined;
        // Drop oversize snapshots; the attachment still gets created (title-only).
        return attributes && fitsSnapshotBudget(attributes) ? attributes : undefined;
      } catch {
        return undefined;
      }
    },
    [contentManagement]
  );

  const attach = useCallback(
    async (object: FoundSavedObject) => {
      const supportedType = object.type as SupportedSavedObjectType;
      const attachmentType = SO_TYPE_TO_ATTACHMENT_TYPE[supportedType];
      if (!attachmentType) {
        return;
      }

      const title = object.meta.title ?? object.id;
      setAttachmentId(object.id);
      try {
        let attachment:
          | DashboardAttachmentRequest
          | MapAttachmentRequest
          | DiscoverSessionAttachmentRequest;
        if (supportedType === MAP_SO_TYPE) {
          const attributes = await fetchMapAttributes(object.id);
          attachment = {
            type: MAP_ATTACHMENT_TYPE,
            attachmentId: object.id,
            metadata: { title, soType: MAP_SO_TYPE },
            ...(attributes ? { data: { attributes } } : {}),
          };
        } else if (supportedType === DASHBOARD_SO_TYPE) {
          const config = await fetchDashboardConfig(object.id);
          attachment = {
            type: DASHBOARD_ATTACHMENT_TYPE,
            attachmentId: object.id,
            metadata: { title, soType: DASHBOARD_SO_TYPE },
            ...(config ? { data: { config } } : {}),
          };
        } else {
          attachment = {
            type: DISCOVER_SESSION_ATTACHMENT_TYPE,
            attachmentId: object.id,
            metadata: { title, soType: DISCOVER_SESSION_SO_TYPE },
          };
        }

        await createAttachments({
          caseId,
          caseOwner,
          attachments: [attachment],
        });
        toasts.addSuccess({
          title: i18n.ATTACH_SUCCESS_TITLE,
          text: title,
        });
        refreshCaseViewPage();
        onAttached();
      } finally {
        setAttachmentId(null);
      }
    },
    [
      caseId,
      caseOwner,
      createAttachments,
      fetchDashboardConfig,
      fetchMapAttributes,
      onAttached,
      refreshCaseViewPage,
      toasts,
    ]
  );

  return { attach, attachmentId, isAttaching };
};
