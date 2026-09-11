/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core/public';
import type { JsonValue } from '@kbn/utility-types';
import { getCaseBulkDeleteAttachmentsUrl, getCaseDetailsUrl } from '@kbn/cases-plugin/common/api';
import { MAX_BULK_DELETE_ATTACHMENTS } from '@kbn/cases-plugin/common/constants';
import type { CaseAttachment } from './utils';

export interface BulkDeleteCaseAttachmentsParams {
  http: HttpSetup;
  /** The case the attachments belong to. */
  caseId: string;
  /** Attachment saved object ids to delete. */
  attachmentIds: readonly string[];
  signal?: AbortSignal;
}

/**
 * Deletes several attachments from a case in one request via the Cases bulk-delete endpoint.
 *
 * The endpoint is all-or-nothing: it fails without deleting anything if any id is not an
 * attachment of the case, which is what makes removing an attack and the alerts it brought in
 * a single atomic step rather than a loop of single deletes that can half-succeed.
 *
 * The endpoint accepts at most {@link MAX_BULK_DELETE_ATTACHMENTS} ids per request. A bulk
 * selection can name more attachments than that, so larger sets are sent as sequential batches —
 * the attack attachment goes in the first batch so a failure part-way through can never leave the
 * attack behind while its alerts are gone. Callers pass the attack id first.
 */
export const bulkDeleteCaseAttachments = async ({
  http,
  caseId,
  attachmentIds,
  signal,
}: BulkDeleteCaseAttachmentsParams): Promise<void> => {
  if (attachmentIds.length === 0) {
    return;
  }

  const url = getCaseBulkDeleteAttachmentsUrl(caseId);

  for (let start = 0; start < attachmentIds.length; start += MAX_BULK_DELETE_ATTACHMENTS) {
    const ids = attachmentIds.slice(start, start + MAX_BULK_DELETE_ATTACHMENTS);
    await http.post<void>(url, { body: JSON.stringify({ ids }), signal });
  }
};

/** A user as the Cases API serialises one, before the case view camel-cases the payload. */
interface FoundAttachmentUser {
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  profile_uid?: string;
}

/**
 * One attachment as the find endpoint returns it.
 *
 * The payload fields (`type`, `attachmentId`, `metadata`) are serialised as they are stored, but
 * the audit fields are snake_case: the case view camel-cases the payload before handing its
 * children a `CaseAttachment`, and this path does not go through the case view. `attachmentId` is
 * optional because the same endpoint also returns value attachments, which carry none.
 */
interface FoundAttachment {
  id: string;
  version: string;
  type: string;
  owner: string;
  attachmentId?: string | string[];
  metadata?: Record<string, JsonValue> | null;
  created_at: string;
  created_by: FoundAttachmentUser;
  pushed_at: string | null;
  pushed_by: FoundAttachmentUser | null;
  updated_at: string | null;
  updated_by: FoundAttachmentUser | null;
}

/** The case, with its attachments, as the resolve endpoint returns it. */
interface ResolveCaseResponse {
  case: { comments?: FoundAttachment[] };
}

const toCaseUser = ({
  email,
  full_name: fullName,
  username,
  profile_uid: profileUid,
}: FoundAttachmentUser) => ({ email, fullName, username, profileUid });

/**
 * Converts one found attachment to the `CaseAttachment` shape the removal resolution consumes,
 * dropping value attachments — a user comment references nothing, so no attack ever brought one
 * in and no attack removal can take one away.
 */
const toCaseAttachments = (attachment: FoundAttachment): CaseAttachment[] => {
  const {
    attachmentId,
    created_at: createdAt,
    created_by: createdBy,
    pushed_at: pushedAt,
    pushed_by: pushedBy,
    updated_at: updatedAt,
    updated_by: updatedBy,
    ...rest
  } = attachment;

  if (attachmentId == null) {
    return [];
  }

  return [
    {
      ...rest,
      attachmentId,
      createdAt,
      createdBy: toCaseUser(createdBy),
      pushedAt,
      pushedBy: pushedBy == null ? null : toCaseUser(pushedBy),
      updatedAt,
      updatedBy: updatedBy == null ? null : toCaseUser(updatedBy),
    },
  ];
};

export interface FetchCaseAttachmentsParams {
  http: HttpSetup;
  /** The case whose attachments to read. */
  caseId: string;
  signal?: AbortSignal;
}

/**
 * Reads a case's reference attachments, in the same request the case view itself reads them with.
 *
 * The activity log hands a registered attachment's actions only the case id and title, so the
 * attack card's removal has no other way to see the attack and alert attachments the removal
 * scope is resolved against. The public find-attachments endpoint is no use for it: that one
 * returns the case's user comments alone, never the reference attachments an attack brought in.
 */
export const fetchCaseAttachments = async ({
  http,
  caseId,
  signal,
}: FetchCaseAttachmentsParams): Promise<CaseAttachment[]> => {
  const response = await http.get<ResolveCaseResponse>(`${getCaseDetailsUrl(caseId)}/resolve`, {
    query: { includeComments: true, mode: 'unified' },
    signal,
  });

  return (response.case.comments ?? []).flatMap(toCaseAttachments);
};
