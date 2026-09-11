/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  BULK_ADD_TO_CASE_ACTION_ID,
  BULK_INVESTIGATE_IN_TIMELINE_ACTION_ID,
  RUN_DOCUMENT_WORKFLOW_ACTION_ID,
} from '../../../constants/action_ids';
import { ACTION_MENU_GROUP_SEPARATOR_TEST_ID } from '../../../utils/action_menu_items';
import { EventsTableBulkActionMenu } from './events_table_bulk_action_menu';
import { ALERT_STATUS_ACTION_IDS, type BulkActionGroups } from './use_bulk_action_items';

const groups: BulkActionGroups = {
  statusItems: [
    {
      key: ALERT_STATUS_ACTION_IDS.markAsOpen,
      name: 'Mark as open',
      'data-test-subj': 'mark-as-open',
    },
  ],
  casesItems: [
    {
      key: BULK_ADD_TO_CASE_ACTION_ID,
      name: 'Add to case',
      'data-test-subj': 'add-to-case',
    },
  ],
  timelineItems: [
    {
      key: BULK_INVESTIGATE_IN_TIMELINE_ACTION_ID,
      name: 'Investigate in timeline',
      'data-test-subj': 'investigate-in-timeline',
    },
  ],
  customItems: [],
  workflowItems: [
    {
      key: RUN_DOCUMENT_WORKFLOW_ACTION_ID,
      name: 'Run workflow',
      'data-test-subj': 'run-workflow',
    },
  ],
};

describe('EventsTableBulkActionMenu', () => {
  it('renders decorated action groups in order with separators', () => {
    render(<EventsTableBulkActionMenu panels={[]} groups={groups} />);

    expect(screen.getAllByRole('menuitem').map(({ textContent }) => textContent)).toEqual([
      'Mark as open',
      'Add to case',
      'Investigate in timeline',
      'Run workflow',
    ]);
    expect(screen.getAllByTestId(ACTION_MENU_GROUP_SEPARATOR_TEST_ID)).toHaveLength(3);
    expect(
      screen.getByTestId('mark-as-open').querySelector('[data-euiicon-type="dot"]')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('add-to-case').querySelector('[data-euiicon-type="briefcase"]')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('investigate-in-timeline').querySelector('[data-euiicon-type="timeline"]')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('run-workflow').querySelector('[data-euiicon-type="workflow"]')
    ).toBeInTheDocument();
  });

  it('does not render separators around empty groups', () => {
    render(
      <EventsTableBulkActionMenu
        panels={[]}
        groups={{
          ...groups,
          statusItems: [],
          timelineItems: [],
          workflowItems: [],
        }}
      />
    );

    expect(screen.queryByTestId(ACTION_MENU_GROUP_SEPARATOR_TEST_ID)).not.toBeInTheDocument();
  });
});
