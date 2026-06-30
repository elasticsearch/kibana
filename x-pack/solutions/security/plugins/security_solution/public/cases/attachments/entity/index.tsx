/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CaseAttachmentsWithoutOwner,
  CommonAttachmentTabViewProps,
} from '@kbn/cases-plugin/public';
import { defineAttachment } from '@kbn/cases-plugin/public';
import { SECURITY_ENTITY_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import React, { Suspense, type ComponentType } from 'react';
import { EuiAvatar } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import type { EntityType } from '../../../../common/entity_analytics/types';
import { EntityIconByType } from '../../../entity_analytics/components/entity_store/entity_icon_by_type';
import type { EntityAttachmentMetadata } from '../../../../common/cases/attachments/entity';
import { EntityAttachmentPayloadSchema } from '../../../../common/cases/attachments/entity';

export type { EntityAttachmentMetadata };
export interface EntityToAttach {
  id: string;
  name: string;
  type: EntityAttachmentMetadata['entityType'];
  riskScore?: number;
  riskLevel?: string;
}

const EntityAttachmentChildrenLazy = React.lazy(() => import('./components/attachment_children'));
const EntityTabContentLazy = React.lazy(() => import('./components/entity_tab_content'));

const EntityTabContentWrapper: ComponentType<CommonAttachmentTabViewProps> = (props) => (
  <Suspense fallback={null}>
    <EntityTabContentLazy {...props} />
  </Suspense>
);

const DISPLAY_NAME = i18n.translate('xpack.securitySolution.entityAnalytics.cases.displayName', {
  defaultMessage: 'Entities',
});

export const getEntityAttachment = () =>
  defineAttachment({
    id: SECURITY_ENTITY_ATTACHMENT_TYPE,
    icon: 'globe',
    displayName: DISPLAY_NAME,
    schema: EntityAttachmentPayloadSchema,
    getAttachmentViewObject: (props) => {
      const entityType = props.metadata?.entityType;
      const iconType = entityType ? EntityIconByType[entityType as EntityType] ?? 'globe' : 'globe';
      return {
        eventColor: 'subdued' as const,
        event: (
          <FormattedMessage
            id="xpack.securitySolution.entityAnalytics.cases.eventDescription"
            defaultMessage="added an entity"
          />
        ),
        timelineAvatar: <EuiAvatar name="entity" color="subdued" iconType={iconType} />,
        children: EntityAttachmentChildrenLazy,
      };
    },
    getAttachmentTabViewObject: () => ({
      children: EntityTabContentWrapper,
    }),
  });

/**
 * Builds the unified `security.entity` attachment payload posted to a case, including the
 * metadata persisted alongside it so the attachment view can render without re-fetching the
 * entity.
 *
 * Returns the cases-framework "without owner" payload — the cases UI injects the `owner` at
 * creation time, so callers hand the attachment over without it. Returns an empty array when
 * the entity has no id.
 *
 * @param entity the entity we're attaching to a case
 */
export const generateEntityAttachmentsWithoutOwner = (
  entity: EntityToAttach
): CaseAttachmentsWithoutOwner => {
  if (!entity.id) {
    return [];
  }

  return [
    {
      type: SECURITY_ENTITY_ATTACHMENT_TYPE,
      attachmentId: entity.id,
      metadata: {
        entityName: entity.name,
        entityType: entity.type,
        ...(entity.riskScore != null ? { riskScore: entity.riskScore } : {}),
        ...(entity.riskLevel != null ? { riskLevel: entity.riskLevel } : {}),
      } satisfies EntityAttachmentMetadata,
    },
  ];
};
