/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiContextMenuPanelItemDescriptor } from '@elastic/eui';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AlertRowActionMenu, getAlertRowActionGroups } from './alert_row_action_menu';
import { OSQUERY_ACTION_ID } from '../../../osquery/osquery_action_item';
import { ADD_TO_CASE_ACTION_IDS } from '../use_add_to_case_actions';
import { ADD_TO_CHAT_ACTION_ID } from '../../../../../common/constants/action_ids';
import { ALERT_EXCEPTION_ACTION_IDS } from '../use_add_exception_actions';
import { RUN_ALERT_WORKFLOW_ACTION_ID } from '../use_run_alert_workflow_panel';
import { ALERT_TAG_ACTION_ID } from '../../../../../common/components/toolbar/bulk_actions/use_bulk_alert_tags_items';
import { ALERT_ASSIGNEE_ACTION_IDS } from '../../../../../common/components/toolbar/bulk_actions/use_bulk_alert_assignees_items';
import { ALERT_STATUS_ACTION_IDS } from '../../../../../common/components/toolbar/bulk_actions/use_bulk_action_items';

const createItem = (key: string, name: string): EuiContextMenuPanelItemDescriptor => ({
  key,
  name,
  'data-test-subj': key,
});

/** Single item helper for group-visibility assertions. */
const oneItem = (key: string) => [createItem(key, key)];

describe('AlertRowActionMenu', () => {
  it('orders alert action groups consistently', () => {
    render(
      <AlertRowActionMenu
        addToCaseItems={[createItem(ADD_TO_CASE_ACTION_IDS.addToCase, 'Add to case')]}
        addToChatItems={[createItem(ADD_TO_CHAT_ACTION_ID, 'Add to chat')]}
        alertAssigneeItems={[createItem(ALERT_ASSIGNEE_ACTION_IDS.assign, 'Assign alert')]}
        alertTagItems={[createItem(ALERT_TAG_ACTION_ID, 'Apply alert tags')]}
        canCreateEndpointEventFilters={false}
        eventFilterItems={[]}
        exceptionItems={[
          createItem(ALERT_EXCEPTION_ACTION_IDS.addEndpointException, 'Add endpoint exception'),
        ]}
        hasAgent
        isAlert
        osqueryItems={[createItem(OSQUERY_ACTION_ID, 'Run Osquery')]}
        panels={[]}
        runAlertWorkflowItems={[createItem(RUN_ALERT_WORKFLOW_ACTION_ID, 'Run workflow')]}
        runDocumentWorkflowItems={[]}
        statusItems={[createItem(ALERT_STATUS_ACTION_IDS.markAsOpen, 'Mark as open')]}
      />
    );

    expect(screen.getAllByRole('menuitem').map(({ textContent }) => textContent)).toEqual([
      'Mark as open',
      'Assign alert',
      'Add to case',
      'Apply alert tags',
      'Add endpoint exception',
      'Run workflow',
      'Run Osquery',
      'Add to chat',
    ]);
    expect(screen.getAllByTestId('securityActionMenuGroupSeparator')).toHaveLength(4);
  });

  it('decorates action items with icons from ACTION_ICONS_BY_ID', () => {
    render(
      <AlertRowActionMenu
        addToCaseItems={[createItem(ADD_TO_CASE_ACTION_IDS.addToCase, 'Add to case')]}
        addToChatItems={[]}
        alertAssigneeItems={[createItem(ALERT_ASSIGNEE_ACTION_IDS.assign, 'Assign alert')]}
        alertTagItems={[createItem(ALERT_TAG_ACTION_ID, 'Apply alert tags')]}
        canCreateEndpointEventFilters={false}
        eventFilterItems={[]}
        exceptionItems={[]}
        hasAgent
        isAlert
        osqueryItems={[createItem(OSQUERY_ACTION_ID, 'Run Osquery')]}
        panels={[]}
        runAlertWorkflowItems={[createItem(RUN_ALERT_WORKFLOW_ACTION_ID, 'Run workflow')]}
        runDocumentWorkflowItems={[]}
        statusItems={[]}
      />
    );

    expect(
      screen
        .getByTestId(ADD_TO_CASE_ACTION_IDS.addToCase)
        .querySelector('[data-euiicon-type="briefcase"]')
    ).toBeInTheDocument();
    expect(
      screen
        .getByTestId(ALERT_ASSIGNEE_ACTION_IDS.assign)
        .querySelector('[data-euiicon-type="users"]')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(ALERT_TAG_ACTION_ID).querySelector('[data-euiicon-type="tag"]')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(OSQUERY_ACTION_ID).querySelector('[data-euiicon-type="commandLine"]')
    ).toBeInTheDocument();
    expect(
      screen
        .getByTestId(RUN_ALERT_WORKFLOW_ACTION_ID)
        .querySelector('[data-euiicon-type="workflow"]')
    ).toBeInTheDocument();
  });
});

describe('getAlertRowActionGroups', () => {
  const emptyProps = {
    addToCaseItems: [],
    addToChatItems: [],
    alertAssigneeItems: [],
    alertTagItems: [],
    canCreateEndpointEventFilters: false,
    eventFilterItems: [],
    exceptionItems: [],
    hasAgent: false,
    isAlert: true,
    osqueryItems: [],
    runAlertWorkflowItems: [],
    runDocumentWorkflowItems: [],
    statusItems: [],
  };

  it('returns empty groups when no items are present (alert mode)', () => {
    const groups = getAlertRowActionGroups({ ...emptyProps, isAlert: true });
    expect(groups.every((g) => g.length === 0)).toBe(true);
  });

  it('returns empty groups when no items are present (document mode)', () => {
    const groups = getAlertRowActionGroups({ ...emptyProps, isAlert: false });
    expect(groups.every((g) => g.length === 0)).toBe(true);
  });

  it('alert mode: includes status, management, exceptions, response, chat groups', () => {
    const groups = getAlertRowActionGroups({
      ...emptyProps,
      isAlert: true,
      statusItems: oneItem('open'),
      alertAssigneeItems: oneItem('assign'),
      exceptionItems: oneItem('exception'),
      runAlertWorkflowItems: oneItem('workflow'),
      addToChatItems: oneItem('chat'),
    });
    // groups: [status, management, exceptions, response, chat]
    expect(groups[0]).toHaveLength(1); // status
    expect(groups[1]).toHaveLength(1); // management (assignee)
    expect(groups[2]).toHaveLength(1); // exceptions
    expect(groups[3]).toHaveLength(1); // response (workflow)
    expect(groups[4]).toHaveLength(1); // chat
  });

  it('document mode: returns a 5-tuple with empty status group at index 0', () => {
    const groups = getAlertRowActionGroups({
      ...emptyProps,
      isAlert: false,
      addToCaseItems: oneItem('case'),
      canCreateEndpointEventFilters: true,
      eventFilterItems: oneItem('filter'),
      runDocumentWorkflowItems: oneItem('doc-workflow'),
    });
    // groups: [statusItems(empty), addToCase, eventFilter, response, chat(empty)]
    expect(groups).toHaveLength(5);
    expect(groups[0]).toHaveLength(0); // status — always empty for events
    expect(groups[1]).toHaveLength(1); // addToCase
    expect(groups[2]).toHaveLength(1); // eventFilter (canCreateEndpointEventFilters=true)
    expect(groups[3]).toHaveLength(1); // response (docWorkflow)
    expect(groups[4]).toHaveLength(0); // chat — always empty for events
  });

  it('hasItems agrees with the menu rendering across gate permutations', () => {
    // All-empty → no items
    expect(getAlertRowActionGroups(emptyProps).some((g) => g.length > 0)).toBe(false);

    // Any single item → hasItems
    expect(
      getAlertRowActionGroups({ ...emptyProps, statusItems: oneItem('open') }).some(
        (g) => g.length > 0
      )
    ).toBe(true);

    expect(
      getAlertRowActionGroups({ ...emptyProps, addToCaseItems: oneItem('case') }).some(
        (g) => g.length > 0
      )
    ).toBe(true);
  });
});
