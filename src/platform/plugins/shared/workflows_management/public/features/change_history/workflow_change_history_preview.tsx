/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiCodeBlock } from '@elastic/eui';
import { css } from '@emotion/react';
import React from 'react';
import type { ChangeHistoryPreviewRenderFn } from '@kbn/change-history-ui';

import { getWorkflowYamlFromSnapshot } from './map_workflow_history_item';

export const renderWorkflowChangeHistoryPreview: ChangeHistoryPreviewRenderFn = ({ change }) => {
  const selectedYaml = getWorkflowYamlFromSnapshot(change.snapshot);

  return (
    <EuiCodeBlock
      language="yaml"
      isCopyable
      paddingSize="none"
      css={css`
        height: 100%;
      `}
      data-test-subj="workflowChangeHistoryYamlPreview"
    >
      {selectedYaml}
    </EuiCodeBlock>
  );
};
