/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { UnifiedReferenceAttachmentViewProps } from '@kbn/cases-plugin/public/client/attachment_framework/types';
import type { AttackAttachmentPayload } from '../../../../../common/cases/attachments/attack';
import AttachmentChildren from './attachment_children';
import {
  ATTACK_ALERT_COUNT_TEST_ID,
  ATTACK_TITLE_TEST_ID,
} from '../../../../../common/cases/attachments/attack/test_ids';
import { TestProviders } from '../../../../common/mock/test_providers';
import { allCasesPermissions } from '../../../../cases_test_utils';

type Props = UnifiedReferenceAttachmentViewProps<
  AttackAttachmentPayload['metadata'],
  AttackAttachmentPayload['attachmentId']
>;

const baseProps: Props = {
  attachmentId: 'attack-id-1',
  metadata: {
    title: 'Credential harvesting on host-1',
    alertCount: 4,
    index: '.alerts-security.attack.discovery.alerts-default',
  },
  caseData: { id: 'case-1', title: 'Case 1' },
  savedObjectId: 'saved-object-id-1',
  permissions: allCasesPermissions(),
  createdBy: { username: 'elastic', fullName: null, email: null, profileUid: undefined },
  version: '1',
  rowContext: {
    appId: 'cases',
    manageMarkdownEditIds: [],
    selectedOutlineCommentId: '',
    loadingCommentIds: [],
    euiTheme: {} as never,
  },
};

describe('AttachmentChildren', () => {
  it('renders null when metadata is missing', () => {
    render(
      <TestProviders>
        <AttachmentChildren {...baseProps} metadata={undefined} />
      </TestProviders>
    );

    expect(screen.queryByTestId(ATTACK_TITLE_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders AttackChildren when metadata is present', () => {
    render(
      <TestProviders>
        <AttachmentChildren {...baseProps} />
      </TestProviders>
    );

    expect(screen.getByTestId(ATTACK_TITLE_TEST_ID)).toHaveTextContent(
      'Credential harvesting on host-1'
    );
    expect(screen.getByTestId(ATTACK_ALERT_COUNT_TEST_ID)).toHaveTextContent('4');
  });
});
