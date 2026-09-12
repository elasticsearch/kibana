/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DocumentResponse } from '../../../common/types/api';
import type { Case } from '../../../common/types/domain';
import { SECURITY_SOLUTION_OWNER } from '../../../common/constants';
import { z } from '@kbn/zod/v4';
import { getAlertInfoFromComments, getEventInfoFromComments } from '../../common/utils';
import { UnifiedAttachmentTypeRegistry } from '../../attachment_framework/unified_attachment_registry';
import type { WorkflowAttachmentValidationContext } from '../../attachment_framework/types';
import {
  parseSelectedAlertPairs,
  parseSelectedDocumentPairs,
  validateOrigin as validateOriginWithAttachments,
} from './validate_origin';

const theCase = {
  id: 'case-1',
  owner: SECURITY_SOLUTION_OWNER,
  observables: [] as Array<{ id: string }>,
  comments: [] as unknown[],
} as unknown as Case;
const createInputValidator =
  (field: 'alertIds' | 'documents', missingMessage: string, mismatchMessage: string) =>
  ({ targets, inputs }: WorkflowAttachmentValidationContext): void => {
    const event = inputs.event as Record<string, unknown> | undefined;
    const pairs = event?.[field];
    const selectedIds = Array.isArray(pairs)
      ? pairs.map((pair) => (pair as { _id: string })._id)
      : [];
    if (selectedIds.length === 0) {
      throw new Error(missingMessage);
    }
    const targetIds = new Set(targets.map(({ id }) => id));
    const selectedIdSet = new Set(selectedIds);
    if (
      targetIds.size !== selectedIdSet.size ||
      [...targetIds].some((id) => !selectedIdSet.has(id))
    ) {
      throw new Error(mismatchMessage);
    }
  };
const attachmentTypeRegistry = new UnifiedAttachmentTypeRegistry();
attachmentTypeRegistry.register({
  id: 'security.alert',
  schema: z.any(),
  workflow: {
    validateTargets: createInputValidator(
      'alertIds',
      'Alert attachment workflow origins require selected alert inputs.',
      'Alert workflow origin targets must match the selected alerts.'
    ),
  },
});
attachmentTypeRegistry.register({
  id: 'security.event',
  schema: z.any(),
  workflow: {
    validateTargets: createInputValidator(
      'documents',
      'Event attachment workflow origins require selected document inputs.',
      'Event workflow origin targets must match the selected documents.'
    ),
  },
});
attachmentTypeRegistry.register({
  id: 'observability.alert',
  schema: z.any(),
  workflow: {
    validateTargets: createInputValidator(
      'alertIds',
      'Alert attachment workflow origins require selected alert inputs.',
      'Alert workflow origin targets must match the selected alerts.'
    ),
  },
});
attachmentTypeRegistry.register({ id: 'custom.disabled', schema: z.any() });

/**
 * Test wrapper: derives `attachedAlerts` and `attachedEvents` from the case comments
 * (mirroring the source used in production) and parses `inputs` through the same parsers
 * the service uses, so the validated sets are identical to what processing later uses.
 */
const validateOrigin = (
  params: Omit<
    Parameters<typeof validateOriginWithAttachments>[0],
    'alerts' | 'documents' | 'attachmentTypeRegistry'
  > & {
    inputs: Record<string, unknown>;
  }
): void => {
  const toDocumentResponse = (items: Array<{ id: string; index: string }>): DocumentResponse =>
    items.map(({ id, index }) => ({ id, index, attached_at: '2026-08-26T00:00:00.000Z' }));

  const attachedAlerts: DocumentResponse = toDocumentResponse(
    getAlertInfoFromComments(params.theCase.comments)
  );
  const attachedEvents: DocumentResponse = toDocumentResponse(
    getEventInfoFromComments(
      params.theCase.comments as Parameters<typeof getEventInfoFromComments>[0]
    )
  );
  const selectedAlerts = parseSelectedAlertPairs(params.inputs);
  const selectedDocuments = parseSelectedDocumentPairs(params.inputs);
  validateOriginWithAttachments({
    ...params,
    alerts: { selected: selectedAlerts, attached: attachedAlerts },
    documents: { selected: selectedDocuments, attached: attachedEvents },
    inputs: params.inputs,
    attachmentTypeRegistry,
  });
};

// ── cases.case origin ─────────────────────────────────────────────────────────

describe('cases.case origin', () => {
  it('passes when caseId matches and no alert inputs are present', () => {
    expect(() =>
      validateOrigin({
        origin: { type: 'cases.case', caseId: 'case-1' },
        inputs: {},
        theCase,
      })
    ).not.toThrow();
  });

  it('throws when caseId does not match the target case', () => {
    expect(() =>
      validateOrigin({
        origin: { type: 'cases.case', caseId: 'case-2' },
        inputs: {},
        theCase,
      })
    ).toThrow('Workflow origin caseId must match case id "case-1".');
  });

  it('throws when alertIds are present but not attached to the case', () => {
    // Ensures a cases.case origin cannot bypass the alert-membership check
    // and inject arbitrary alert documents into the workflow.
    const caseWithAlert = {
      ...theCase,
      comments: [{ type: 'alert', alertId: 'attached-alert', index: '.alerts' }],
    } as unknown as Case;

    expect(() =>
      validateOrigin({
        origin: { type: 'cases.case', caseId: 'case-1' },
        inputs: { event: { alertIds: [{ _id: 'unattached-alert', _index: '.alerts' }] } },
        theCase: caseWithAlert,
      })
    ).toThrow('All selected alerts must belong to the case.');
  });

  it('passes when all alertIds are attached', () => {
    const caseWithAlert = {
      ...theCase,
      comments: [{ type: 'alert', alertId: 'alert-1', index: '.alerts' }],
    } as unknown as Case;

    expect(() =>
      validateOrigin({
        origin: { type: 'cases.case', caseId: 'case-1' },
        inputs: { event: { alertIds: [{ _id: 'alert-1', _index: '.alerts' }] } },
        theCase: caseWithAlert,
      })
    ).not.toThrow();
  });
});

// ── cases.observable origin ───────────────────────────────────────────────────

describe('cases.observable origin', () => {
  const caseWithObs = {
    ...theCase,
    observables: [{ id: 'obs-1' }],
  } as unknown as Case;

  it('passes when observable belongs to the case and caseId matches', () => {
    expect(() =>
      validateOrigin({
        origin: { type: 'cases.observable', caseId: 'case-1', observableId: 'obs-1' },
        inputs: {},
        theCase: caseWithObs,
      })
    ).not.toThrow();
  });

  it('throws when caseId does not match', () => {
    expect(() =>
      validateOrigin({
        origin: { type: 'cases.observable', caseId: 'case-2', observableId: 'obs-1' },
        inputs: {},
        theCase: caseWithObs,
      })
    ).toThrow('Workflow origin caseId must match case id "case-1".');
  });

  it('throws when observable does not belong to the case', () => {
    expect(() =>
      validateOrigin({
        origin: { type: 'cases.observable', caseId: 'case-1', observableId: 'obs-99' },
        inputs: {},
        theCase: caseWithObs,
      })
    ).toThrow('Observable "obs-99" does not belong to case "case-1".');
  });

  it('throws when alertIds are present but not attached (alert bypass via observable origin)', () => {
    const caseWithBoth = {
      ...caseWithObs,
      comments: [{ type: 'alert', alertId: 'attached-alert', index: '.alerts' }],
    } as unknown as Case;

    expect(() =>
      validateOrigin({
        origin: { type: 'cases.observable', caseId: 'case-1', observableId: 'obs-1' },
        inputs: { event: { alertIds: [{ _id: 'unattached-alert', _index: '.alerts' }] } },
        theCase: caseWithBoth,
      })
    ).toThrow('All selected alerts must belong to the case.');
  });
});

// ── cases.attachment origin ───────────────────────────────────────────────────

describe('cases.attachment origin', () => {
  const caseWithAlerts = {
    ...theCase,
    comments: [
      { type: 'alert', alertId: 'alert-1', index: '.alerts' },
      { type: 'alert', alertId: 'alert-2', index: '.alerts' },
    ],
  } as unknown as Case;

  it('throws when caseId does not match', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-2',
          attachmentType: 'security.alert',
          attachmentId: 'alert-1',
        },
        inputs: { event: { alertIds: [{ _id: 'alert-1', _index: '.alerts' }] } },
        theCase: caseWithAlerts,
      })
    ).toThrow('Workflow origin caseId must match case id "case-1".');
  });

  it('throws when no alertIds are provided', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'alert-1',
        },
        inputs: {},
        theCase: caseWithAlerts,
      })
    ).toThrow('Alert attachment workflow origins require selected alert inputs.');
  });

  it('throws when a selected alert is not attached', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'alert-99',
        },
        inputs: { event: { alertIds: [{ _id: 'alert-99', _index: '.alerts' }] } },
        theCase: caseWithAlerts,
      })
    ).toThrow('Attachment target "alert-99" of type "security.alert" does not belong');
  });

  it('throws when alert id matches but index does not', () => {
    // Validates that (id, index) pairs are compared — not just ids.
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'alert-1',
        },
        inputs: { event: { alertIds: [{ _id: 'alert-1', _index: '.alerts-wrong-index' }] } },
        theCase: caseWithAlerts,
      })
    ).toThrow('All selected alerts must belong to the case.');
  });

  it('throws when the origin target is not among the selected alerts', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'alert-2',
        },
        inputs: { event: { alertIds: [{ _id: 'alert-1', _index: '.alerts' }] } },
        theCase: caseWithAlerts,
      })
    ).toThrow('Alert workflow origin targets must match the selected alerts.');
  });

  it('passes when the selected alert is attached and matches the origin alertId', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'alert-1',
        },
        inputs: { event: { alertIds: [{ _id: 'alert-1', _index: '.alerts' }] } },
        theCase: caseWithAlerts,
      })
    ).not.toThrow();
  });
});

// ── cases.attachments origin ──────────────────────────────────────────────────

describe('cases.attachments origin', () => {
  const caseWithAlerts = {
    ...theCase,
    comments: [
      { type: 'alert', alertId: 'alert-1', index: '.alerts' },
      { type: 'alert', alertId: 'alert-2', index: '.alerts' },
    ],
  } as unknown as Case;

  it('throws when caseId does not match', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachments',
          caseId: 'case-2',
          attachmentType: 'security.alert',
          attachmentIds: ['alert-1'],
        },
        inputs: {},
        theCase: caseWithAlerts,
      })
    ).toThrow('Workflow origin caseId must match case id "case-1".');
  });

  it('throws when no alertIds are provided', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachments',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentIds: ['alert-1'],
        },
        inputs: {},
        theCase: caseWithAlerts,
      })
    ).toThrow('Alert attachment workflow origins require selected alert inputs.');
  });

  it('passes when all selected alerts are attached', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachments',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentIds: ['alert-1', 'alert-2'],
        },
        inputs: {
          event: {
            alertIds: [
              { _id: 'alert-1', _index: '.alerts' },
              { _id: 'alert-2', _index: '.alerts' },
            ],
          },
        },
        theCase: caseWithAlerts,
      })
    ).not.toThrow();
  });

  it('rejects duplicate attachment targets', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachments',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentIds: ['alert-1', 'alert-1'],
        },
        inputs: {
          event: { alertIds: [{ _id: 'alert-1', _index: '.alerts' }] },
        },
        theCase: caseWithAlerts,
      })
    ).toThrow('Attachment ids must not contain duplicates');
  });

  it('rejects an unregistered attachment type', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'custom.unknown',
          attachmentId: 'target-1',
        },
        inputs: {},
        theCase,
      })
    ).toThrow('Attachment type "custom.unknown" is not registered.');
  });

  it('rejects a registered attachment type that did not opt into workflows', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'custom.disabled',
          attachmentId: 'target-1',
        },
        inputs: {},
        theCase,
      })
    ).toThrow('Attachment type "custom.disabled" does not support workflow origins.');
  });
});

// ── unified (v2) alert attachment shape ───────────────────────────────────────

describe('unified v2 alert attachment', () => {
  // The unified observability alert type string as defined by the Cases constants.
  const OBSERVABILITY_ALERT_TYPE = 'observability.alert';

  it('matches alerts using attachmentId and metadata.index', () => {
    const caseWithUnifiedAlert = {
      ...theCase,
      comments: [
        {
          type: OBSERVABILITY_ALERT_TYPE,
          attachmentId: 'alert-unified-1',
          metadata: { index: '.alerts-observability' },
        },
      ],
    } as unknown as Case;

    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: OBSERVABILITY_ALERT_TYPE,
          attachmentId: 'alert-unified-1',
        },
        inputs: {
          event: { alertIds: [{ _id: 'alert-unified-1', _index: '.alerts-observability' }] },
        },
        theCase: caseWithUnifiedAlert,
      })
    ).not.toThrow();
  });

  it('throws when the unified alert index does not match', () => {
    const caseWithUnifiedAlert = {
      ...theCase,
      comments: [
        {
          type: OBSERVABILITY_ALERT_TYPE,
          attachmentId: 'alert-unified-1',
          metadata: { index: '.alerts-observability' },
        },
      ],
    } as unknown as Case;

    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: OBSERVABILITY_ALERT_TYPE,
          attachmentId: 'alert-unified-1',
        },
        inputs: {
          event: { alertIds: [{ _id: 'alert-unified-1', _index: '.alerts-wrong' }] },
        },
        theCase: caseWithUnifiedAlert,
      })
    ).toThrow('All selected alerts must belong to the case.');
  });
});

// ── parseSelectedAlertPairs input validation ──────────────────────────────────

describe('parseSelectedAlertPairs', () => {
  it('returns empty array when inputs.event.alertIds is absent', () => {
    expect(parseSelectedAlertPairs({})).toEqual([]);
    expect(parseSelectedAlertPairs({ event: {} })).toEqual([]);
    expect(parseSelectedAlertPairs({ event: { alertIds: null } })).toEqual([]);
    expect(parseSelectedAlertPairs({ event: { alertIds: undefined } })).toEqual([]);
  });

  it('throws 400 when alertIds is not an array', () => {
    expect(() => parseSelectedAlertPairs({ event: { alertIds: 'alert-1' } })).toThrow(
      'inputs.event.alertIds must be an array.'
    );
    expect(() => parseSelectedAlertPairs({ event: { alertIds: 42 } })).toThrow(
      'inputs.event.alertIds must be an array.'
    );
  });

  it('throws 400 when an entry has a non-string _id', () => {
    expect(() =>
      parseSelectedAlertPairs({ event: { alertIds: [{ _id: 4242, _index: '.alerts' }] } })
    ).toThrow(
      'Every inputs.event.alertIds entry must be an object with string "_id" and "_index" properties.'
    );
  });

  it('throws 400 when an entry has a non-string _index', () => {
    expect(() =>
      parseSelectedAlertPairs({ event: { alertIds: [{ _id: 'alert-1', _index: 99 }] } })
    ).toThrow(
      'Every inputs.event.alertIds entry must be an object with string "_id" and "_index" properties.'
    );
  });

  it('throws 400 when an entry is not an object', () => {
    expect(() => parseSelectedAlertPairs({ event: { alertIds: ['alert-1'] } })).toThrow(
      'Every inputs.event.alertIds entry must be an object with string "_id" and "_index" properties.'
    );
  });

  it(`throws 400 when alertIds exceeds MAX_ALERTS_PER_CASE entries`, () => {
    const oversized = Array.from({ length: 1001 }, (_, i) => ({
      _id: `alert-${i}`,
      _index: '.alerts',
    }));
    expect(() => parseSelectedAlertPairs({ event: { alertIds: oversized } })).toThrow(
      /cannot contain more than/
    );
  });

  it('returns the correct pairs for a valid array', () => {
    expect(
      parseSelectedAlertPairs({
        event: {
          alertIds: [
            { _id: 'alert-1', _index: '.alerts-a' },
            { _id: 'alert-2', _index: '.alerts-b' },
          ],
        },
      })
    ).toEqual([
      { _id: 'alert-1', _index: '.alerts-a' },
      { _id: 'alert-2', _index: '.alerts-b' },
    ]);
  });
});

// ── cases.observables origin ──────────────────────────────────────────────────

describe('cases.observables origin', () => {
  const caseWithObs = {
    ...theCase,
    observables: [
      { id: 'obs-1', typeKey: 'ip', value: '1.2.3.4', description: null },
      { id: 'obs-2', typeKey: 'url', value: 'https://example.com', description: null },
    ],
  } as unknown as Case;

  it('passes when all observableIds belong to the case', () => {
    expect(() =>
      validateOrigin({
        origin: { type: 'cases.observables', caseId: 'case-1', observableIds: ['obs-1', 'obs-2'] },
        inputs: {},
        theCase: caseWithObs,
      })
    ).not.toThrow();
  });

  it('passes for a single observableId', () => {
    expect(() =>
      validateOrigin({
        origin: { type: 'cases.observables', caseId: 'case-1', observableIds: ['obs-1'] },
        inputs: {},
        theCase: caseWithObs,
      })
    ).not.toThrow();
  });

  it('throws when an observableId does not belong to the case', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.observables',
          caseId: 'case-1',
          observableIds: ['obs-1', 'unknown-id'],
        },
        inputs: {},
        theCase: caseWithObs,
      })
    ).toThrow('Observable "unknown-id" does not belong to case "case-1".');
  });

  it('throws when observableIds contains duplicates', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.observables',
          caseId: 'case-1',
          observableIds: ['obs-1', 'obs-1'],
        },
        inputs: {},
        theCase: caseWithObs,
      })
    ).toThrow('observableIds must not contain duplicates');
  });

  it('throws when origin caseId does not match the target case', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.observables',
          caseId: 'case-other',
          observableIds: ['obs-1'],
        },
        inputs: {},
        theCase: caseWithObs,
      })
    ).toThrow('Workflow origin caseId must match case id "case-1".');
  });
});

// ── event attachment origin ───────────────────────────────────────────────────

describe('event attachment origin', () => {
  const caseWithEvent = {
    ...theCase,
    comments: [{ type: 'event', eventId: 'event-1', index: '.ds-logs-default' }],
  } as unknown as Case;

  it('passes when the event is attached and selected', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.event',
          attachmentId: 'event-1',
        },
        inputs: { event: { documents: [{ _id: 'event-1', _index: '.ds-logs-default' }] } },
        theCase: caseWithEvent,
      })
    ).not.toThrow();
  });

  it('throws when the selected document is not attached to the case', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.event',
          attachmentId: 'unattached-event',
        },
        inputs: { event: { documents: [{ _id: 'unattached-event', _index: '.ds-logs-default' }] } },
        theCase: caseWithEvent,
      })
    ).toThrow('Attachment target "unattached-event" of type "security.event" does not belong');
  });

  it('throws when the origin eventId is not among the selected documents', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.event',
          attachmentId: 'event-other',
        },
        // event-1 is attached, but event-other is the origin
        inputs: { event: { documents: [{ _id: 'event-1', _index: '.ds-logs-default' }] } },
        theCase: caseWithEvent,
      })
    ).toThrow('Attachment target "event-other" of type "security.event" does not belong');
  });

  it('throws when no documents are present', () => {
    expect(() =>
      validateOrigin({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.event',
          attachmentId: 'event-1',
        },
        inputs: {},
        theCase: caseWithEvent,
      })
    ).toThrow('Event attachment workflow origins require selected document inputs.');
  });

  it('throws when documents are present under a cases.case origin but not attached (document-membership check is origin-agnostic)', () => {
    // Ensures a cases.case origin cannot bypass the document-membership check.
    expect(() =>
      validateOrigin({
        origin: { type: 'cases.case', caseId: 'case-1' },
        inputs: { event: { documents: [{ _id: 'unattached', _index: '.ds-logs-default' }] } },
        theCase: caseWithEvent,
      })
    ).toThrow('All selected documents must belong to the case.');
  });

  it('passes when documents are present under a cases.case origin and attached', () => {
    expect(() =>
      validateOrigin({
        origin: { type: 'cases.case', caseId: 'case-1' },
        inputs: { event: { documents: [{ _id: 'event-1', _index: '.ds-logs-default' }] } },
        theCase: caseWithEvent,
      })
    ).not.toThrow();
  });
});

// ── parseSelectedDocumentPairs input validation ───────────────────────────────

describe('parseSelectedDocumentPairs', () => {
  it('returns empty array when documents is absent or null', () => {
    expect(parseSelectedDocumentPairs({})).toEqual([]);
    expect(parseSelectedDocumentPairs({ event: {} })).toEqual([]);
    expect(parseSelectedDocumentPairs({ event: { documents: null } })).toEqual([]);
    expect(parseSelectedDocumentPairs({ event: { documents: undefined } })).toEqual([]);
  });

  it('throws when documents is not an array', () => {
    expect(() => parseSelectedDocumentPairs({ event: { documents: 'event-1' } })).toThrow(
      'inputs.event.documents must be an array.'
    );
  });

  it('throws when an entry is missing _id or _index', () => {
    expect(() =>
      parseSelectedDocumentPairs({ event: { documents: [{ _id: 4242, _index: '.idx' }] } })
    ).toThrow('string "_id"');
    expect(() =>
      parseSelectedDocumentPairs({ event: { documents: [{ _id: 'event-1', _index: 99 }] } })
    ).toThrow('string "_id"');
    expect(() => parseSelectedDocumentPairs({ event: { documents: ['event-1'] } })).toThrow(
      'string "_id"'
    );
  });

  it('throws when the array exceeds the cap', () => {
    const oversized = Array.from({ length: 1001 }, (_, i) => ({
      _id: `e${i}`,
      _index: `.idx`,
    }));
    expect(() => parseSelectedDocumentPairs({ event: { documents: oversized } })).toThrow(
      /cannot contain more than/
    );
  });

  it('returns the correct pairs for a valid array', () => {
    expect(
      parseSelectedDocumentPairs({
        event: {
          documents: [
            { _id: 'event-1', _index: '.ds-logs-a' },
            { _id: 'event-2', _index: '.ds-logs-b' },
          ],
        },
      })
    ).toEqual([
      { _id: 'event-1', _index: '.ds-logs-a' },
      { _id: 'event-2', _index: '.ds-logs-b' },
    ]);
  });
});

// ── getDefaultTargets — positional index pairing (A1) ────────────────────────

// Register security.alert with workflow: {} (no validateTargets) to exercise the default
// alignment path. The same alert-comment fixtures used by other describe blocks work here.
const workflowOnlyRegistry = new UnifiedAttachmentTypeRegistry();
workflowOnlyRegistry.register({ id: 'security.alert', schema: z.any(), workflow: {} });

describe('getDefaultTargets — positional index alignment', () => {
  it('keeps each id paired with its own index in a 1-to-1 aligned array', () => {
    const caseWithAlert = {
      ...theCase,
      comments: [
        {
          type: 'alert',
          alertId: ['a1', 'a2', 'a3'],
          index: ['idx1', 'idx2', 'idx3'],
          id: 'so-1',
          owner: SECURITY_SOLUTION_OWNER,
        },
      ],
    } as unknown as Case;

    // a1→idx1, a2→idx2, a3→idx3. The origin targets a2.
    expect(() =>
      validateOriginWithAttachments({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'a2',
        },
        theCase: caseWithAlert,
        inputs: { event: { alertIds: [{ _id: 'a2', _index: 'idx2' }] } },
        attachmentTypeRegistry,
        alerts: {
          selected: [{ _id: 'a2', _index: 'idx2' }],
          attached: [{ id: 'a2', index: 'idx2', attached_at: '' }],
        },
        documents: { selected: [], attached: [] },
      })
    ).not.toThrow();
  });

  it('drops the whole attachment when the index count does not match the id count', () => {
    // alertId=3 ids, index=['idx2','idx3'] (2 elements after toAlertMetadata filters empty strings).
    // 3 ids vs 2 indices → ambiguous pairing → attachment dropped → origin target not found.
    const caseWithAlert = {
      ...theCase,
      comments: [
        {
          type: 'alert',
          alertId: ['a1', 'a2', 'a3'],
          index: ['', 'idx2', 'idx3'],
          id: 'so-1',
          owner: SECURITY_SOLUTION_OWNER,
        },
      ],
    } as unknown as Case;

    expect(() =>
      validateOriginWithAttachments({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'a2',
        },
        theCase: caseWithAlert,
        inputs: { event: { alertIds: [{ _id: 'a2', _index: 'idx2' }] } },
        attachmentTypeRegistry,
        alerts: {
          selected: [{ _id: 'a2', _index: 'idx2' }],
          attached: [{ id: 'a2', index: 'idx2', attached_at: '' }],
        },
        documents: { selected: [], attached: [] },
      })
    ).toThrow(/does not belong to case/);
  });
});

// ── resolveAttachmentOrigin — malformed sibling skipped (A2) ─────────────────

describe('resolveAttachmentOrigin — malformed sibling attachment is skipped', () => {
  it('resolves a valid attachment origin even when the case holds a malformed sibling comment', () => {
    const caseWithMixed = {
      ...theCase,
      comments: [
        // Malformed: alertId and index arrays have different lengths.
        {
          type: 'alert',
          alertId: ['a1', 'a2'],
          index: ['i1'],
          id: 'so-bad',
          owner: SECURITY_SOLUTION_OWNER,
        },
        // Valid: a single well-formed alert.
        {
          type: 'alert',
          alertId: 'a9',
          index: '.idx',
          id: 'so-good',
          owner: SECURITY_SOLUTION_OWNER,
        },
      ],
    } as unknown as Case;

    // The origin targets the valid attachment; the malformed one must not prevent resolution.
    expect(() =>
      validateOriginWithAttachments({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'a9',
        },
        theCase: caseWithMixed,
        inputs: { event: { alertIds: [{ _id: 'a9', _index: '.idx' }] } },
        attachmentTypeRegistry,
        alerts: {
          selected: [{ _id: 'a9', _index: '.idx' }],
          attached: [{ id: 'a9', index: '.idx', attached_at: '' }],
        },
        documents: { selected: [], attached: [] },
      })
    ).not.toThrow();
  });
});

// ── targetsById — duplicate _id under different indices (A3) ─────────────────

describe('targetsById — same _id under multiple indices', () => {
  it('does not throw when the same attachment id resolves with one defined index and one undefined index', () => {
    // A target appearing as both { id, index } and { id } (no index) — e.g. from a
    // getDefaultTargets call where one positional slot had no index — should not be rejected.
    // Only two *distinct defined* indices are genuinely ambiguous.
    const caseWithRepeatedId = {
      ...theCase,
      comments: [
        // alertId 'a1' appears in two positions with the same raw index array, so one entry
        // gets the defined index and the other (positional fallback) gets no index.
        {
          type: 'alert',
          alertId: ['a1', 'a1'],
          index: ['idx-a'],
          id: 'so-1',
          owner: SECURITY_SOLUTION_OWNER,
        },
      ],
    } as unknown as Case;

    // After toAlertMetadata filtering: metadata.index = ['idx-a']. getDefaultTargets with
    // ids=['a1','a1'] and rawIndices=['idx-a'] → mismatch (2 vs 1) → whole attachment dropped.
    // So targeting 'a1' throws "does not belong to case", NOT "multiple indices".
    expect(() =>
      validateOriginWithAttachments({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'a1',
        },
        theCase: caseWithRepeatedId,
        inputs: { event: { alertIds: [{ _id: 'a1', _index: 'idx-a' }] } },
        attachmentTypeRegistry,
        alerts: {
          selected: [{ _id: 'a1', _index: 'idx-a' }],
          attached: [{ id: 'a1', index: 'idx-a', attached_at: '' }],
        },
        documents: { selected: [], attached: [] },
      })
    ).toThrow(/does not belong to case/);
  });

  it('throws when the same attachment id is attached under two different indices', () => {
    const caseWithDuplicateId = {
      ...theCase,
      comments: [
        {
          type: 'alert',
          alertId: 'a1',
          index: 'idx-a',
          id: 'so-1',
          owner: SECURITY_SOLUTION_OWNER,
        },
        {
          type: 'alert',
          alertId: 'a1',
          index: 'idx-b',
          id: 'so-2',
          owner: SECURITY_SOLUTION_OWNER,
        },
      ],
    } as unknown as Case;

    expect(() =>
      validateOriginWithAttachments({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'a1',
        },
        theCase: caseWithDuplicateId,
        inputs: { event: { alertIds: [{ _id: 'a1', _index: 'idx-a' }] } },
        attachmentTypeRegistry,
        alerts: {
          selected: [{ _id: 'a1', _index: 'idx-a' }],
          attached: [{ id: 'a1', index: 'idx-a', attached_at: '' }],
        },
        documents: { selected: [], attached: [] },
      })
    ).toThrow(/multiple indices/);
  });
});

// ── default alignment — workflow: {} (no validateTargets) (A4) ────────────────

describe('default alignment for types registered with workflow: {}', () => {
  // Use a standard alert comment so `resolveAttachmentOrigin` maps it to `security.alert`,
  // which is the only type registered in `workflowOnlyRegistry`.
  const caseWithAlert = {
    ...theCase,
    comments: [{ type: 'alert', alertId: 'so-v1', index: '.alerts-idx' }],
  } as unknown as Case;

  it('throws when no alert or document inputs are provided (empty selection)', () => {
    expect(() =>
      validateOriginWithAttachments({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'so-v1',
        },
        // so-v1 is attached to the case (membership passes) but no alerts are selected.
        theCase: caseWithAlert,
        inputs: {},
        attachmentTypeRegistry: workflowOnlyRegistry,
        alerts: {
          selected: [],
          attached: [{ id: 'so-v1', index: '.alerts-idx', attached_at: '' }],
        },
        documents: { selected: [], attached: [] },
      })
    ).toThrow('Attachment workflow origins require selected alert or document inputs.');
  });

  it('throws when the origin target is not in the selected alerts', () => {
    expect(() =>
      validateOriginWithAttachments({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'so-v1',
        },
        // Selection references a different alert — disjoint from the origin target `so-v1`.
        theCase: caseWithAlert,
        inputs: { event: { alertIds: [{ _id: 'other-id', _index: 'idx' }] } },
        attachmentTypeRegistry: workflowOnlyRegistry,
        alerts: {
          selected: [{ _id: 'other-id', _index: 'idx' }],
          attached: [
            { id: 'so-v1', index: '.alerts-idx', attached_at: '' },
            { id: 'other-id', index: 'idx', attached_at: '' },
          ],
        },
        documents: { selected: [], attached: [] },
      })
    ).toThrow('Attachment workflow origin "so-v1" is not selected.');
  });

  it('passes when the origin target is in the selected documents even when alertIds are also present', () => {
    // The selection union is alertIds ∪ documents. A document-backed origin target must not be
    // rejected just because the caller also supplied alertIds (the old exclusive-or logic rejected
    // the document target whenever selectedAlerts was non-empty).
    const caseWithEvent = {
      ...theCase,
      comments: [
        { type: 'alert', alertId: 'alert-1', index: '.alerts-idx' },
        { type: 'alert', alertId: 'doc-1', index: '.docs-idx' },
      ],
    } as unknown as Case;

    expect(() =>
      validateOriginWithAttachments({
        origin: {
          type: 'cases.attachment',
          caseId: 'case-1',
          attachmentType: 'security.alert',
          attachmentId: 'doc-1',
        },
        theCase: caseWithEvent,
        inputs: {
          event: {
            alertIds: [{ _id: 'alert-1', _index: '.alerts-idx' }],
            documents: [{ _id: 'doc-1', _index: '.docs-idx' }],
          },
        },
        attachmentTypeRegistry: workflowOnlyRegistry,
        alerts: {
          selected: [{ _id: 'alert-1', _index: '.alerts-idx' }],
          attached: [{ id: 'alert-1', index: '.alerts-idx', attached_at: '' }],
        },
        documents: {
          selected: [{ _id: 'doc-1', _index: '.docs-idx' }],
          attached: [{ id: 'doc-1', index: '.docs-idx', attached_at: '' }],
        },
      })
    ).not.toThrow();
  });
});
