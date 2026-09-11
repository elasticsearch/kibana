/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiPanel, EuiSpacer, EuiText } from '@elastic/eui';
import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { parse as parseYaml } from 'yaml';
import type { LayoutDirection, WorkflowYaml } from '@kbn/workflows';
import { WorkflowGraphPreview } from './workflow_graph_preview';

// --- YAML fixtures ---------------------------------------------------------
//
// Real-world-ish workflow shapes. Kept as YAML strings so the stories exercise
// the same parse path the attachment renderer uses (bad YAML → callout, valid
// YAML → graph, over-threshold → placeholder).

const YAML_ROBUST_DAILY_EXPORT = `
version: "1"
name: Robust Daily Export
enabled: true
triggers:
  - type: scheduled
    with:
      every: 24h
steps:
  - name: query_yesterday
    type: elasticsearch.esql.query
    with:
      query: FROM logs-* | WHERE @timestamp >= NOW() - 2 days | LIMIT 10000
  - name: export_to_archive
    type: http
    with:
      url: https://archive.example.com/ingest
      method: POST
  - name: log_success
    type: console
    with:
      message: Daily export completed successfully.
`;

const YAML_NATIONAL_PARKS = `
version: "1"
name: 🏔️ National Parks Demo
enabled: true
consts:
  indexName: national-parks
triggers:
  - type: manual
steps:
  - name: get_index
    type: elasticsearch.indices.exists
    with:
      index: "{{ consts.indexName }}"
  - name: check_if_index_exists
    type: if
    condition: 'steps.get_index.output : true'
    steps:
      - name: index_already_exists
        type: console
        with:
          message: index already exists
      - name: delete_index
        type: elasticsearch.indices.delete
        with:
          index: "{{ consts.indexName }}"
    else:
      - name: no_index_found
        type: console
        with:
          message: index not found
  - name: create_parks_index
    type: elasticsearch.indices.create
    with:
      index: "{{ consts.indexName }}"
  - name: bulk_index_park_data
    type: elasticsearch.bulk
    with:
      index: "{{ consts.indexName }}"
  - name: search_park_data
    type: elasticsearch.search
    with:
      index: "{{ consts.indexName }}"
  - name: log_results
    type: console
    with:
      message: results
  - name: loop_over_results
    type: foreach
    foreach: "{{ steps.search_park_data.output.hits.hits | json }}"
    steps:
      - name: process_item
        type: console
        with:
          message: "{{ foreach.item._source.name }}"
`;

const YAML_ALERT_TRIAGE = `
version: "1"
name: 🔒 Attack Discovery Triage
enabled: true
triggers:
  - type: alert
steps:
  - name: enrich_alert
    type: elasticsearch.esql.query
    with:
      query: FROM alerts-* | WHERE alert.id == "{{ event.id }}"
  - name: fetch_iocs
    type: http
    with:
      url: https://ti.example.com/lookup
    on-failure:
      retry:
        max-attempts: 3
  - name: check_severity
    type: if
    condition: 'steps.enrich_alert.output.severity == "high"'
    steps:
      - name: isolate_host
        type: http
        with:
          url: https://edr.example.com/isolate
      - name: notify_soc
        type: slack.postMessage
        with:
          channel: "#soc-alerts"
    else:
      - name: log_low_severity
        type: console
        with:
          message: low severity alert
  - name: create_case
    type: cases.createCase
    with:
      title: "Auto triage"
  - name: for_each_ioc
    type: foreach
    foreach: "{{ steps.fetch_iocs.output.iocs }}"
    steps:
      - name: query_vt
        type: http
        with:
          url: https://virustotal.example.com/lookup
      - name: attach_to_case
        type: cases.addComment
        with:
          case_id: "{{ steps.create_case.output.case.id }}"
  - name: page_oncall
    type: pagerduty
    with:
      severity: critical
`;

const YAML_INVALID = `
version: "1"
name: broken
steps:
  - name: this: is: not: valid: [{
`;

// Build a workflow with N steps to exercise the "too large" placeholder.
const buildLargeYaml = (n: number) => {
  const stepBlocks = Array.from(
    { length: n },
    (_, i) => `
  - name: step_${i + 1}
    type: console
    with:
      message: step ${i + 1}
`
  ).join('');
  return `
version: "1"
name: 🧨 ${n}-step workflow
enabled: true
triggers:
  - type: manual
steps:${stepBlocks}
`;
};

const YAML_TOO_LARGE = buildLargeYaml(20);

// --- Story harness ---------------------------------------------------------

interface StoryArgs {
  yaml: string;
  height: number;
  direction: LayoutDirection;
  rankSep: number;
  nodeSep: number;
  nodeWidth: number;
  nodeHeight: number;
  maxSteps: number;
}

const StoryFrame = ({ yaml, ...rest }: StoryArgs) => {
  let workflow: WorkflowYaml | null = null;
  try {
    const parsed = parseYaml(yaml);
    if (parsed && typeof parsed === 'object') {
      workflow = parsed as WorkflowYaml;
    }
  } catch {
    workflow = null;
  }

  return (
    <EuiPanel paddingSize="none" hasBorder style={{ width: 768, overflow: 'hidden' }}>
      <EuiPanel paddingSize="m" color="subdued" hasBorder={false} hasShadow={false}>
        <EuiText size="s">
          <strong>{workflow?.name ?? 'Invalid YAML'}</strong>
        </EuiText>
      </EuiPanel>
      {workflow ? (
        <WorkflowGraphPreview workflow={workflow} {...rest} />
      ) : (
        <EuiPanel paddingSize="m" color="warning">
          <EuiText size="s">
            {
              'YAML failed to parse. The real attachment renderer falls back to an EuiCallOut here; the story only exercises the graph path.'
            }
          </EuiText>
        </EuiPanel>
      )}
      <EuiSpacer size="s" />
    </EuiPanel>
  );
};

const meta: Meta<typeof StoryFrame> = {
  title: 'WorkflowGraphPreview',
  component: StoryFrame,
  args: {
    height: 220,
    direction: 'LR',
    rankSep: 32,
    nodeSep: 24,
    nodeWidth: 200,
    nodeHeight: 56,
    maxSteps: 11,
  },
  argTypes: {
    yaml: { control: 'text' },
    height: { control: { type: 'number', min: 120, max: 640, step: 10 } },
    direction: { control: { type: 'radio' }, options: ['LR', 'TB'] },
    rankSep: { control: { type: 'number', min: 0, max: 200, step: 4 } },
    nodeSep: { control: { type: 'number', min: 0, max: 200, step: 4 } },
    nodeWidth: { control: { type: 'number', min: 100, max: 400, step: 10 } },
    nodeHeight: { control: { type: 'number', min: 32, max: 200, step: 4 } },
    maxSteps: { control: { type: 'number', min: 1, max: 200, step: 1 } },
  },
};

export default meta;

type Story = StoryObj<typeof StoryFrame>;

// --- Stories ---------------------------------------------------------------

export const LinearThreeSteps: Story = {
  name: 'Linear · 3 steps + scheduled trigger',
  args: { yaml: YAML_ROBUST_DAILY_EXPORT },
};

export const IfElsePlusForeach: Story = {
  name: 'Control flow · if/else + foreach (national parks)',
  args: { yaml: YAML_NATIONAL_PARKS, height: 320 },
};

export const AlertTriageWithNested: Story = {
  name: 'Complex · alert triage w/ nested foreach + retry',
  args: { yaml: YAML_ALERT_TRIAGE, height: 340 },
};

export const HorizontalDefault: Story = {
  name: 'Layout · horizontal (default)',
  args: { yaml: YAML_ALERT_TRIAGE, height: 300, direction: 'LR' },
};

export const VerticalLayout: Story = {
  name: 'Layout · vertical (TB)',
  args: { yaml: YAML_ALERT_TRIAGE, height: 480, direction: 'TB' },
};

export const TightSpacing: Story = {
  name: 'Density · very tight rankSep/nodeSep',
  args: { yaml: YAML_ALERT_TRIAGE, height: 300, rankSep: 12, nodeSep: 12 },
};

export const OverThreshold: Story = {
  name: 'Placeholder · workflow exceeds maxSteps',
  args: { yaml: YAML_TOO_LARGE },
};

export const OverThresholdRaised: Story = {
  name: 'Placeholder · same workflow with maxSteps raised to 30',
  args: { yaml: YAML_TOO_LARGE, maxSteps: 30, height: 400, direction: 'TB' },
};

export const InvalidYaml: Story = {
  name: 'Error · unparseable YAML (renderer would show a callout)',
  args: { yaml: YAML_INVALID },
};
