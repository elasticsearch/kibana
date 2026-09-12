/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import { isEqual } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import { asyncMapWithLimit } from '@kbn/std';
import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { JSONSchema7 } from 'json-schema';
import {
  ACTION_WORKFLOW_INPUT,
  actionMetadataSchema,
  convertJsonSchemaToZod,
  ExecutionStatus,
  isHitlWaitStepType,
} from '@kbn/workflows';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { ActionMetadata } from '@kbn/workflows';
import {
  PROPOSALS_RESUME_CHANNEL,
  PROPOSAL_UNCATEGORIZED,
} from '../../../common/proposals/constants';
import type {
  ApproveProposalRequest,
  CreateProposalRequest,
  DismissProposalRequest,
  ListByWindowQuery,
  ListProposalsQuery,
  ListProposalsResponse,
  Proposal,
  ProposalChartsSummaryBucket,
  ProposalChartsSummaryQuery,
  ProposalChartsSummaryResponse,
  ProposalsListResponse,
  ProposalStatus,
  ProposalUser,
  ProposalWithMetadata,
} from '../../../common/proposals/proposal';
import { isExpired, MAX_PROPOSALS_SIZE } from '../../../common/proposals/proposal';
import type { ProposalDocument, ProposalsStorageClient } from '../storage/proposals_storage';
import { toSortRanks } from '../storage/sort_ranks';
import {
  ProposalConflictError,
  ProposalExpiredError,
  ProposalInvalidActionInputError,
  ProposalNotFoundError,
} from './errors';

type WorkflowsManagementApi = WorkflowsServerPluginSetup['management'];

/**
 * Elasticsearch's `esql.query.result_truncation_max_size` default. A LIMIT above
 * this is capped to it rather than honoured, so asking for more is not a way to
 * avoid truncation — bounding the row count is (see MAX_CHARTS_SUMMARY_BUCKETS).
 */
const ESQL_RESULT_TRUNCATION_MAX_SIZE = 10000;

/** One row per category; generous enough that truncation implies a bug. */
const ESQL_CATEGORY_ROW_LIMIT = 1000;

/** The parts of an action workflow definition this service reads. */
interface ActionWorkflowDefinition {
  consts?: { actionMetadata?: unknown };
  triggers?: Array<{ type?: string; inputs?: { properties?: Record<string, unknown> } }>;
}

/**
 * The stored document plus its id. Writers thread this through unchanged so the
 * sort ranks survive an update; only the public returns strip them.
 */
type StoredProposalRecord = { id: string } & ProposalDocument;

interface StoredProposal {
  proposal: StoredProposalRecord;
  seqNo?: number;
  primaryTerm?: number;
}

export interface UpdateProposalParams {
  id: string;
  status: Extract<ProposalStatus, 'executing' | 'succeeded' | 'failed' | 'dismissed'>;
  executionError?: string;
}

export interface ProposalsServiceDeps {
  storage: ProposalsStorageClient;
  logger: Logger;
  getWorkflowsApi: () => WorkflowsManagementApi;
}

/**
 * Owns every write to the proposals index. Decisions are recorded before the
 * gating workflow is resumed, so the record — not the resume payload — is the
 * durable channel for what was decided.
 */
export class ProposalsService {
  constructor(private readonly deps: ProposalsServiceDeps) {}

  async create(
    params: CreateProposalRequest,
    { spaceId, user }: { spaceId: string; user?: ProposalUser }
  ): Promise<Proposal> {
    const id = uuidv4();
    // Workflow callers reach us through Liquid templates, which render an
    // absent input as an empty string. Left as-is, `expiresAt: ''` is rejected
    // by the `date` mapping and an empty `actionWorkflowId` would make a
    // proposal look action-bearing when it is not.
    const actionWorkflowId = blankToUndefined(params.actionWorkflowId);

    // A single fetch of the action definition serves three purposes: the queue
    // grouping, the impact (intrinsic to the action rather than to the situation
    // that produced it), and rejecting an `actionInput` the action could not
    // accept — before an analyst is asked to approve something that cannot run.
    const metadata = actionWorkflowId
      ? await this.resolveAndValidateAction(actionWorkflowId, params.actionInput, spaceId)
      : undefined;

    // Absent for a proposal with no action: the category vocabulary belongs to
    // the solution that authored the action, so there is no default to invent.
    const category = metadata?.category;
    const impact = metadata?.impact ?? params.impact;

    const document: ProposalDocument = {
      spaceId,
      conversationId: params.conversationId,
      comment: params.comment,
      actionWorkflowId,
      actionInput: params.actionInput,
      status: 'pending',
      impact,
      confidence: params.confidence,
      category,
      origin: params.origin,
      ...toSortRanks({ impact, confidence: params.confidence }),
      expiresAt: blankToUndefined(params.expiresAt),
      workflowExecutionId: blankToUndefined(params.workflowExecutionId),
      createdAt: new Date().toISOString(),
      createdBy: user,
    };

    await this.deps.storage.index({ id, document, op_type: 'create' });

    return toProposal(id, document);
  }

  async get(id: string, spaceId: string): Promise<ProposalWithMetadata> {
    const { proposal } = await this.load(id, spaceId);
    return this.withMetadata(stripRanks(proposal), spaceId);
  }

  /**
   * Ordering and paging both happen in Elasticsearch. The queue's order is
   * impact, then confidence, then the nearest deadline — which the stored rank
   * fields express, because the keyword enums would otherwise sort
   * alphabetically. Doing it here rather than in memory is what makes the list
   * pageable instead of capped at a single fetch. Category is not part of the
   * order: a UI groups by it and decides for itself which group leads.
   */
  async list(query: ListProposalsQuery, spaceId: string): Promise<ListProposalsResponse> {
    const filter: QueryFilterList = [{ term: { spaceId } }];

    if (query.status) {
      filter.push({ term: { status: query.status } });
    }
    if (query.conversationId) {
      filter.push({ term: { conversationId: query.conversationId } });
    }
    if (query.excludeExpired) {
      // A proposal with no deadline never expires, so it has to survive the
      // filter alongside those whose deadline is still ahead.
      filter.push({
        bool: {
          should: [
            { bool: { must_not: { exists: { field: 'expiresAt' } } } },
            { range: { expiresAt: { gt: 'now' } } },
          ],
          minimum_should_match: 1,
        },
      });
    }

    const response = await this.deps.storage.search({
      track_total_hits: true,
      size: query.size,
      from: query.from,
      query: { bool: { filter } },
      sort: [
        { impactRank: { order: 'asc' } },
        { confidenceRank: { order: 'asc' } },
        // Soonest deadline first; proposals without one come after those with.
        { expiresAt: { order: 'asc', missing: '_last' } },
        // Final tiebreak, so paging over equally-ranked proposals is stable.
        { createdAt: { order: 'desc' } },
      ],
    });

    const proposals = await Promise.all(
      response.hits.hits
        .filter((hit): hit is typeof hit & { _id: string } => hit._id !== undefined)
        .map((hit) =>
          this.withMetadata(toProposal(hit._id, hit._source as ProposalDocument), spaceId)
        )
    );

    return {
      proposals,
      total:
        typeof response.hits.total === 'number'
          ? response.hits.total
          : response.hits.total?.value ?? proposals.length,
    };
  }

  /**
   * Returns all currently-pending proposals (regardless of age) plus proposals
   * that were decided within the given time window, in queue order.
   *
   * "Pending" and "decided in the last N hours" are unrelated conditions, so
   * this cannot be expressed as a conjunction on top of `list()`'s query; it
   * needs its own `should` disjunction and is intentionally not given an HTTP
   * route in this plugin — the shaping is AlertZero-specific and is reachable
   * only through the in-process start contract.
   *
   * Action-metadata resolution is memoised per `actionWorkflowId` across the
   * entire result set to avoid a `getWorkflow` fetch per proposal.
   */
  async listByWindow(query: ListByWindowQuery, spaceId: string): Promise<ProposalsListResponse> {
    const statusClause =
      query.includeStatuses.length > 0 ? [{ terms: { status: query.includeStatuses } }] : [];

    const response = await this.deps.storage.search({
      track_total_hits: true,
      size: MAX_PROPOSALS_SIZE,
      query: {
        bool: {
          filter: [{ term: { spaceId } }],
          // TODO(#19258): add `must_not: { exists: { field: 'supersededBy' } }` once the field lands.
          should: [
            ...statusClause,
            { range: { decidedAt: { gte: `now-${query.decidedWithinHours}h` } } },
          ],
          minimum_should_match: 1,
        },
      },
      sort: [{ createdAt: { order: 'asc' } }],
    });

    const hits = response.hits.hits.filter(
      (hit): hit is typeof hit & { _id: string } => hit._id !== undefined
    );
    const rawProposals = hits.map((hit) => toProposal(hit._id, hit._source as ProposalDocument));

    const proposals = await this.withMetadataBatch(rawProposals, spaceId);

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? proposals.length;

    return { proposals, total, truncated: total > proposals.length };
  }

  /**
   * Open-proposal counts per bucket. A proposal counts as open at bucket T if it
   * was created at or before the end of T and had neither been decided nor
   * expired by the start of T+1.
   *
   * An anchor count seeds a running sum that opens, closes and expiries then
   * move, which is what keeps this to four queries instead of one per bucket.
   *
   * Expiry is treated as a fourth event stream rather than as a `WHERE` filter.
   * Filtering on `expiresAt > NOW()` would evaluate a *request-time* predicate
   * against every historical bucket, so a proposal that has since expired would
   * be erased from its own past — the same past bucket would return a different
   * value on each refetch.
   */
  async chartsSummary(
    { windowHours, bucketMinutes }: ProposalChartsSummaryQuery,
    spaceId: string
  ): Promise<ProposalChartsSummaryResponse> {
    const now = Date.now();
    const bucketMs = bucketMinutes * 60 * 1000;
    const windowStartMs = Math.floor((now - windowHours * 60 * 60 * 1000) / bucketMs) * bucketMs;
    const windowStartIso = new Date(windowStartMs).toISOString();
    // +1 so the window always ends at or after `now` even after flooring.
    const bucketCount = Math.floor((now - windowStartMs) / bucketMs) + 1;

    const zeroBuckets = (): ProposalChartsSummaryResponse => ({
      buckets: Array.from({ length: bucketCount }, (_, i) => ({
        timestamp: windowStartMs + i * bucketMs,
        counts: {},
      })),
    });

    let anchorResponse;
    let opensResponse;
    let closesResponse;
    let expiriesResponse;
    try {
      [anchorResponse, opensResponse, closesResponse, expiriesResponse] = await Promise.all([
        // TODO(#19258): once `supersededBy` exists, add `AND supersededBy IS NULL`
        // to all four queries, so a superseded proposal is not counted alongside
        // its replacement.
        //
        // `COALESCE(category, …)` in every query: a proposal with no action has no
        // category, and a bare `BY category` would drop it from the aggregation —
        // and, under `drop_null_columns`, drop the column outright when no row has
        // one, zeroing the whole chart.
        this.deps.storage.esql({
          pipeline: esql`WHERE spaceId == ${{ spaceId }}
          AND createdAt < TO_DATETIME(${{ wsAnchorCreated: windowStartIso }})
          AND (decidedAt IS NULL OR decidedAt >= TO_DATETIME(${{
            wsAnchorDecided: windowStartIso,
          }}))
          AND (expiresAt IS NULL OR expiresAt >= TO_DATETIME(${{
            wsAnchorExpires: windowStartIso,
          }}))
        | EVAL category = COALESCE(category, ${{ anchorUncategorized: PROPOSAL_UNCATEGORIZED }})
        | STATS anchor = COUNT(*) BY category
        | LIMIT ${ESQL_CATEGORY_ROW_LIMIT}`,
        }),

        this.deps.storage.esql({
          pipeline: esql`WHERE spaceId == ${{ spaceId }}
          AND createdAt >= TO_DATETIME(${{ wsOpensFilter: windowStartIso }})
        | EVAL idx = FLOOR(DATE_DIFF("minutes", TO_DATETIME(${{
          wsOpensDiff: windowStartIso,
        }}), createdAt) / ${{ bucketMinutes }})
        | EVAL category = COALESCE(category, ${{ opensUncategorized: PROPOSAL_UNCATEGORIZED }})
        | STATS opens = COUNT(*) BY idx, category
        | SORT idx ASC
        | LIMIT ${ESQL_RESULT_TRUNCATION_MAX_SIZE}`,
        }),

        this.deps.storage.esql({
          pipeline: esql`WHERE spaceId == ${{ spaceId }}
          AND decidedAt IS NOT NULL
          AND decidedAt >= TO_DATETIME(${{ wsClosesFilter: windowStartIso }})
        | EVAL idx = FLOOR(DATE_DIFF("minutes", TO_DATETIME(${{
          wsClosesDiff: windowStartIso,
        }}), decidedAt) / ${{ bucketMinutes }})
        | EVAL category = COALESCE(category, ${{ closesUncategorized: PROPOSAL_UNCATEGORIZED }})
        | STATS closes = COUNT(*) BY idx, category
        | SORT idx ASC
        | LIMIT ${ESQL_RESULT_TRUNCATION_MAX_SIZE}`,
        }),

        // `decidedAt IS NULL` so a proposal that expired and was later decided is
        // decremented once, by the closes query, rather than by both.
        this.deps.storage.esql({
          pipeline: esql`WHERE spaceId == ${{ spaceId }}
          AND decidedAt IS NULL
          AND expiresAt IS NOT NULL
          AND expiresAt >= TO_DATETIME(${{ wsExpiriesFilter: windowStartIso }})
          AND expiresAt <= NOW()
        | EVAL idx = FLOOR(DATE_DIFF("minutes", TO_DATETIME(${{
          wsExpiriesDiff: windowStartIso,
        }}), expiresAt) / ${{ bucketMinutes }})
        | EVAL category = COALESCE(category, ${{ expiriesUncategorized: PROPOSAL_UNCATEGORIZED }})
        | STATS expiries = COUNT(*) BY idx, category
        | SORT idx ASC
        | LIMIT ${ESQL_RESULT_TRUNCATION_MAX_SIZE}`,
        }),
      ]);
    } catch (error) {
      // An index created outside the storage adapter can be missing a field this
      // queries, which ES|QL rejects rather than treating as null. Read *that*
      // case as "no data" so the UI flatlines instead of 500ing. Every other
      // verification failure is a genuine query defect and must propagate:
      // swallowing it would render a healthy-looking dashboard of zeroes.
      if (isEsqlUnknownColumnError(error)) {
        this.deps.logger.warn(
          `chartsSummary: ES|QL reported an unknown column — returning zero buckets. ` +
            `Recreate the index via the proposals write path to fix the mapping. Error: ${error.message}`
        );
        return zeroBuckets();
      }
      throw error;
    }

    this.warnIfTruncated(opensResponse, 'opens');
    this.warnIfTruncated(closesResponse, 'closes');
    this.warnIfTruncated(expiriesResponse, 'expiries');

    const anchorByCat = parseEsqlCountByCategory(anchorResponse, 'anchor');
    const opensByIdxAndCat = parseEsqlCountByIdxAndCategory(opensResponse, 'opens');
    const closesByIdxAndCat = parseEsqlCountByIdxAndCategory(closesResponse, 'closes');
    const expiriesByIdxAndCat = parseEsqlCountByIdxAndCategory(expiriesResponse, 'expiries');

    const runningSums: Record<string, number> = { ...anchorByCat };
    const buckets: ProposalChartsSummaryBucket[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const timestamp = windowStartMs + i * bucketMinutes * 60_000;

      for (const [cat, count] of Object.entries(opensByIdxAndCat[i] ?? {})) {
        runningSums[cat] = (runningSums[cat] ?? 0) + count;
      }
      for (const [cat, count] of Object.entries(closesByIdxAndCat[i] ?? {})) {
        // Clamped because a close whose open the anchor missed would drive this
        // negative, and a negative open count is worse than an undercount.
        runningSums[cat] = Math.max(0, (runningSums[cat] ?? 0) - count);
      }
      for (const [cat, count] of Object.entries(expiriesByIdxAndCat[i] ?? {})) {
        runningSums[cat] = Math.max(0, (runningSums[cat] ?? 0) - count);
      }

      buckets.push({ timestamp, counts: { ...runningSums } });
    }

    return { buckets };
  }

  /**
   * Elasticsearch caps an ES|QL result set at `esql.query.result_truncation_max_size`
   * whatever LIMIT the query asked for, and drops the tail of the sort — here, the
   * most recent buckets. The schema's bucket ceiling should keep this unreachable,
   * so a hit means an unexpectedly wide category vocabulary.
   */
  private warnIfTruncated(response: { values: unknown[] }, label: string): void {
    if (response.values.length >= ESQL_RESULT_TRUNCATION_MAX_SIZE) {
      this.deps.logger.warn(
        `chartsSummary: the ${label} query returned ${response.values.length} rows, at or above ` +
          `the ES|QL truncation ceiling of ${ESQL_RESULT_TRUNCATION_MAX_SIZE}. The most recent ` +
          `buckets may be undercounted.`
      );
    }
  }

  /**
   * Records the approval and then releases the gating workflow. Order matters:
   * the workflow only ever receives a boolean, so anything durable has to be
   * written first.
   */
  async approve(
    id: string,
    params: ApproveProposalRequest,
    { spaceId, request, user }: DecisionContext
  ): Promise<Proposal> {
    const { proposal, seqNo, primaryTerm } = await this.load(id, spaceId);

    this.assertDecidable(proposal);

    if (params.actionInput !== undefined && !sameInput(params.actionInput, proposal.actionInput)) {
      throw new ProposalConflictError(
        `Proposal [${id}] was modified since it was rendered; re-read it before approving`
      );
    }

    const decided = await this.writeDecision(
      { ...proposal, status: 'approved', rationale: params.rationale },
      { seqNo, primaryTerm, user }
    );

    try {
      await this.resumeGate(decided, { spaceId, request, approved: true });
    } catch (error) {
      // The decision is durable but the gate is still parked, so record why
      // before surfacing the failure rather than reporting a clean approval.
      await this.markResumeFailed(id, spaceId, error);
      throw error;
    }

    return stripRanks(decided);
  }

  /** Same shape as `approve`, but releases the workflow down its negative branch. */
  async dismiss(
    id: string,
    params: DismissProposalRequest,
    { spaceId, request, user }: DecisionContext
  ): Promise<Proposal> {
    const { proposal, seqNo, primaryTerm } = await this.load(id, spaceId);

    this.assertDecidable(proposal);

    const decided = await this.writeDecision(
      {
        ...proposal,
        status: 'dismissed',
        dismissReason: params.dismissReason,
        rationale: params.rationale,
      },
      { seqNo, primaryTerm, user }
    );

    try {
      await this.resumeGate(decided, { spaceId, request, approved: false });
    } catch (error) {
      // A dismissal cannot be recorded as failed — `dismissed` is already
      // terminal — so the parked gate only survives in the log. The workflow's
      // own HITL timeout is what eventually releases it.
      this.deps.logger.error(
        `Proposal [${id}] was dismissed but its gate could not be released: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }

    return stripRanks(decided);
  }

  /**
   * Called by the gate workflow to advance a proposal it owns. Refuses to move
   * a proposal that already settled, so a late failure — an `on-failure`
   * handler firing after the action succeeded, say — cannot rewrite the
   * outcome. Enforced here rather than in the workflow YAML so it holds for
   * every caller.
   */
  async update(
    { id, status, executionError }: UpdateProposalParams,
    spaceId: string
  ): Promise<Proposal> {
    const { proposal, seqNo, primaryTerm } = await this.load(id, spaceId);

    if (isTerminal(proposal.status)) {
      throw new ProposalConflictError(
        `Proposal [${id}] already settled as ${proposal.status} and cannot be moved to ${status}`
      );
    }

    const updated: StoredProposalRecord = {
      ...proposal,
      status,
      executionError,
      // Only writeDecision stamps decidedAt otherwise, so a proposal a workflow
      // terminated would read as open forever.
      ...(isTerminal(status) && !proposal.decidedAt ? { decidedAt: new Date().toISOString() } : {}),
    };
    const { id: _id, ...document } = updated;

    await this.deps.storage.index({
      id,
      document,
      ...(seqNo !== undefined && primaryTerm !== undefined
        ? { if_seq_no: seqNo, if_primary_term: primaryTerm }
        : {}),
    });

    return stripRanks(updated);
  }

  /**
   * Reads the action workflow's self-declared metadata from `consts.actionMetadata`.
   * Resolved on read so a catalog change is picked up rather than baked into
   * every historical proposal.
   */
  async resolveActionMetadata(
    actionWorkflowId: string,
    spaceId: string
  ): Promise<ActionMetadata | undefined> {
    const definition = await this.fetchActionDefinition(actionWorkflowId, spaceId);
    return definition && this.readActionMetadata(actionWorkflowId, definition);
  }

  /**
   * The creation path: one fetch, then both the metadata and the input check.
   * An invalid input throws, because a proposal whose action can never run has
   * no business sitting in a human's queue.
   */
  private async resolveAndValidateAction(
    actionWorkflowId: string,
    actionInput: Record<string, unknown> | undefined,
    spaceId: string
  ): Promise<ActionMetadata | undefined> {
    const definition = await this.fetchActionDefinition(actionWorkflowId, spaceId);
    if (!definition) {
      return undefined;
    }

    this.assertActionInputValid(actionWorkflowId, definition, actionInput);
    return this.readActionMetadata(actionWorkflowId, definition);
  }

  /**
   * Validates `actionInput` against the schema the action declares on its manual
   * trigger. Best-effort by design: the JSON Schema to zod conversion does not
   * cover every keyword, so this catches the common mistakes — a missing
   * required field or the wrong type — and lets anything it cannot express
   * through rather than rejecting a valid input.
   */
  private assertActionInputValid(
    actionWorkflowId: string,
    definition: ActionWorkflowDefinition,
    actionInput: Record<string, unknown> | undefined
  ): void {
    const inputSchema = definition.triggers?.find(({ type }) => type === 'manual')?.inputs
      ?.properties?.[ACTION_WORKFLOW_INPUT];

    if (!inputSchema) {
      // The action declares no input contract, so there is nothing to check.
      return;
    }

    const parsed = convertJsonSchemaToZod(inputSchema as JSONSchema7).safeParse(actionInput ?? {});
    if (!parsed.success) {
      throw new ProposalInvalidActionInputError(
        `actionInput does not satisfy action workflow [${actionWorkflowId}]: ${parsed.error.issues
          .map(({ path, message }) => `${path.join('.') || '(root)'}: ${message}`)
          .join('; ')}`
      );
    }
  }

  private async fetchActionDefinition(
    actionWorkflowId: string,
    spaceId: string
  ): Promise<ActionWorkflowDefinition | undefined> {
    try {
      const workflow = await this.deps.getWorkflowsApi().getWorkflow(actionWorkflowId, spaceId);
      return workflow?.definition as ActionWorkflowDefinition | undefined;
    } catch (error) {
      this.deps.logger.warn(
        `Failed to read action workflow [${actionWorkflowId}]: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return undefined;
    }
  }

  private readActionMetadata(
    actionWorkflowId: string,
    definition: ActionWorkflowDefinition
  ): ActionMetadata | undefined {
    const candidate = definition.consts?.actionMetadata;
    if (!candidate) {
      return undefined;
    }

    const parsed = actionMetadataSchema.safeParse(candidate);
    if (!parsed.success) {
      this.deps.logger.warn(
        `Action workflow [${actionWorkflowId}] declares invalid consts.actionMetadata: ${parsed.error.message}`
      );
      return undefined;
    }
    return parsed.data;
  }

  private async load(id: string, spaceId: string): Promise<StoredProposal> {
    // A blank id reaches us when a workflow template resolves to nothing — for
    // instance an on-failure handler firing before the proposal was created.
    // Elasticsearch would answer with an opaque "Ids can't be empty" shard
    // failure, so refuse it here instead.
    if (blankToUndefined(id) === undefined) {
      throw new ProposalNotFoundError(id);
    }

    const response = await this.deps.storage.search({
      track_total_hits: false,
      size: 1,
      seq_no_primary_term: true,
      query: { bool: { filter: [{ ids: { values: [id] } }, { term: { spaceId } }] } },
    });

    const hit = response.hits.hits[0];
    if (!hit?._source || hit._id === undefined) {
      throw new ProposalNotFoundError(id);
    }

    return {
      proposal: { id: hit._id, ...(hit._source as ProposalDocument) },
      seqNo: hit._seq_no,
      primaryTerm: hit._primary_term,
    };
  }

  private assertDecidable(proposal: StoredProposalRecord): void {
    if (proposal.status !== 'pending') {
      throw new ProposalConflictError(
        `Proposal [${proposal.id}] was already decided (status: ${proposal.status})`
      );
    }
    if (isExpired(proposal)) {
      throw new ProposalExpiredError(proposal.id);
    }
  }

  private async writeDecision(
    proposal: StoredProposalRecord,
    { seqNo, primaryTerm, user }: { seqNo?: number; primaryTerm?: number; user?: ProposalUser }
  ): Promise<StoredProposalRecord> {
    const decided: StoredProposalRecord = {
      ...proposal,
      // Server-derived; never accepted from the caller.
      decidedBy: user,
      decidedAt: new Date().toISOString(),
    };
    const { id, ...document } = decided;

    try {
      await this.deps.storage.index({
        id,
        document,
        ...(seqNo !== undefined && primaryTerm !== undefined
          ? { if_seq_no: seqNo, if_primary_term: primaryTerm }
          : {}),
      });
    } catch (error) {
      if (isVersionConflict(error)) {
        throw new ProposalConflictError(`Proposal [${id}] was decided by another actor first`);
      }
      throw error;
    }

    return decided;
  }

  /**
   * Releases the parked gate. The waiting step is resolved here and passed
   * explicitly: the platform's own lookup only matches `waitForInput`, and when
   * it resolves nothing it resumes without claiming the step or stamping the
   * audit envelope.
   */
  private async resumeGate(
    proposal: StoredProposalRecord,
    { spaceId, request, approved }: { spaceId: string; request: KibanaRequest; approved: boolean }
  ): Promise<void> {
    if (!proposal.workflowExecutionId) {
      // Standalone proposal: nothing is waiting on the decision.
      return;
    }

    const api = this.deps.getWorkflowsApi();
    const execution = await api.getWorkflowExecution(proposal.workflowExecutionId, spaceId);
    if (!execution) {
      throw new ProposalConflictError(
        `Execution [${proposal.workflowExecutionId}] for proposal [${proposal.id}] not found`
      );
    }
    if (execution.status !== ExecutionStatus.WAITING_FOR_INPUT || execution.finishedAt) {
      throw new ProposalConflictError(
        `Execution [${proposal.workflowExecutionId}] is not waiting for input (status: ${execution.status})`
      );
    }

    const stepExecutionId = findWaitingGateStepId(execution.stepExecutions);

    await api.resumeWorkflowExecution(
      proposal.workflowExecutionId,
      spaceId,
      { approved },
      request,
      { channel: PROPOSALS_RESUME_CHANNEL, ...(stepExecutionId ? { stepExecutionId } : {}) }
    );
  }

  /**
   * Records why an approved proposal never reached its action. Deliberately
   * swallows its own failure: the resume error is the one worth propagating,
   * and this write can legitimately lose — a gate released elsewhere may have
   * already settled the proposal, which `update` refuses to move.
   */
  private async markResumeFailed(id: string, spaceId: string, cause: unknown): Promise<void> {
    const message = cause instanceof Error ? cause.message : String(cause);

    try {
      await this.update({ id, status: 'failed', executionError: message }, spaceId);
    } catch (error) {
      this.deps.logger.error(
        `Failed to record the resume failure for proposal [${id}]: ${
          error instanceof Error ? error.message : String(error)
        } (original failure: ${message})`
      );
    }
  }

  private async withMetadata(proposal: Proposal, spaceId: string): Promise<ProposalWithMetadata> {
    const action = proposal.actionWorkflowId
      ? await this.resolveActionMetadata(proposal.actionWorkflowId, spaceId)
      : undefined;

    return { ...proposal, action, expired: isExpired(proposal) };
  }

  /**
   * Resolves action metadata for a collection of proposals with a concurrency
   * cap. Unique workflow IDs are fetched once each (deduplicated up front) and
   * results are collected into a Map before the proposals are assembled, so a
   * single failure for one workflow ID never affects proposals backed by a
   * different one.
   */
  private async withMetadataBatch(
    proposals: Proposal[],
    spaceId: string
  ): Promise<ProposalWithMetadata[]> {
    const uniqueWorkflowIds = [
      ...new Set(
        proposals.map((p) => p.actionWorkflowId).filter((id): id is string => id !== undefined)
      ),
    ];

    const metaEntries = await asyncMapWithLimit(uniqueWorkflowIds, 10, async (id) => {
      const meta = await this.resolveActionMetadata(id, spaceId);
      return [id, meta] as [string, ActionMetadata | undefined];
    });

    const metaMap = new Map<string, ActionMetadata | undefined>(metaEntries);

    return proposals.map((proposal) => ({
      ...proposal,
      action:
        proposal.actionWorkflowId !== undefined
          ? metaMap.get(proposal.actionWorkflowId)
          : undefined,
      expired: isExpired(proposal),
    }));
  }
}

interface DecisionContext {
  spaceId: string;
  request: KibanaRequest;
  user?: ProposalUser;
}

type QueryFilterList = Array<Record<string, unknown>>;

/**
 * Drops the storage-only sort ranks, so they never reach the API contract.
 * Destructuring is the point: adding a rank field forces this to be updated.
 */
const stripRanks = ({ impactRank, confidenceRank, ...proposal }: StoredProposalRecord): Proposal =>
  proposal;

const toProposal = (id: string, document: ProposalDocument): Proposal =>
  stripRanks({ id, ...document });

/**
 * A proposal that has settled. `approved` is not terminal: an action proposal
 * still has to execute and report back.
 */
const isTerminal = (status: ProposalStatus): boolean =>
  status === 'succeeded' || status === 'failed' || status === 'dismissed';

/**
 * Treats an empty or whitespace-only string as absent. Liquid renders a missing
 * workflow input as `''`, which is not the same thing as a value.
 */
const blankToUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
};

/**
 * The most recently started gate step that has neither finished nor been
 * answered. Mirrors the platform's own waiting-step query, but for
 * `waitForApproval`.
 */
const findWaitingGateStepId = (
  stepExecutions: Array<{
    id: string;
    stepType?: string;
    status: string;
    startedAt: string;
    finishedAt?: string;
    hitl?: { respondedAt?: string };
  }>
): string | undefined =>
  stepExecutions
    .filter(
      (step) =>
        isHitlWaitStepType(step.stepType) &&
        step.status === ExecutionStatus.WAITING_FOR_INPUT &&
        !step.finishedAt &&
        !step.hitl?.respondedAt
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.id;

/**
 * Deep equality rather than a serialized comparison: the submitted input is
 * parsed from the request body and the stored one from `_source`, so their key
 * order need not match even when the values do.
 */
const sameInput = (
  submitted: Record<string, unknown>,
  stored: Record<string, unknown> | undefined
): boolean => isEqual(submitted ?? {}, stored ?? {});

/**
 * Narrow on purpose. ES|QL raises `verification_exception` for every query it
 * refuses to plan — a renamed field, an unsupported function, a bad cast. Only
 * the unknown-column case means "the mapping has not caught up yet"; treating
 * the rest as no-data would turn a broken query into a silent flat line.
 */
const isEsqlUnknownColumnError = (error: unknown): boolean => {
  const body =
    (error as { meta?: { body?: { error?: { type?: string; reason?: string } } } })?.meta?.body
      ?.error ?? (error as { body?: { error?: { type?: string; reason?: string } } })?.body?.error;

  if (body?.type !== 'verification_exception') return false;

  const detail = `${body.reason ?? ''} ${(error as { message?: string })?.message ?? ''}`;
  return /unknown column/i.test(detail);
};

const isVersionConflict = (error: unknown): boolean => {
  const status = (error as { statusCode?: number; meta?: { statusCode?: number } })?.statusCode;
  const metaStatus = (error as { meta?: { statusCode?: number } })?.meta?.statusCode;
  return status === 409 || metaStatus === 409;
};

/**
 * Columns are looked up by name, not position: `drop_null_columns: true` (the
 * adapter default) shifts the offsets when a column comes back entirely null.
 */
const parseEsqlCountByCategory = (
  response: { columns: Array<{ name: string }>; values: Array<unknown[]> },
  countField: string
): Record<string, number> => {
  const colIdx = response.columns.findIndex((c) => c.name === countField);
  const catIdx = response.columns.findIndex((c) => c.name === 'category');
  if (colIdx === -1 || catIdx === -1) return {};

  const result: Record<string, number> = {};
  for (const row of response.values) {
    const category = row[catIdx] as string | null;
    const count = row[colIdx] as number | null;
    if (category) result[category] = count ?? 0;
  }
  return result;
};

/** Same by-name lookup as above. Rows with a negative or non-finite `idx` are dropped. */
const parseEsqlCountByIdxAndCategory = (
  response: { columns: Array<{ name: string }>; values: Array<unknown[]> },
  countField: string
): Record<number, Record<string, number>> => {
  const idxCol = response.columns.findIndex((c) => c.name === 'idx');
  const catCol = response.columns.findIndex((c) => c.name === 'category');
  const cntCol = response.columns.findIndex((c) => c.name === countField);
  if (idxCol === -1 || catCol === -1 || cntCol === -1) return {};

  const result: Record<number, Record<string, number>> = {};
  for (const row of response.values) {
    const rawIdx = row[idxCol] as number | null;
    const category = row[catCol] as string | null;
    const count = row[cntCol] as number | null;

    if (rawIdx === null || rawIdx === undefined || !Number.isFinite(rawIdx) || !category) continue;
    const idx = Math.floor(rawIdx);
    if (idx < 0) continue;

    if (!result[idx]) result[idx] = {};
    result[idx][category] = count ?? 0;
  }
  return result;
};
