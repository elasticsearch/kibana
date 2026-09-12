/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { isPlainObject } from 'lodash';
import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { AuditLogger, SecurityPluginSetup } from '@kbn/security-plugin/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { toWorkflowExecutionEngineModel } from '@kbn/workflows';
import {
  ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
  ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
  CASE_SAVED_OBJECT,
  CASES_WORKFLOW_EXECUTION_METADATA_SCHEMA_VERSION,
  CASES_WORKFLOW_EXECUTION_SOURCE,
  OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLES_WORKFLOW_ORIGIN_TYPE,
} from '../../../common/constants';
import { CasesWorkflowExecutionMetadataSchema } from '../../../common/types/api/workflow/v1';
import type { RunCaseWorkflowRequest, RunCaseWorkflowResponse } from '../../../common/types/api';
import { AttachmentType } from '../../../common/types/domain';
import type { CasesClient } from '../../client';
import type { CasesWorkflowOperations } from '../../client/workflows/operations';
import type { CasesRequestHandlerContext } from '../../types';
import type { UnifiedAttachmentTypeRegistry } from '../../attachment_framework/unified_attachment_registry';
import { buildActivityOrigin } from './build_activity_origin';
import type { ResolvedWorkflowAttachmentOrigin } from './validate_origin';
import {
  parseSelectedAlertPairs,
  parseSelectedDocumentPairs,
  validateOrigin,
} from './validate_origin';

/**
 * Resolves observable IDs and type keys from the case for observable-scoped origins.
 *
 * Observable values and descriptions are deliberately omitted so that users without Cases read
 * access cannot observe case data through the persisted workflow execution. To read current values,
 * use a `cases.getCase` step after the workflow runs. This holds the same invariant as the
 * `cases.observablesAdded` trigger event schema (PR #288224) and `cases.extendedFieldsUpdated`.
 *
 * The explicit return type rejects any extra field at the construction site via TypeScript's
 * excess-property check, so a future spread of a full Observable object is caught at compile time.
 *
 * `validateOrigin` has already confirmed every requested observable ID belongs to the case and is
 * free of duplicates, so we map in request order without a defensive fallback.
 *
 * Both origin variants produce index-aligned arrays — `cases.observable` yields one-element
 * arrays so the shape is uniform for workflow templating (`{{ event.observableIds }}`).
 */
const resolveObservableEventFields = (
  origin: RunCaseWorkflowRequest['origin'],
  theCase: Awaited<ReturnType<CasesClient['cases']['get']>> | undefined
): { observableIds: string[]; observableTypeKeys: string[] } | undefined => {
  if (!origin || !theCase) return undefined;

  if (origin.type === OBSERVABLE_WORKFLOW_ORIGIN_TYPE) {
    const obs = theCase.observables.find(({ id }) => id === origin.observableId);
    if (!obs) return undefined;
    return { observableIds: [obs.id], observableTypeKeys: [obs.typeKey] };
  }

  if (origin.type === OBSERVABLES_WORKFLOW_ORIGIN_TYPE) {
    const byId = new Map(theCase.observables.map((o) => [o.id, o]));
    const observableIds: string[] = [];
    const observableTypeKeys: string[] = [];
    for (const id of origin.observableIds) {
      const obs = byId.get(id);
      if (obs) {
        observableIds.push(obs.id);
        observableTypeKeys.push(obs.typeKey);
      }
    }
    return observableIds.length > 0 ? { observableIds, observableTypeKeys } : undefined;
  }

  return undefined;
};

interface RunWorkflowParams {
  workflowId: string;
  body: RunCaseWorkflowRequest;
  request: KibanaRequest;
  context: CasesRequestHandlerContext;
  casesClient: CasesClient;
  workflowOperations: CasesWorkflowOperations;
  spaceId: string;
}

interface CasesWorkflowRunServiceDeps {
  management: WorkflowsServerPluginSetup['management'];
  logger: Logger;
  audit: SecurityPluginSetup['audit'];
  attachmentTypeRegistry: UnifiedAttachmentTypeRegistry;
}

export class CasesWorkflowRunService {
  private readonly management: WorkflowsServerPluginSetup['management'];
  private readonly logger: Logger;
  private readonly audit: SecurityPluginSetup['audit'];
  private readonly attachmentTypeRegistry: UnifiedAttachmentTypeRegistry;

  constructor({ management, logger, audit, attachmentTypeRegistry }: CasesWorkflowRunServiceDeps) {
    this.management = management;
    this.logger = logger;
    this.audit = audit;
    this.attachmentTypeRegistry = attachmentTypeRegistry;
  }

  public async run({
    workflowId,
    body,
    request,
    context,
    casesClient,
    workflowOperations,
    spaceId,
  }: RunWorkflowParams): Promise<RunCaseWorkflowResponse> {
    const { caseIds } = body;
    const auditLogger = this.audit.asScoped(request);

    try {
      return await this.runWorkflow({
        workflowId,
        body,
        request,
        context,
        casesClient,
        workflowOperations,
        spaceId,
        auditLogger,
      });
    } catch (error) {
      this.logWorkflowRunAuditEvents({
        auditLogger,
        caseIds,
        workflowId,
        outcome: 'failure',
        error,
      });
      throw error;
    }
  }

  private async runWorkflow({
    workflowId,
    body,
    request,
    context,
    casesClient,
    workflowOperations,
    spaceId,
    auditLogger,
  }: RunWorkflowParams & { auditLogger: AuditLogger }): Promise<RunCaseWorkflowResponse> {
    if (!this.management.isWorkflowsAvailable) {
      throw Boom.forbidden('Workflows are not available.');
    }

    const { license } = await context.licensing;
    if (!license.isAvailable || !license.isActive || !license.hasAtLeast('enterprise')) {
      throw Boom.forbidden('Workflows require an active Enterprise license.');
    }

    const { caseIds } = body;

    // All-or-nothing: throws 403 if the caller lacks cases:<owner>/updateCase on any case.
    // Authorizes before reporting not-found errors so an unauthorized caller cannot learn
    // which IDs exist. One privilege round-trip for all owners via ensureAuthorized.
    // Returns entities so subsequent steps can reuse them without re-fetching the cases.
    const authorizedEntities = await workflowOperations.ensureAuthorizedToRunWorkflow({
      ids: caseIds,
    });

    // `origin` is optional. When absent the run is a list-surface (bulk) run: the caller
    // was not looking at any specific sub-entity, alert/document inputs are not permitted,
    // and no case fetch is needed. When present the run is scoped to a single case with a
    // specific sub-entity context; origin-entity membership and attachment are validated.
    // Parse and validate input shapes eagerly — any malformed entry throws 400 here,
    // before any case fetch, so the validated sets equal what processing later uses.
    const selectedAlerts = parseSelectedAlertPairs(body.inputs);
    const selectedDocuments = parseSelectedDocumentPairs(body.inputs);
    let theCase: Awaited<ReturnType<typeof casesClient.cases.get>> | undefined;
    let resolvedAttachmentOrigin: ResolvedWorkflowAttachmentOrigin | undefined;
    // Observable inputs (observableIds / observableTypeKeys) are server-owned and stripped before
    // the run. Unlike alert inputs, they are not re-injected for non-observable origins, so a
    // caller who supplies them would get an empty value silently. Reject eagerly so the contract is
    // explicit, whether or not an origin is provided.
    const observableInputKeys = new Set(['observableIds', 'observableTypeKeys']);
    const rawEventForObservableCheck = isPlainObject(body.inputs.event)
      ? (body.inputs.event as Record<string, unknown>)
      : {};
    const hasObservableInputs = Object.keys(rawEventForObservableCheck).some((k) =>
      observableInputKeys.has(k)
    );
    if (
      hasObservableInputs &&
      body.origin?.type !== OBSERVABLE_WORKFLOW_ORIGIN_TYPE &&
      body.origin?.type !== OBSERVABLES_WORKFLOW_ORIGIN_TYPE
    ) {
      throw Boom.badRequest('Observable inputs can only be used with observable origins.');
    }

    if (body.origin === undefined) {
      if (selectedAlerts.length > 0) {
        throw Boom.badRequest('Alert inputs can only be used with a single case.');
      }
      if (selectedDocuments.length > 0) {
        throw Boom.badRequest('Document inputs can only be used with a single case.');
      }
    } else {
      if (caseIds.length > 1) {
        throw Boom.badRequest(
          `Workflow origin type "${body.origin.type}" can only be used with a single case.`
        );
      }
      // Only attachment origins consume `theCase.comments`; fetching them for every other
      // origin type would load all case attachments from ES (up to MAX_DOCS_PER_PAGE) and
      // io-ts-decode the full case, only to discard the result immediately.
      const needsComments =
        body.origin.type === ATTACHMENT_WORKFLOW_ORIGIN_TYPE ||
        body.origin.type === ATTACHMENTS_WORKFLOW_ORIGIN_TYPE;
      theCase = await casesClient.cases.get({ id: caseIds[0], includeComments: needsComments });
      // Fetch alert and event attachments in parallel, each only when their inputs are present.
      // Separate fetches (instead of a combined [alert, event] call) prevent cross-type false matches
      // — an event attachment should never satisfy an alert membership check, and vice versa.
      const [attachedAlerts, attachedEvents] = await Promise.all([
        selectedAlerts.length > 0
          ? casesClient.attachments.getAllDocumentsAttachedToCase({
              caseId: caseIds[0],
              attachmentTypes: [AttachmentType.alert],
            })
          : Promise.resolve([]),
        selectedDocuments.length > 0
          ? casesClient.attachments.getAllDocumentsAttachedToCase({
              caseId: caseIds[0],
              attachmentTypes: [AttachmentType.event],
            })
          : Promise.resolve([]),
      ]);
      resolvedAttachmentOrigin = validateOrigin({
        origin: body.origin,
        theCase,
        inputs: body.inputs,
        attachmentTypeRegistry: this.attachmentTypeRegistry,
        alerts: { selected: selectedAlerts, attached: attachedAlerts },
        documents: { selected: selectedDocuments, attached: attachedEvents },
      });
    }

    // Fail fast before anything irreversible: check the per-case user-action limit for all cases.
    await workflowOperations.preflightWorkflowExecution({ caseIds });

    const workflow = await this.management.getWorkflow(workflowId, spaceId);
    if (!workflow) {
      throw Boom.notFound(`Workflow "${workflowId}" was not found.`);
    }
    if (!workflow.valid) {
      throw Boom.badRequest('Workflow is not valid.');
    }
    if (!workflow.enabled) {
      throw Boom.badRequest('Workflow is disabled. Enable it to run it.');
    }

    // Strip client-supplied values for server-owned event keys so callers cannot
    // pre-seed them. The server re-injects the authoritative values via eventOverrides
    // after alert preprocessing runs (which replaces the whole `event` object).
    // Keep this set in sync with the keys injected in eventOverrides below.
    const SERVER_OWNED_EVENT_KEYS = new Set(['caseIds', 'observableIds', 'observableTypeKeys']);
    const { event: rawEvent, ...otherInputs } = body.inputs;
    const strippedEvent = isPlainObject(rawEvent)
      ? Object.fromEntries(
          Object.entries(rawEvent as Record<string, unknown>).filter(
            ([k]) => !SERVER_OWNED_EVENT_KEYS.has(k)
          )
        )
      : rawEvent;
    const sanitizedInputs =
      strippedEvent !== undefined ? { ...otherInputs, event: strippedEvent } : otherInputs;

    // Resolve observable IDs and type keys from the already-fetched case for observable-scoped
    // origins. Values and descriptions are deliberately excluded — see resolveObservableEventFields.
    // Enrichment is always derived from the case object (not from client inputs) so a
    // case-authorized caller cannot inject arbitrary observable data into the workflow.
    const resolvedObservableEventFields = resolveObservableEventFields(body.origin, theCase);

    const metadata = CasesWorkflowExecutionMetadataSchema.parse({
      schemaVersion: CASES_WORKFLOW_EXECUTION_METADATA_SCHEMA_VERSION,
      source: CASES_WORKFLOW_EXECUTION_SOURCE,
      caseIds,
      origin: body.origin,
    });

    // Use runWorkflow instead of executeWorkflow so the call returns as soon as the execution
    // is scheduled (truly fire-and-forget). executeWorkflow always waits ≥1 s for the execution
    // document to appear even when waitForCompletion=false, which adds measurable latency to
    // every interactive "run workflow from a case" click.
    //
    // eventOverrides injects the server-owned caseIds into `event` *after* alert preprocessing
    // runs. preprocessAlertInputs replaces the whole `event` object with the alert-event shape,
    // so pre-merging caseIds into event (before the call) would silently drop them on alert runs.
    const { workflowExecutionId } = await this.management.runWorkflowWithAlertPreprocessing({
      workflow: toWorkflowExecutionEngineModel(workflow),
      spaceId,
      inputs: sanitizedInputs,
      request,
      preprocessingContext: context,
      metadata,
      eventOverrides: {
        caseIds,
        ...(resolvedObservableEventFields !== undefined ? resolvedObservableEventFields : {}),
      },
    });

    // One audit event per case keeps the audit trail queryable by individual case ID.
    this.logWorkflowRunAuditEvents({
      auditLogger,
      caseIds,
      workflowId,
      workflowExecutionId,
      outcome: 'success',
    });

    // Record the case activity immediately after the execution starts.
    // A failure to record must NOT be reported as an execution failure — the run did succeed.
    try {
      await workflowOperations.recordWorkflowExecution({
        entities: authorizedEntities,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          executionId: workflowExecutionId,
        },
        origin: buildActivityOrigin({
          origin: body.origin,
          theCase,
          resolvedAttachmentOrigin,
        }),
      });
      return { workflowExecutionId, activityStatus: 'succeeded' };
    } catch (error) {
      this.logger.error(
        `Workflow "${workflowId}" execution "${workflowExecutionId}" started but its case activity could not be recorded: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      for (const caseId of caseIds) {
        this.logAuditEvent(auditLogger, {
          message: `Failed to record workflow [${workflowId}] execution [${workflowExecutionId}] in case [${caseId}] activity`,
          event: {
            action: 'case_workflow_activity_create',
            category: ['database'],
            type: ['creation'],
            outcome: 'failure',
          },
          error: { message: error instanceof Error ? error.message : String(error) },
          kibana: { saved_object: { type: CASE_SAVED_OBJECT, id: caseId } },
        });
      }
      return { workflowExecutionId, activityStatus: 'failed' };
    }
  }

  private logWorkflowRunAuditEvents({
    auditLogger,
    caseIds,
    workflowId,
    workflowExecutionId,
    outcome,
    error,
  }: {
    auditLogger: AuditLogger;
    caseIds: string[];
    workflowId: string;
    workflowExecutionId?: string;
    outcome: 'success' | 'failure';
    error?: unknown;
  }): void {
    const executionDetail = workflowExecutionId
      ? ` with execution ID [${workflowExecutionId}]`
      : '';
    for (const caseId of caseIds) {
      this.logAuditEvent(auditLogger, {
        message: `User ${
          outcome === 'success' ? 'started' : 'failed to start'
        } workflow [${workflowId}] from case [${caseId}]${executionDetail}`,
        event: {
          action: 'case_workflow_run',
          category: ['database'],
          type: ['creation'],
          outcome,
        },
        ...(error
          ? {
              error: {
                message: error instanceof Error ? error.message : String(error),
              },
            }
          : {}),
        kibana: {
          saved_object: {
            type: CASE_SAVED_OBJECT,
            id: caseId,
          },
        },
      });
    }
  }

  private logAuditEvent(auditLogger: AuditLogger, event: Parameters<AuditLogger['log']>[0]): void {
    try {
      auditLogger.log(event);
    } catch (error) {
      this.logger.debug(
        `Failed to write Cases workflow audit event: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
