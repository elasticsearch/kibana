/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'yaml';
import type { WorkflowYaml } from '@kbn/workflows';
import {
  getManagedWorkflowDefinition,
  ALERTZERO_RULE_CREATION_WORKFLOW_ID,
  ALERTZERO_RULE_PREVIEW_WORKFLOW_ID,
  ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW_ID,
  ALERTZERO_RULE_TUNING_WORKER_WORKFLOW_ID,
  ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW_ID,
} from '@kbn/workflows/managed';
import { projectSkillsFromDefinition } from '../services/utils';
import { workerRegistry } from './worker_registry';

const DETECTION_WORKFLOW_IDS = [
  ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW_ID,
  ALERTZERO_RULE_TUNING_WORKER_WORKFLOW_ID,
  ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW_ID,
  ALERTZERO_RULE_CREATION_WORKFLOW_ID,
  ALERTZERO_RULE_PREVIEW_WORKFLOW_ID,
];

const getManagedYaml = (workflowId: string): string => {
  const definition = getManagedWorkflowDefinition(workflowId);
  if (!definition) throw new Error(`Missing managed workflow definition for "${workflowId}"`);
  if ('yaml' in definition && definition.yaml) return definition.yaml;
  if ('yamlTemplate' in definition && definition.yamlTemplate) {
    const registration = workerRegistry.get(workflowId);
    if (!registration) throw new Error(`Worker "${workflowId}" is not registered`);
    return definition.yamlTemplate(registration.settings.createDefaultValues());
  }
  throw new Error(`Managed workflow definition "${workflowId}" has no YAML source`);
};

interface NestedStep {
  name: string;
  type: string;
  if?: string;
  condition?: string;
  with?: Record<string, unknown>;
  steps?: NestedStep[];
  else?: NestedStep[];
  'on-failure'?: Record<string, unknown>;
}

const flattenSteps = (steps: NestedStep[]): NestedStep[] =>
  steps.flatMap((step) => [
    step,
    ...flattenSteps(step.steps ?? []),
    ...flattenSteps(step.else ?? []),
  ]);

describe('detection rule workflows', () => {
  describe('rule tuning worker', () => {
    const worker = parse(
      getManagedYaml(ALERTZERO_WORKER_DETECTION_RULE_TUNING_WORKFLOW_ID)
    ) as WorkflowYaml;

    it('schedules the per-space sweep every two hours and keeps manual runs available', () => {
      const triggers = worker.triggers as unknown as Array<{
        type: string;
        with?: Record<string, unknown>;
      }>;

      expect(triggers.map(({ type }) => type)).toEqual(['scheduled', 'manual']);
      expect(triggers[0].with).toEqual({ every: '2h' });
    });

    // Async because the sweep joins on its review gates and can park for 72h;
    // a sync call would park this worker run and stack scheduled runs behind it.
    it('dispatches the tuning sweep asynchronously', () => {
      const calls = flattenSteps(worker.steps as unknown as NestedStep[]).filter(({ type }) =>
        ['workflow.execute', 'workflow.executeAsync'].includes(String(type))
      );

      expect(calls.map(({ name, type }) => [name, type])).toEqual([
        ['run_rule_tuning', 'workflow.executeAsync'],
      ]);
      expect(calls[0].with?.['workflow-id']).toBe(ALERTZERO_RULE_TUNING_WORKER_WORKFLOW_ID);
    });
  });

  describe('detection rule workflow definitions', () => {
    // `| default: []` silently resolves to undefined because Liquid has no array
    // literal, which breaks any foreach whose source step produced no rows.
    it('never falls back to a bare [] literal in the detection workflows', () => {
      for (const id of DETECTION_WORKFLOW_IDS) {
        const withoutComments = getManagedYaml(id)
          .split('\n')
          .filter((line) => !line.trimStart().startsWith('#'))
          .join('\n');

        expect(withoutComments).not.toMatch(/default:\s*\[\s*\]/);
      }
    });

    // Liquid cannot group a condition with parentheses; it raises a tokenization error
    // that fails the step at runtime, long after the definition installs cleanly.
    it('groups no step condition with parentheses', () => {
      const conditions = DETECTION_WORKFLOW_IDS.flatMap((id) => {
        const { steps } = parse(getManagedYaml(id)) as WorkflowYaml;
        return flattenSteps(steps as unknown as NestedStep[]).flatMap(
          ({ name, if: stepIf, condition }) =>
            [stepIf, condition].filter(Boolean).map((expr) => [name, expr] as const)
        );
      });

      expect(conditions.length).toBeGreaterThan(0);
      for (const [name, expr] of conditions) {
        expect({ name, expr }).toEqual({ name, expr: expect.not.stringContaining('(') });
      }
    });

    // A legacy `type: array` output is compiled to an array of scalars, so emitting
    // objects through one fails output validation at runtime.
    it('declares no array outputs in the detection workflows', () => {
      for (const id of DETECTION_WORKFLOW_IDS) {
        const { outputs } = parse(getManagedYaml(id)) as WorkflowYaml;
        const declared = Array.isArray(outputs) ? (outputs as Array<{ type?: string }>) : [];

        expect(declared.map(({ type }) => type)).not.toContain('array');
      }
    });

    // The preview API validates timeframeEnd with zod's `.datetime()`, which rejects a
    // UTC offset and only accepts a `Z` suffix.
    it('sends every preview timeframeEnd as UTC', () => {
      for (const id of [
        ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW_ID,
        ALERTZERO_RULE_CREATION_WORKFLOW_ID,
      ]) {
        const lines = getManagedYaml(id)
          .split('\n')
          .filter((line) => line.includes('timeframeEnd'));

        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
          expect(line).not.toContain('%:z');
        }
      }
    });

    // Only `waitForApproval` renders the approve/reject buttons; a `waitForInput` gate
    // makes an analyst hand-author the resume payload as JSON instead.
    it('gates the review and creation workers on approval responses', () => {
      for (const id of [
        ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW_ID,
        ALERTZERO_RULE_CREATION_WORKFLOW_ID,
      ]) {
        const { steps } = parse(getManagedYaml(id)) as WorkflowYaml;
        const all = flattenSteps(steps as unknown as NestedStep[]);
        const gates = all.filter(({ type }) => type === 'waitForApproval');

        expect(gates).toHaveLength(1);
        expect(all.map(({ type }) => type)).not.toContain('waitForInput');

        const [gate] = gates;
        const conditions = all
          .flatMap(({ if: stepIf }) => (stepIf ? [stepIf] : []))
          .filter((expr) => expr.includes(gate.name));

        expect(conditions.length).toBeGreaterThan(0);
        for (const expr of conditions) {
          expect(expr).toContain(`steps.${gate.name}.output.response.approved`);
        }
      }
    });

    // The sweep has no ai.agent step; the diagnosing skill lives in the review child.
    it('keeps the skills inside the workers themselves', () => {
      const workerSkills = (id: string) =>
        projectSkillsFromDefinition(parse(getManagedYaml(id)) as WorkflowYaml, undefined);

      expect(workerSkills(ALERTZERO_RULE_TUNING_WORKER_WORKFLOW_ID)).toEqual([]);
      expect(workerSkills(ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW_ID)).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'investigate-rule', kind: 'skill' })])
      );
      expect(workerSkills(ALERTZERO_RULE_CREATION_WORKFLOW_ID)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'detection-rule-edit', kind: 'skill' }),
        ])
      );
    });

    describe('rule tuning alert marking', () => {
      const tuning = parse(
        getManagedWorkflowDefinition(ALERTZERO_RULE_TUNING_WORKER_WORKFLOW_ID)!.yaml!
      ) as WorkflowYaml;
      const review = parse(
        getManagedWorkflowDefinition(ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW_ID)!.yaml!
      ) as WorkflowYaml;
      const tuningSteps = flattenSteps(tuning.steps as unknown as NestedStep[]);
      const reviewSteps = flattenSteps(review.steps as unknown as NestedStep[]);
      const harvest = tuningSteps.find(({ name }) => name === 'harvest_fp_alerts_by_rule')!;
      const harvestQuery = String(harvest.with?.query);
      const reviewedTag = (tuning.consts as Record<string, string>).reviewed_tag;
      const tagSteps = reviewSteps.filter(({ type }) => type === 'security.setAlertTags');

      // The newest reviewed alert is a per-rule watermark: every FP at or before it
      // counts as addressed, tagged or not, so FPs beyond the tagged newest-100 batch
      // cannot be rediagnosed on the next sweep.
      it('retires everything at or before the newest reviewed alert', () => {
        expect(reviewedTag).toEqual(expect.any(String));
        expect(harvestQuery).toContain('MV_CONTAINS(`kibana.alert.workflow_tags`');
        expect(harvestQuery).toContain('{{ consts.reviewed_tag }}');
        expect(harvestQuery).toContain('INLINE STATS reviewed_watermark = MAX(@timestamp)');
        expect(harvestQuery).toContain('BY `kibana.alert.rule.uuid`');
        expect(harvestQuery).toContain(
          '(reviewed_watermark IS NULL OR @timestamp > reviewed_watermark)'
        );
      });

      it('measures FP rate independently from the unreviewed work queue', () => {
        expect(harvestQuery).toContain('fp_rate_count = COUNT(*) WHERE is_fp');
        expect(harvestQuery).toContain('fp_rate_count * 100 >= total_count');
      });

      // A review can outlive its sweep (cancelled sweep, manual run). Its rule must
      // not consume a sweep slot again while the gate is pending, so the harvest
      // excludes rules with an in-flight review, and fails open when the lookup or
      // the group-key parse cannot be trusted.
      it('skips rules whose review is still in flight', () => {
        const lookup = tuningSteps.find(({ name }) => name === 'list_active_reviews')!;
        const path = String(lookup.with?.path);
        const nonTerminal = [
          'pending',
          'waiting',
          'waiting_for_input',
          'waiting_for_child',
          'running',
          'queued',
        ];

        expect(path).toContain(
          `/api/workflows/workflow/${ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW_ID}/executions?`
        );
        for (const status of nonTerminal) {
          expect(path).toContain(`statuses=${status}`);
        }
        expect(lookup['on-failure']).toEqual({ continue: true });

        const resolve = tuningSteps.find(({ name }) => name === 'resolve_active_rules')!;
        expect(String(resolve.if)).toContain(
          'parsed_count == steps.collect_active_rules.output.expected'
        );

        const filter = JSON.stringify(harvest.with?.filter);
        expect(filter).toContain('must_not');
        expect(filter).toContain(
          '"kibana.alert.rule.uuid":"${{ steps.resolve_active_rules.output.rule_uuids | default: consts.no_rows }}"'
        );
      });

      // `kibana.alert.rule.enabled` on an alert is a creation-time snapshot, so a rule
      // disabled after alerting keeps harvesting until its FPs age out of the window.
      // The sweep checks live enabled status for the harvested candidates only and
      // drops disabled rules from the fan-out source (a parallel branch body cannot
      // carry a step-level `if`), failing open into a full fan-out when the lookup
      // returned nothing.
      it('skips reviews for rules that are no longer enabled', () => {
        const collect = tuningSteps.find(({ name }) => name === 'collect_candidates')!;
        const lookup = tuningSteps.find(({ name }) => name === 'list_enabled_candidates')!;
        const resolve = tuningSteps.find(({ name }) => name === 'resolve_enabled_rules')!;
        const rows = tuningSteps.find(({ name }) => name === 'resolve_fanout_rows')!;
        const fanOut = tuningSteps.find(({ name }) => name === 'run_reviews')!;

        const filterKql = String(collect.with?.filter_kql);
        expect(filterKql).toContain('alert.attributes.enabled: true');
        expect(filterKql).toContain('alert.id: ("alert:{{ row[0] }}")');

        const path = String(lookup.with?.path);
        expect(path).toContain('/api/detection_engine/rules/_find?');
        expect(path).toContain('per_page={{ consts.max_candidate_rules }}');
        expect(path).toContain('{{ steps.collect_candidates.output.filter_kql | url_encode }}');
        expect(String(lookup.if)).toContain('steps.collect_candidates.output.count > 0');
        expect(lookup['on-failure']).toEqual({ continue: true });

        // The prefixed joined string stays non-empty when zero candidates are
        // enabled, so all-disabled never reads as a missing lookup.
        expect(String(resolve.if)).toContain('steps.list_enabled_candidates.output.data != null');
        expect(String(resolve.with?.enabled_rule_ids)).toContain(
          "| join: ',' | prepend: 'enabled:'"
        );

        const rowsExpr = String(rows.with?.rows);
        expect(rowsExpr).toContain(
          "where_exp: 'row', 'steps.resolve_enabled_rules.output.enabled_rule_ids == null or steps.resolve_enabled_rules.output.enabled_rule_ids contains row[0]'"
        );
        // No `default` after where_exp: an empty filtered array is legitimate and a
        // default would resurrect every disabled candidate.
        expect(rowsExpr).not.toMatch(/where_exp:.*\| default:/);
        // The engine's rehydration planner cannot see step paths inside the quoted
        // where_exp argument; this direct reference keeps the ids resident. If it
        // is removed, an evicted value renders null and the filter fails open.
        expect(String(rows.with?.enabled_rule_ids)).toContain(
          '${{ steps.resolve_enabled_rules.output.enabled_rule_ids }}'
        );
        // Slice after the enabled filter: the pool overscans the launch cap so
        // disabled candidates cannot starve enabled rules ranked below them.
        expect(rowsExpr).toContain('| slice: 0, steps.collect_candidates.output.fanout_limit');
        expect(String(collect.with?.fanout_limit)).toContain(
          'inputs.max_rules_per_sweep | default: consts.max_rules_per_sweep'
        );

        expect(String((fanOut as NestedStep & { foreach?: string }).foreach)).toContain(
          'steps.resolve_fanout_rows.output.rows'
        );
      });

      // The pool is cut in ES|QL before the enabled check runs, so it must exceed
      // the launch cap for the enabled filter to have anything to backfill from.
      it('overscans the harvest pool beyond the launch cap', () => {
        const consts = (tuning as unknown as { consts: Record<string, number> }).consts;
        expect(consts.max_candidate_rules).toBe(20);
        expect(consts.max_rules_per_sweep).toBe(10);
        expect(consts.max_candidate_rules).toBeGreaterThan(consts.max_rules_per_sweep);
        expect(harvestQuery).toContain('LIMIT {{ consts.max_candidate_rules }}');

        const trigger = (
          tuning.triggers as unknown as Array<{
            type: string;
            inputs: { properties: Record<string, Record<string, unknown>> };
          }>
        ).find(({ type }) => type === 'manual')!;
        // The input can only lower the launch cap; the fan-out's parallel slots
        // are sized for the default.
        expect(trigger.inputs.properties.max_rules_per_sweep).toEqual(
          expect.objectContaining({ minimum: 1, maximum: consts.max_rules_per_sweep })
        );
      });

      it('does not split one rule history when its name changes', () => {
        const groupClause = harvestQuery
          .split('\n')
          .find((line) => line.trimStart().startsWith('BY '));

        expect(groupClause).not.toContain('kibana.alert.rule.name');
      });

      // The per-document exclusions live in the DSL filter so Lucene drops the rows
      // before ES|QL sees them.
      it('excludes hidden building-block alerts and bounds the window in the filter', () => {
        const filter = JSON.stringify(harvest.with?.filter);

        expect(filter).toContain('"exists":{"field":"kibana.alert.building_block_type"}');
        expect(filter).toContain(
          '"range":{"@timestamp":{"gte":"now-{{ inputs.analysis_window_days | default: consts.analysis_window_days }}d"}}'
        );
      });

      // The tag API writes to the alerts index of the space it runs in, so anything the
      // harvest reads outside that space could never be marked.
      it('harvests only the space it can tag in', () => {
        expect(harvestQuery).toContain('FROM .alerts-security.alerts-{{ workflow.spaceId }}');
      });

      // A partial aggregation returns a short alert_ids list, so alerts that drove an
      // approved change would stay untagged and come back on the next sweep.
      it('refuses partial harvest results', () => {
        expect(harvest.with?.allow_partial_results).toBe(false);
      });

      it('tags the harvested alerts once a decision is recorded', () => {
        expect(tagSteps.map(({ name }) => name)).toEqual([
          'mark_alerts_dismissed',
          'mark_alerts_applied',
          'mark_alerts_acknowledged',
        ]);

        const [dismissed, applied, acknowledged] = tagSteps;
        expect(dismissed.if).toContain('steps.review_tuning.output.response.approved == false');
        expect(dismissed.with?.tags_to_add).toEqual([
          '{{ consts.reviewed_tag }}',
          '{{ consts.dismissed_tag }}',
        ]);
        expect(applied.if).toContain('steps.record_outcome.output.rule_patched == true');
        expect(applied.with?.tags_to_add).toEqual([
          '{{ consts.reviewed_tag }}',
          '{{ consts.applied_tag }}',
        ]);
        // Approving a recommendation the pipeline cannot apply itself acknowledges
        // the manual follow-up and retires the alerts; the auto-apply path keeps
        // its alerts untagged on failure so a later sweep can retry.
        expect(acknowledged.if).toContain('steps.review_tuning.output.response.approved == true');
        expect(acknowledged.if).toContain(
          'steps.classify_proposal.output.can_apply_query == false'
        );
        expect(acknowledged.if).toContain(
          'steps.classify_proposal.output.can_apply_exception == false'
        );
        expect(acknowledged.if).toContain(
          'steps.classify_proposal.output.can_apply_risk_score == false'
        );
        expect(acknowledged.with?.tags_to_add).toEqual([
          '{{ consts.reviewed_tag }}',
          '{{ consts.acknowledged_tag }}',
        ]);
        for (const step of tagSteps) {
          expect(step).not.toHaveProperty('on-failure');
        }
      });

      // The applied tag must mean this pipeline changed the rule. A change that is
      // not auto-applied leaves its alerts untagged, so a later sweep can retry them.
      it('tags applied only when the rule was actually patched', () => {
        const applied = tagSteps.find(({ name }) => name === 'mark_alerts_applied')!;

        expect(applied.if).toContain('steps.record_outcome.output.rule_patched == true');

        // record_outcome reads from record_apply_results to avoid Liquid parentheses.
        const outcome = reviewSteps.find(({ name }) => name === 'record_outcome')!;
        expect(String(outcome.with?.rule_patched)).toContain(
          'steps.record_apply_results.output.query_applied == true'
        );

        const applyResults = reviewSteps.find(({ name }) => name === 'record_apply_results')!;
        expect(String(applyResults.with?.query_applied)).toContain(
          'steps.apply_query_tuning.error == null'
        );
      });

      it('applies exceptions via security.createRuleException gated on can_apply_exception', () => {
        const apply = reviewSteps.find(({ name }) => name === 'apply_exception_tuning')!;
        expect(apply.type).toBe('security.createRuleException');
        expect(apply.if).toContain('steps.classify_proposal.output.can_apply_exception == true');
        expect(apply.if).toContain('steps.review_tuning.output.response.approved == true');
        expect(apply['on-failure']).toEqual({ continue: true });
        expect(apply.with?.rule_id).toBe('{{ inputs.rule_uuid }}');
        expect(apply.with?.entries).toBe(
          '${{ steps.diagnose_rule.output.structured_output.exception_entries }}'
        );

        const applyResults = reviewSteps.find(({ name }) => name === 'record_apply_results')!;
        expect(String(applyResults.with?.exception_applied)).toContain(
          'steps.classify_proposal.output.can_apply_exception == true'
        );
        expect(String(applyResults.with?.exception_applied)).toContain(
          'steps.apply_exception_tuning.error == null'
        );
      });

      it('applies risk score changes via security.patchRule gated on can_apply_risk_score', () => {
        const apply = reviewSteps.find(({ name }) => name === 'apply_risk_score_tuning')!;
        expect(apply.type).toBe('security.patchRule');
        expect(apply.if).toContain('steps.classify_proposal.output.can_apply_risk_score == true');
        expect(apply.if).toContain('steps.review_tuning.output.response.approved == true');
        expect(apply['on-failure']).toEqual({ continue: true });
        const patch = apply.with?.patch as Record<string, string>;
        expect(patch.id).toBe('{{ inputs.rule_uuid }}');
        expect(patch.risk_score).toBe(
          '${{ steps.diagnose_rule.output.structured_output.proposed_risk_score }}'
        );
        expect(patch.severity).toBe(
          '{{ steps.diagnose_rule.output.structured_output.proposed_severity }}'
        );

        const applyResults = reviewSteps.find(({ name }) => name === 'record_apply_results')!;
        expect(String(applyResults.with?.risk_score_applied)).toContain(
          'steps.classify_proposal.output.can_apply_risk_score == true'
        );
        expect(String(applyResults.with?.risk_score_applied)).toContain(
          'steps.apply_risk_score_tuning.error == null'
        );
      });

      // The gate can stay open for 72h; a stale approval must not clobber an analyst
      // edit made in the meantime. Both reads go by saved-object id, so a rule
      // deleted and recreated under the same signature 404s instead of matching.
      it('re-reads the rule after approval and applies only when it is unchanged', () => {
        const fetches = reviewSteps.filter(({ name }) =>
          ['fetch_rule', 'refetch_rule'].includes(name)
        );
        const apply = reviewSteps.find(({ name }) => name === 'apply_query_tuning')!;
        const eligibility = reviewSteps.find(({ name }) => name === 'decide_apply')!;
        expect(fetches).toHaveLength(2);
        for (const fetch of fetches) {
          expect(String(fetch.with?.path)).toContain('?id={{ inputs.rule_uuid | url_encode }}');
        }
        expect(String(eligibility.with?.eligible)).toContain(
          'steps.refetch_rule.output.updated_at == steps.fetch_rule.output.updated_at'
        );
        expect(apply.type).toBe('security.patchRule');
        expect((apply.with?.patch as Record<string, string>).id).toBe(
          '{{ steps.refetch_rule.output.id }}'
        );
        expect(reviewSteps.some(({ name }) => name === 'refetch_rule')).toBe(true);
      });

      // Both backtests run inside one preview worker execution: one synchronous
      // child per wake-up cycle is safe, while two consecutive child calls share
      // one immediate-resume slot and can strand the review in waiting_for_child.
      it('backtests both queries through a single preview worker run', () => {
        const children = reviewSteps.filter(({ type }) => type === 'workflow.execute');

        expect(children.map(({ name }) => name)).toEqual(['run_previews']);
        const [previews] = children;
        expect(previews.with?.['workflow-id']).toBe(ALERTZERO_RULE_PREVIEW_WORKFLOW_ID);

        const previewInputs = previews.with?.inputs as Record<
          string,
          Record<string, string> | string
        >;
        expect((previewInputs.preview_body as Record<string, string>).query).toBe(
          '{{ steps.fetch_rule.output.query }}'
        );
        expect((previewInputs.proposed_body as Record<string, string>).query).toBe(
          '{{ steps.diagnose_rule.output.structured_output.proposed_query }}'
        );
      });

      it('requires both previews before applying a query change', () => {
        const eligibility = reviewSteps.find(({ name }) => name === 'decide_apply')!;
        const condition = String(eligibility.with?.eligible);

        expect(condition).toContain('current_succeeded == true');
        expect(condition).toContain('current_is_aborted == false');
        expect(condition).toContain('proposed_succeeded == true');
        expect(condition).toContain('proposed_is_aborted == false');
      });

      // A partial or timed-out alert count would understate a backtest, so the
      // preview worker must fail its verdict instead of reporting a low number.
      it('fails preview verdicts on partial counts', () => {
        const preview = parse(getManagedYaml(ALERTZERO_RULE_PREVIEW_WORKFLOW_ID)) as WorkflowYaml;
        const previewSteps = flattenSteps(preview.steps as unknown as NestedStep[]);
        const counts = previewSteps.filter(({ type }) => type === 'elasticsearch.search');
        const emit = previewSteps.find(({ name }) => name === 'emit_result')!;
        const emitInput = JSON.stringify(emit.with);

        expect(counts).toHaveLength(2);
        for (const count of counts) {
          expect(count.with?.allow_partial_search_results).toBe(false);
        }
        for (const verdict of ['succeeded', 'proposed_succeeded']) {
          expect(String((emit.with as Record<string, string>)[verdict])).toContain(
            'timed_out == false'
          );
        }
        expect(emitInput).toContain('_shards.failed == 0');
      });

      it('excludes rule modes with omitted preview fields from auto-apply', () => {
        const support = reviewSteps.find(({ name }) => name === 'record_auto_apply_support')!;
        const eligibility = reviewSteps.find(({ name }) => name === 'decide_apply')!;
        const condition = String(eligibility.with?.eligible);

        expect(String(support.with?.supported)).toContain(
          'steps.fetch_rule.output.data_view_id == null'
        );
        expect(String(support.with?.supported)).toContain(
          'steps.fetch_rule.output.timestamp_override == null'
        );
        expect(String(support.with?.supported)).toContain(
          'steps.fetch_rule.output.alert_suppression == null'
        );
        // The supported check is encoded inside classify_proposal.can_apply_query,
        // which is what decide_apply references.
        const classify = reviewSteps.find(({ name }) => name === 'classify_proposal')!;
        expect(String(classify.with?.can_apply_query)).toContain(
          'steps.record_auto_apply_support.output.supported == true'
        );
        expect(condition).toContain('steps.classify_proposal.output.can_apply_query == true');
      });

      it('bounds direct review inputs', () => {
        const [trigger] = review.triggers as unknown as Array<{
          inputs: { properties: Record<string, Record<string, unknown>> };
        }>;
        const { properties } = trigger.inputs;

        expect(properties.rule_uuid).toEqual(expect.objectContaining({ maxLength: 512 }));
        expect(properties.alert_ids).toEqual(
          expect.objectContaining({ minItems: 1, maxItems: 100 })
        );
        expect(properties.analysis_window_days).toEqual(
          expect.objectContaining({ minimum: 1, maximum: 30 })
        );
        expect(properties.preview_invocation_count).toEqual(
          expect.objectContaining({ minimum: 1, maximum: 10 })
        );
      });

      // security.setAlertTags declares its inputs as a zod union, so a whole-array
      // template lands the validation error on `with` instead of the templated field
      // and is not recognised as a template. Each tag must be its own list item.
      it('lists tags_to_add item by item, never as one array template', () => {
        for (const step of tagSteps) {
          const tags = step.with?.tags_to_add as string[];
          expect(Array.isArray(tags)).toBe(true);
          for (const tag of tags) {
            expect(tag).toMatch(/^\{\{ consts\.\w+ \}\}$/);
          }
        }
      });

      it('declares one const per decision tag, alongside the reviewed tag the harvest filters', () => {
        expect(review.consts).toEqual(
          expect.objectContaining({
            reviewed_tag: reviewedTag,
            dismissed_tag: 'detection-watch:tuning-dismissed',
            applied_tag: 'detection-watch:tuning-applied',
            acknowledged_tag: 'detection-watch:tuning-acknowledged',
          })
        );

        for (const step of tagSteps) {
          expect(step.with?.tags_to_add).toContain('{{ consts.reviewed_tag }}');
        }
      });

      // The diagnose prompt names a security_solution inline tool by its string id; a
      // skill-side rename would silently degrade the agent back to re-deriving alerts.
      it('pins the get_alerts_by_ids tool id the diagnose prompt depends on', () => {
        const diagnose = reviewSteps.find(({ name }) => name === 'diagnose_rule')!;
        expect(String(diagnose.with?.message)).toContain('investigate-rule.get_alerts_by_ids');
      });

      // The harvested ids are the dataset. A security.alerts query would re-fetch the
      // same alerts through a natural-language round trip and burn agent time.
      it('keeps the diagnosis on the supplied ids instead of querying alerts again', () => {
        const diagnose = reviewSteps.find(({ name }) => name === 'diagnose_rule')!;
        const message = String(diagnose.with?.message);

        expect(message).toContain('do not run the security.alerts queries');
        expect(message).not.toContain('time_window_hours');
      });

      it('does not use classify_review or record_apply_path', () => {
        for (const steps of [tuningSteps, reviewSteps]) {
          expect(steps.some(({ name }) => name === 'classify_review')).toBe(false);
          expect(steps.some(({ name }) => name === 'record_apply_path')).toBe(false);
        }
      });

      // The harvest projects its columns positionally, so reordering KEEP would make the
      // sweep hand some other column to the review as the alert ids.
      it('passes the alert ids from the column position KEEP assigns them', () => {
        const keepClause = harvestQuery
          .split('\n')
          .find((line) => line.trimStart().startsWith('| KEEP'))!;
        const columns = keepClause
          .replace('| KEEP', '')
          .split(',')
          .map((column) => column.trim().replace(/`/g, ''));
        const launch = tuningSteps.find(({ name }) => name === 'run_review')!;
        const launchInputs = launch.with?.inputs as Record<string, string>;

        expect(columns).toContain('alert_ids');
        expect(launchInputs.alert_ids).toContain(`foreach.item.${columns.indexOf('alert_ids')}`);
        for (const step of tagSteps) {
          expect(step.with?.alert_ids).toBe('${{ inputs.alert_ids }}');
        }
      });

      // TOP sorts by the collected value, so plain _id collection has no meaningful
      // order. The harvest collects sortable `timestamp|id` keys and expands them
      // back to plain ids, so alert_ids is exactly the newest-100 set: it grounds
      // the diagnosis and, once tagged, places the reviewed watermark.
      it('keeps only the newest false positives as alert ids', () => {
        expect(harvestQuery).toContain(
          'fp_recency_key = CONCAT(DATE_FORMAT("yyyyMMddHHmmssSSS", @timestamp), "|", _id)'
        );
        expect(harvestQuery).toContain('recent_keys = TOP(fp_recency_key');
        expect(harvestQuery).toContain('MV_EXPAND recent_keys');
        expect(harvestQuery).toContain('alert_id = SUBSTRING(recent_keys, 19)');
        expect(harvestQuery).toContain('alert_ids = VALUES(alert_id)');
      });

      // The gates live in the review children (one execution = one resume slot),
      // while the sweep fans out synchronously and joins once every gate settles.
      it('fans out one sync review per rule and joins on all gates', () => {
        const fanOut = tuningSteps.find(({ name }) => name === 'run_reviews')! as NestedStep & {
          mode?: string;
          concurrency?: { max: number; 'count-waiting': boolean };
        };
        const launches = tuningSteps.filter(({ type }) => type === 'workflow.execute');

        expect(fanOut.type).toBe('parallel');
        // Settled: one failed review must not skip the other rules' gates.
        expect(fanOut.mode).toBe('settled');
        // A slot per launched rule (max_rules_per_sweep; the input can only lower
        // the cap) so every gate opens at once.
        expect(fanOut.concurrency).toEqual({ max: 10, 'count-waiting': false });
        // A timeout here would abort branches and cancel children mid-approval;
        // the child gate's own timeout is the only clock.
        expect(fanOut).not.toHaveProperty('timeout');
        expect(fanOut).not.toHaveProperty('branch-timeout');

        expect(launches.map(({ name }) => name)).toEqual(['run_review']);
        expect(launches[0].with?.['workflow-id']).toBe(ALERTZERO_RULE_TUNING_REVIEW_WORKFLOW_ID);
        expect(launches[0]).not.toHaveProperty('on-failure');
        expect(tuningSteps.map(({ type }) => type)).not.toContain('waitForApproval');
        expect(tuningSteps.map(({ type }) => type)).not.toContain('workflow.executeAsync');

        const { concurrency } = (review as unknown as { settings: Record<string, unknown> })
          .settings as { concurrency: { key: string; strategy: string; max: number } };
        expect(concurrency.key).toContain('{{ inputs.rule_uuid }}');
        expect(concurrency.strategy).toBe('drop');
        expect(concurrency.max).toBe(1);
      });

      // The limit is per space; with max 1 a sweep waiting on its gates (up to 72h)
      // would make every scheduled 2h sweep get skipped until it finishes.
      it('keeps sweeping a space for new rules while earlier gates are pending', () => {
        const { concurrency } = (tuning as unknown as { settings: Record<string, unknown> })
          .settings as { concurrency: { strategy: string; max: number } };

        expect(concurrency.strategy).toBe('drop');
        expect(concurrency.max).toBe(5);
      });

      // The fan-in reads the settled aggregate, so the summary cannot run before
      // every gate has resolved or failed.
      it('summarizes decisions from the settled fan-out results', () => {
        const summary = tuningSteps.find(({ name }) => name === 'summarize_decisions')!;
        const emit = tuningSteps.find(({ name }) => name === 'emit_result')!;
        const summaryInput = JSON.stringify(summary.with);

        expect(summaryInput).toContain('steps.run_reviews.output.failed');
        expect(summaryInput).toContain("where: 'approved'");
        expect(summaryInput).toContain("where: 'applied'");
        for (const key of [
          'reviews_requested',
          'reviews_approved',
          'reviews_failed',
          'rules_applied',
        ]) {
          expect(String((emit.with as Record<string, string>)[key])).toContain(
            `steps.summarize_decisions.output.${key}`
          );
        }
      });
    });
  });
});
