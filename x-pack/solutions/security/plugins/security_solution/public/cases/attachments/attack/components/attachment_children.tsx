/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { UnifiedReferenceAttachmentViewProps } from '@kbn/cases-plugin/public';
import type { AttackAttachmentPayload } from '../../../../../common/cases/attachments/attack';
import { AttackChildren } from './attack_children';

type Props = UnifiedReferenceAttachmentViewProps<
  AttackAttachmentPayload['metadata'],
  AttackAttachmentPayload['attachmentId']
>;

/**
 * Component lazy loaded when rendering a unified `security.attack` attachment.
 * Renders the attack preview card in the case activity log.
 */
const AttachmentChildren = ({ attachmentId, metadata }: Props) => {
  if (!metadata) {
    return null;
  }

  return <AttackChildren id={attachmentId} metadata={metadata} />;
};

// eslint-disable-next-line import/no-default-export
export default AttachmentChildren;
