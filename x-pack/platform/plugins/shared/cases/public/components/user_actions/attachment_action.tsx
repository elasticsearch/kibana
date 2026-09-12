/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButtonIcon, EuiFlexItem, EuiToolTip } from '@elastic/eui';

import type { AttachmentAction } from '../../client/attachment_framework/types';
import { AttachmentActionType } from '../../client/attachment_framework/types';

/**
 * Renders a single `AttachmentAction` inline in an activity-row toolbar. Shared by the
 * attachment row (`comment/registered_attachments.tsx`) and the workflow activity row
 * (`workflow.tsx`) so a solution-provided control looks identical in both places.
 *
 * `testSubj` scopes the markup: BUTTON actions get `${testSubj}` on the flex item and
 * `${testSubj}-${iconType}` on the button. CUSTOM actions own their own test subjects.
 */
export const renderAttachmentAction = (
  action: AttachmentAction,
  testSubj: string
): JSX.Element | null => {
  if (action.type === AttachmentActionType.BUTTON) {
    return (
      <EuiFlexItem grow={false} data-test-subj={testSubj} key={testSubj}>
        <EuiToolTip content={action.label} disableScreenReaderOutput>
          <EuiButtonIcon
            aria-label={action.label}
            iconType={action.iconType}
            color={action.color ?? 'text'}
            onClick={action.onClick}
            data-test-subj={`${testSubj}-${action.iconType}`}
            key={`${testSubj}-${action.iconType}`}
          />
        </EuiToolTip>
      </EuiFlexItem>
    );
  }
  return action.render();
};
