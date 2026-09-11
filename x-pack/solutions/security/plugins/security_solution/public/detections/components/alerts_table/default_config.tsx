/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_BUILDING_BLOCK_TYPE,
  ALERT_WORKFLOW_STATUS,
  ALERT_RULE_RULE_ID,
  ALERT_WORKFLOW_ASSIGNEE_IDS,
} from '@kbn/rule-data-utils';

import type { Filter } from '@kbn/es-query';
import { tableDefaults } from '@kbn/securitysolution-data-table';
import type { SubsetDataTableModel } from '@kbn/securitysolution-data-table';
import type { AssigneesIdsSelection } from '../../../common/components/assignees/types';
import type { Status } from '../../../../common/api/detection_engine';
import {
  getColumns,
  getRulePreviewColumns,
} from '../../configurations/security_solution_detections/columns';
import type { LicenseService } from '../../../../common/license';

export const buildAlertStatusFilter = (status: Status): Filter[] => {
  const combinedQuery =
    status === 'acknowledged'
      ? {
          bool: {
            should: [
              {
                term: {
                  [ALERT_WORKFLOW_STATUS]: status,
                },
              },
              {
                term: {
                  [ALERT_WORKFLOW_STATUS]: 'in-progress',
                },
              },
            ],
          },
        }
      : {
          term: {
            [ALERT_WORKFLOW_STATUS]: status,
          },
        };

  return [
    {
      meta: {
        alias: null,
        negate: false,
        disabled: false,
        type: 'phrase',
        key: ALERT_WORKFLOW_STATUS,
        params: {
          query: status,
        },
      },
      query: combinedQuery,
    },
  ];
};

/**
 * For backwards compatability issues, if `acknowledged` is a status prop, `in-progress` will likely have to be too
 */
export const buildAlertStatusesFilter = (statuses: Status[]): Filter[] => {
  const combinedQuery = {
    bool: {
      should: statuses.map((status) => ({
        term: {
          [ALERT_WORKFLOW_STATUS]: status,
        },
      })),
    },
  };

  return [
    {
      meta: {
        alias: null,
        negate: false,
        disabled: false,
      },
      query: combinedQuery,
    },
  ];
};

/**
 * Builds Kuery filter for fetching alerts for a specific rule. Takes the rule's
 * static id, i.e. `rule.ruleId` (not rule.id), so that alerts for _all
 * historical instances_ of the rule are returned.
 *
 * @param ruleStaticId Rule's static id: `rule.ruleId`
 */
export const buildAlertsFilter = (ruleStaticId: string | null): Filter[] =>
  ruleStaticId
    ? [
        {
          meta: {
            alias: null,
            negate: false,
            index: 'security-solution-default',
            disabled: false,
            type: 'phrase',
            key: ALERT_RULE_RULE_ID,
            params: {
              query: ruleStaticId,
            },
          },
          query: {
            match_phrase: {
              [ALERT_RULE_RULE_ID]: ruleStaticId,
            },
          },
        },
      ]
    : [];

export const buildAlertsFilterByRuleIds = (ruleIds: string[] | null): Filter[] => {
  if (ruleIds == null || ruleIds.length === 0) {
    return [];
  }

  const combinedQuery = {
    bool: {
      should: ruleIds.map((ruleId) => ({
        term: {
          [ALERT_RULE_RULE_ID]: ruleId,
        },
      })),
      minimum_should_match: 1,
    },
  };

  return [
    {
      meta: {
        alias: null,
        negate: false,
        disabled: false,
      },
      query: combinedQuery,
    },
  ];
};

export const buildShowBuildingBlockFilter = (showBuildingBlockAlerts: boolean): Filter[] =>
  showBuildingBlockAlerts
    ? []
    : [
        {
          meta: {
            alias: null,
            negate: true,
            disabled: false,
            type: 'exists',
            key: ALERT_BUILDING_BLOCK_TYPE,
            value: 'exists',
            index: 'security-solution-default',
          },
          query: { exists: { field: ALERT_BUILDING_BLOCK_TYPE } },
        },
      ];

export const buildThreatMatchFilter = (showOnlyThreatIndicatorAlerts: boolean): Filter[] =>
  showOnlyThreatIndicatorAlerts
    ? [
        {
          meta: {
            alias: null,
            disabled: false,
            negate: false,
            key: 'kibana.alert.rule.type',
            type: 'term',
            index: 'security-solution-default',
          },
          query: { term: { 'kibana.alert.rule.type': 'threat_match' } },
        },
      ]
    : [];

export const buildAlertAssigneesFilter = (assigneesIds: AssigneesIdsSelection[]): Filter[] => {
  if (!assigneesIds.length) {
    return [];
  }
  const combinedQuery = {
    bool: {
      should: assigneesIds.map((id) =>
        id
          ? {
              term: {
                [ALERT_WORKFLOW_ASSIGNEE_IDS]: id,
              },
            }
          : { bool: { must_not: { exists: { field: ALERT_WORKFLOW_ASSIGNEE_IDS } } } }
      ),
    },
  };

  return [
    {
      meta: {
        alias: null,
        negate: false,
        disabled: false,
        index: 'security-solution-default',
      },
      query: combinedQuery,
    },
  ];
};

export const ALERTS_TABLE_DEFAULT_ITEMS_PER_PAGE = 50;

export const getAlertsDefaultModel = (license?: LicenseService): SubsetDataTableModel => ({
  ...tableDefaults,
  columns: getColumns(license),
  itemsPerPage: ALERTS_TABLE_DEFAULT_ITEMS_PER_PAGE,
  showCheckboxes: true,
});

export const getAlertsPreviewDefaultModel = (license?: LicenseService): SubsetDataTableModel => ({
  ...getAlertsDefaultModel(license),
  columns: getRulePreviewColumns(license),
  defaultColumns: getRulePreviewColumns(license),
  itemsPerPage: tableDefaults.itemsPerPage,
  sort: [
    {
      columnId: 'kibana.alert.original_time',
      columnType: 'date',
      esTypes: ['date'],
      sortDirection: 'desc',
    },
  ],
  showCheckboxes: false,
});

export const requiredFieldsForActions = [
  '@timestamp',
  'kibana.alert.workflow_status',
  'kibana.alert.workflow_tags',
  'kibana.alert.workflow_assignee_ids',
  'kibana.alert.group.id',
  'kibana.alert.original_time',
  'kibana.alert.building_block_type',
  'kibana.alert.rule.from',
  'kibana.alert.rule.name',
  'kibana.alert.rule.to',
  'kibana.alert.rule.uuid',
  'kibana.alert.rule.rule_id',
  'kibana.alert.rule.type',
  'kibana.alert.rule.rule_type_id',
  'kibana.alert.suppression.docs_count',
  'kibana.alert.original_event.kind',
  'kibana.alert.original_event.module',
  // User entity fields (for flyout links and entity resolution)
  'user.id',
  'user.email',
  'user.domain',
  // Endpoint exception fields
  'file.path',
  'file.Ext.code_signature.subject_name',
  'file.Ext.code_signature.trusted',
  'file.hash.sha256',
  'host.os.family',
  'event.code',
  'process.entry_leader.entity_id',
];
