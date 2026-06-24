/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { lazy, Suspense } from 'react';
import { EuiAvatar } from '@elastic/eui';
import type {
  UnifiedReferenceAttachmentType,
  UnifiedReferenceAttachmentViewProps,
} from '@kbn/cases-plugin/public/client/attachment_framework/types';
import { SECURITY_ENDPOINT_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import type { EndpointMetadata } from './types';
import { ENDPOINT_DISPLAY_NAME } from './translations';

const LazyEvent = lazy(() => import('./endpoint_event'));
const LazyChildren = lazy(() => import('./endpoint_children'));

const getEventContent = (props: UnifiedReferenceAttachmentViewProps) => (
  <Suspense fallback={null}>
    <LazyEvent {...props} />
  </Suspense>
);

export const getEndpointUnifiedAttachment = (): UnifiedReferenceAttachmentType => ({
  id: SECURITY_ENDPOINT_ATTACHMENT_TYPE,
  icon: 'lockOpen',
  displayName: ENDPOINT_DISPLAY_NAME,
  getAttachmentViewObject: (props) => {
    const metadata = props.metadata as EndpointMetadata | undefined;
    const iconType = metadata?.command === 'isolate' ? 'lock' : 'lockOpen';

    return {
      event: getEventContent(props),
      timelineAvatar: (
        <EuiAvatar name="endpoint" color="subdued" iconType={iconType} aria-label={iconType} />
      ),
      children: LazyChildren,
    };
  },
});
