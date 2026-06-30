/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { renderWorkflowChangeHistoryPreview } from './workflow_change_history_preview';

const makeDetail = (yaml: string) => ({
  id: 'evt-3',
  timestamp: '2026-06-16T12:00:00.000Z',
  actor: { name: 'Alice' },
  action: 'Updated',
  snapshot: { workflow: { yaml } },
});

describe('workflow change history preview', () => {
  it('renders the selected version yaml in a code block', () => {
    render(
      <div data-test-subj="previewHost">
        {renderWorkflowChangeHistoryPreview({
          objectId: 'workflow-1',
          change: makeDetail('name: historical\n'),
        })}
      </div>
    );

    expect(screen.getByTestId('workflowChangeHistoryYamlPreview')).toHaveTextContent(
      'name: historical'
    );
    expect(screen.queryByTestId('workflowChangeHistoryYamlDiff')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workflowChangeHistoryCompareSettings')).not.toBeInTheDocument();
  });

  it('renders an empty code block when the snapshot has no yaml', () => {
    render(
      renderWorkflowChangeHistoryPreview({
        objectId: 'workflow-1',
        change: {
          ...makeDetail(''),
          snapshot: {},
        },
      })
    );

    expect(screen.getByTestId('workflowChangeHistoryYamlPreview')).toBeInTheDocument();
  });
});
