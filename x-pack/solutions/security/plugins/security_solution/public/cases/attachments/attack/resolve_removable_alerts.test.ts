/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AttachmentType,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_ATTACK_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common';
import type { CaseAttachment } from './utils';
import type { CaseAlertAttachment } from './resolve_removable_alerts';
import {
  getCaseAlertAttachments,
  resolveRemovableAlertAttachments,
} from './resolve_removable_alerts';

const alertAttachment = (id: string, alertIds: string[]): CaseAlertAttachment => ({ id, alertIds });

describe('getCaseAlertAttachments', () => {
  it('extracts unified alert attachments with their ids', () => {
    const comments = [
      {
        id: 'attachment-1',
        type: SECURITY_ALERT_ATTACHMENT_TYPE,
        attachmentId: ['alert-1', 'alert-2'],
      },
      {
        id: 'attachment-2',
        type: SECURITY_ALERT_ATTACHMENT_TYPE,
        attachmentId: 'alert-3',
      },
    ] as unknown as CaseAttachment[];

    expect(getCaseAlertAttachments(comments)).toEqual([
      { id: 'attachment-1', alertIds: ['alert-1', 'alert-2'] },
      { id: 'attachment-2', alertIds: ['alert-3'] },
    ]);
  });

  it('ignores attachments that are not unified alerts', () => {
    const comments = [
      {
        id: 'attachment-1',
        type: SECURITY_ATTACK_ATTACHMENT_TYPE,
        attachmentId: 'attack-1',
      },
      {
        // A legacy alert attachment was never brought in by an attack.
        id: 'attachment-2',
        type: AttachmentType.alert,
        alertId: 'alert-1',
        index: '.alerts-security.alerts-default',
      },
    ] as unknown as CaseAttachment[];

    expect(getCaseAlertAttachments(comments)).toEqual([]);
  });
});

describe('resolveRemovableAlertAttachments', () => {
  it('returns nothing when the attack shares no alerts with the case', () => {
    expect(
      resolveRemovableAlertAttachments({
        attackAlertIds: ['alert-1', 'alert-2'],
        alertAttachments: [alertAttachment('attachment-1', ['alert-9'])],
        otherAttackAlertIds: [],
      })
    ).toEqual({ attachmentIds: [], alertIds: [], isResolvable: true });
  });

  it('returns every attachment when the attack is the only claimant', () => {
    expect(
      resolveRemovableAlertAttachments({
        attackAlertIds: ['alert-1', 'alert-2'],
        alertAttachments: [
          alertAttachment('attachment-1', ['alert-1']),
          alertAttachment('attachment-2', ['alert-2']),
        ],
        otherAttackAlertIds: [],
      })
    ).toEqual({
      attachmentIds: ['attachment-1', 'attachment-2'],
      alertIds: ['alert-1', 'alert-2'],
      isResolvable: true,
    });
  });

  it('excludes every alert when another attached attack claims the same set', () => {
    expect(
      resolveRemovableAlertAttachments({
        attackAlertIds: ['alert-1', 'alert-2'],
        alertAttachments: [
          alertAttachment('attachment-1', ['alert-1']),
          alertAttachment('attachment-2', ['alert-2']),
        ],
        otherAttackAlertIds: [['alert-1', 'alert-2']],
      })
    ).toEqual({ attachmentIds: [], alertIds: [], isResolvable: true });
  });

  it('excludes only the alerts another attached attack also claims', () => {
    expect(
      resolveRemovableAlertAttachments({
        attackAlertIds: ['alert-1', 'alert-2', 'alert-3'],
        alertAttachments: [
          alertAttachment('attachment-1', ['alert-1']),
          alertAttachment('attachment-2', ['alert-2']),
          alertAttachment('attachment-3', ['alert-3']),
        ],
        otherAttackAlertIds: [['alert-2'], ['alert-9']],
      })
    ).toEqual({
      attachmentIds: ['attachment-1', 'attachment-3'],
      alertIds: ['alert-1', 'alert-3'],
      isResolvable: true,
    });
  });

  it('never returns an alert that left the attack since attach time', () => {
    expect(
      resolveRemovableAlertAttachments({
        // `alert-2` was attached with the attack but is no longer part of it.
        attackAlertIds: ['alert-1'],
        alertAttachments: [
          alertAttachment('attachment-1', ['alert-1']),
          alertAttachment('attachment-2', ['alert-2']),
        ],
        otherAttackAlertIds: [],
      })
    ).toEqual({
      attachmentIds: ['attachment-1'],
      alertIds: ['alert-1'],
      isResolvable: true,
    });
  });

  it.each([[undefined], [null]])(
    'reports an unresolvable attack (%p) rather than throwing',
    (attackAlertIds) => {
      expect(
        resolveRemovableAlertAttachments({
          attackAlertIds,
          alertAttachments: [alertAttachment('attachment-1', ['alert-1'])],
          otherAttackAlertIds: [],
        })
      ).toEqual({ attachmentIds: [], alertIds: [], isResolvable: false });
    }
  );

  it('reports unresolvable when another attached attack cannot be resolved', () => {
    expect(
      resolveRemovableAlertAttachments({
        attackAlertIds: ['alert-1'],
        alertAttachments: [alertAttachment('attachment-1', ['alert-1'])],
        otherAttackAlertIds: [undefined],
      })
    ).toEqual({ attachmentIds: [], alertIds: [], isResolvable: false });
  });

  it('keeps an attachment whose alerts are only partly removable', () => {
    expect(
      resolveRemovableAlertAttachments({
        attackAlertIds: ['alert-1', 'alert-2'],
        // One attachment covers both alerts, but another attack claims `alert-2`, so deleting
        // the attachment would strip evidence from that attack too.
        alertAttachments: [alertAttachment('attachment-1', ['alert-1', 'alert-2'])],
        otherAttackAlertIds: [['alert-2']],
      })
    ).toEqual({ attachmentIds: [], alertIds: [], isResolvable: true });
  });

  it('dedupes alert ids reported across attachments', () => {
    expect(
      resolveRemovableAlertAttachments({
        attackAlertIds: ['alert-1'],
        alertAttachments: [
          alertAttachment('attachment-1', ['alert-1']),
          alertAttachment('attachment-2', ['alert-1']),
        ],
        otherAttackAlertIds: [],
      })
    ).toEqual({
      attachmentIds: ['attachment-1', 'attachment-2'],
      alertIds: ['alert-1'],
      isResolvable: true,
    });
  });

  it('ignores an alert attachment with no alert ids', () => {
    expect(
      resolveRemovableAlertAttachments({
        attackAlertIds: ['alert-1'],
        alertAttachments: [alertAttachment('attachment-1', [])],
        otherAttackAlertIds: [],
      })
    ).toEqual({ attachmentIds: [], alertIds: [], isResolvable: true });
  });

  it('returns nothing when the case has no alert attachments', () => {
    expect(
      resolveRemovableAlertAttachments({
        attackAlertIds: ['alert-1'],
        alertAttachments: [],
        otherAttackAlertIds: [],
      })
    ).toEqual({ attachmentIds: [], alertIds: [], isResolvable: true });
  });
});
