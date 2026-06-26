/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import deepEqual from 'fast-deep-equal';
import { LENS_ATTACHMENT_TYPE } from '../../../../common/constants';
import {
  LensAttachmentPayloadSchema,
  type LensAttachmentData,
} from '../../../../common/types/domain_zod/attachment/lens/v2';
import * as i18n from './translations';

import {
  AttachmentActionType,
  defineAttachment,
  type UnifiedValueAttachmentViewProps,
} from '../../../client/attachment_framework/types';
import type { LensProps } from './types';
import { OpenLensButton } from './open_lens_button';
import { LensRenderer } from './lens_renderer';

type LensViewProps = UnifiedValueAttachmentViewProps<LensAttachmentData>;

function getOpenLensButton(savedObjectId: string, props: LensProps) {
  return (
    <OpenLensButton
      savedObjectId={savedObjectId}
      attributes={props.attributes}
      timeRange={props.timeRange}
      metadata={props.metadata}
    />
  );
}

const getVisualizationAttachmentActions = (savedObjectId: string, props: LensProps) => [
  {
    type: AttachmentActionType.CUSTOM as const,
    render: () => getOpenLensButton(savedObjectId, props),
    isPrimary: false,
  },
];

const LensAttachment = React.memo(
  (props: LensViewProps) => {
    // `data.state` is `Record<string, unknown>` in the schema; the concrete
    // shape (`LensProps`) is owned by the lens plugin and asserted here.
    const { attributes, timeRange, metadata } = props.data.state as LensProps;
    return <LensRenderer attributes={attributes} timeRange={timeRange} metadata={metadata} />;
  },
  (prevProps, nextProps) => deepEqual(prevProps.data.state, nextProps.data.state)
);

LensAttachment.displayName = 'LensAttachment';

const LensAttachmentRendererLazyComponent = React.lazy(async () => ({
  default: LensAttachment,
}));

const getVisualizationAttachmentViewObject = ({ savedObjectId, data }: LensViewProps) => {
  const { attributes: lensAttributes, timeRange: lensTimeRange } = data.state as LensProps;

  return {
    event: i18n.ADDED_VISUALIZATION,
    timelineAvatar: 'lensApp',
    getActions: () =>
      getVisualizationAttachmentActions(savedObjectId, {
        attributes: lensAttributes,
        timeRange: lensTimeRange,
      }),
    hideDefaultActions: false,
    children: LensAttachmentRendererLazyComponent,
  };
};

export const getVisualizationAttachmentType = () =>
  defineAttachment({
    id: LENS_ATTACHMENT_TYPE,
    icon: 'document',
    displayName: i18n.VISUALIZATIONS,
    getAttachmentViewObject: getVisualizationAttachmentViewObject,
    getAttachmentRemovalObject: () => ({ event: i18n.REMOVED_VISUALIZATION }),
    schema: LensAttachmentPayloadSchema,
    // `data.state` is the embeddable input bag, produced by the "Add to case"
    // flow and not authorable in YAML, so lens is excluded from workflow steps.
    workflowSchema: false,
  });
