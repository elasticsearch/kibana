/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataViewSpec, FieldSpec } from '@kbn/data-views-plugin/common';
import { DataView } from '@kbn/data-views-plugin/common';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import { WORKFLOWS_EXECUTIONS_INDEX } from '../../../common';

export const WORKFLOW_EXECUTIONS_DATA_VIEW_ID = 'workflows-executions-adhoc';

export const WORKFLOW_EXECUTIONS_DATA_VIEW_SPEC: DataViewSpec = {
  id: WORKFLOW_EXECUTIONS_DATA_VIEW_ID,
  title: WORKFLOWS_EXECUTIONS_INDEX,
  timeFieldName: 'startedAt',
};

const keywordField = (name: string): FieldSpec => ({
  name,
  type: 'string',
  esTypes: ['keyword'],
  searchable: true,
  aggregatable: true,
  readFromDocValues: true,
  scripted: false,
});

const dateField = (name: string): FieldSpec => ({
  name,
  type: 'date',
  esTypes: ['date'],
  searchable: true,
  aggregatable: true,
  readFromDocValues: true,
  scripted: false,
});

const booleanField = (name: string): FieldSpec => ({
  name,
  type: 'boolean',
  esTypes: ['boolean'],
  searchable: true,
  aggregatable: true,
  readFromDocValues: true,
  scripted: false,
});

export const WORKFLOW_EXECUTIONS_FIELD_SPECS: Record<string, FieldSpec> = {
  startedAt: dateField('startedAt'),
  createdAt: dateField('createdAt'),
  finishedAt: dateField('finishedAt'),
  id: keywordField('id'),
  workflowId: keywordField('workflowId'),
  status: keywordField('status'),
  triggeredBy: keywordField('triggeredBy'),
  executedBy: keywordField('executedBy'),
  createdBy: keywordField('createdBy'),
  isTestRun: booleanField('isTestRun'),
  spaceId: keywordField('spaceId'),
};

export const WORKFLOW_EXECUTIONS_DATA_VIEW_CREATE_SPEC: DataViewSpec = {
  ...WORKFLOW_EXECUTIONS_DATA_VIEW_SPEC,
  allowNoIndex: true,
  fields: WORKFLOW_EXECUTIONS_FIELD_SPECS,
};

export function createWorkflowExecutionsDataView(fieldFormats: FieldFormatsStart): DataView {
  return new DataView({
    spec: WORKFLOW_EXECUTIONS_DATA_VIEW_CREATE_SPEC,
    fieldFormats,
    metaFields: ['_id', '_type', '_source'],
  });
}
