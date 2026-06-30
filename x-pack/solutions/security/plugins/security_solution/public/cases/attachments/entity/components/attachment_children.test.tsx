/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import type { UnifiedReferenceAttachmentViewProps } from '@kbn/cases-plugin/public/client/attachment_framework/types';
import type { EntityAttachmentPayload } from '../../../../../common/cases/attachments/entity';
import AttachmentChildren from './attachment_children';
import {
  ENTITY_NAME_TEST_ID,
  ENTITY_TYPE_TEST_ID,
} from '../../../../../common/cases/attachments/entity/test_ids';
import { TestProvidersComponent } from '../../../../threat_intelligence/mocks/test_providers';

type Props = UnifiedReferenceAttachmentViewProps<
  EntityAttachmentPayload['metadata'],
  EntityAttachmentPayload['attachmentId']
>;

const baseProps: Props = {
  attachmentId: 'entity-id-1',
  metadata: {
    entityName: 'alice',
    entityType: 'user',
  },
  caseData: { id: 'case-1', title: 'Case 1' },
  savedObjectId: 'saved-object-id-1',
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
    const { queryByTestId } = render(
      <TestProvidersComponent>
        <AttachmentChildren {...baseProps} metadata={undefined} />
      </TestProvidersComponent>
    );

    expect(queryByTestId(ENTITY_NAME_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders EntityChildren when metadata and string attachmentId are valid', () => {
    const { getByTestId } = render(
      <TestProvidersComponent>
        <AttachmentChildren {...baseProps} />
      </TestProvidersComponent>
    );

    expect(getByTestId(ENTITY_NAME_TEST_ID)).toHaveTextContent('alice');
    expect(getByTestId(ENTITY_TYPE_TEST_ID)).toHaveTextContent('user');
  });
});
