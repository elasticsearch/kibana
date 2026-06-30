/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Case,
  FileAttachmentMetadata,
  AlertAttachmentPayload,
  UserCommentAttachmentPayload,
  ActionsAttachmentPayload,
  ExternalReferenceNoSOAttachmentPayload,
  ExternalReferenceSOAttachmentPayload,
  PersistableStateAttachmentPayload,
  UnifiedReferenceAttachmentPayload,
  Attachment,
} from '@kbn/cases-plugin/common/types/domain';
import {
  AttachmentType,
  CaseStatuses,
  CaseSeverity,
  ExternalReferenceStorageType,
} from '@kbn/cases-plugin/common/types/domain';
import type {
  CasePostRequest,
  PostFileAttachmentRequest,
} from '@kbn/cases-plugin/common/types/api';
import {
  LEGACY_FILE_ATTACHMENT_TYPE,
  SECURITY_ENTITY_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common/constants';
import { ConnectorTypes } from '@kbn/cases-plugin/common/types/domain';
import { FILE_SO_TYPE } from '@kbn/files-plugin/common';
import type { AttachmentRequest, CasesFindResponse } from '@kbn/cases-plugin/common/types/api';

export const defaultUser = {
  email: null,
  full_name: null,
  username: 'elastic',
  profile_uid: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
};
/**
 * A null filled user will occur when the security plugin is disabled
 */
export const nullUser = { email: null, full_name: null, username: null };

export const postCaseReq: CasePostRequest = {
  description: 'This is a brand new case of a bad meanie defacing data',
  title: 'Super Bad Security Issue',
  tags: ['defacement'],
  severity: CaseSeverity.LOW,
  connector: {
    id: 'none',
    name: 'none',
    type: ConnectorTypes.none,
    fields: null,
  },
  settings: {
    syncAlerts: true,
    extractObservables: true,
  },
  owner: 'securitySolutionFixture',
  assignees: [],
};

/**
 * Return a request for creating a case.
 */
export const getPostCaseRequest = (req?: Partial<CasePostRequest>): CasePostRequest => ({
  ...postCaseReq,
  ...req,
});

export const postCommentUserReq: UserCommentAttachmentPayload = {
  comment: 'This is a cool comment',
  type: AttachmentType.user,
  owner: 'securitySolutionFixture',
};

export const postFileReq: PostFileAttachmentRequest = {
  file: 'This is a file, a buffer will be created from this string.',
  filename: 'foobar.txt',
};

export const postCommentAlertReq: AlertAttachmentPayload = {
  alertId: 'test-id',
  index: 'test-index',
  rule: { id: 'test-rule-id', name: 'test-index-id' },
  type: AttachmentType.alert,
  owner: 'securitySolutionFixture',
};

export const postCommentAlertMultipleIdsReq: AlertAttachmentPayload = {
  alertId: ['test-id-1', 'test-id-2'],
  index: ['test-index', 'test-index-2'],
  rule: { id: 'test-rule-id', name: 'test-index-id' },
  type: AttachmentType.alert,
  owner: 'securitySolutionFixture',
};

export const postCommentEntityReq: UnifiedReferenceAttachmentPayload = {
  type: SECURITY_ENTITY_ATTACHMENT_TYPE,
  owner: 'securitySolutionFixture',
  attachmentId: 'entity-1',
  metadata: {
    entityName: 'alice',
    entityType: 'user',
  },
};

export const postCommentActionsReq: ActionsAttachmentPayload = {
  comment: 'comment text',
  actions: {
    targets: [
      {
        hostname: 'host-name',
        endpointId: 'endpoint-id',
      },
    ],
    type: 'isolate',
  },
  type: AttachmentType.actions,
  owner: 'securitySolutionFixture',
};

export const postCommentActionsReleaseReq: ActionsAttachmentPayload = {
  comment: 'comment text',
  actions: {
    targets: [
      {
        hostname: 'host-name',
        endpointId: 'endpoint-id',
      },
    ],
    type: 'unisolate',
  },
  type: AttachmentType.actions,
  owner: 'securitySolutionFixture',
};

export const postExternalReferenceESReq: ExternalReferenceNoSOAttachmentPayload = {
  type: AttachmentType.externalReference,
  externalReferenceStorage: { type: ExternalReferenceStorageType.elasticSearchDoc },
  externalReferenceId: 'my-id',
  externalReferenceAttachmentTypeId: '.test',
  externalReferenceMetadata: null,
  owner: 'securitySolutionFixture',
};

export const postExternalReferenceSOReq: ExternalReferenceSOAttachmentPayload = {
  ...postExternalReferenceESReq,
  externalReferenceStorage: { type: ExternalReferenceStorageType.savedObject, soType: 'test-type' },
};

export const fileMetadata = () => ({
  name: 'test_file',
  extension: 'png',
  mimeType: 'image/png',
  created: '2023-02-27T20:26:54.345Z',
});

export const fileAttachmentMetadata: FileAttachmentMetadata = {
  files: [fileMetadata()],
};

export const getFilesAttachmentReq = (
  req?: Partial<ExternalReferenceSOAttachmentPayload>
): ExternalReferenceSOAttachmentPayload => {
  return {
    ...postExternalReferenceSOReq,
    externalReferenceStorage: {
      type: ExternalReferenceStorageType.savedObject,
      soType: FILE_SO_TYPE,
    },
    externalReferenceAttachmentTypeId: LEGACY_FILE_ATTACHMENT_TYPE,
    externalReferenceMetadata: { ...fileAttachmentMetadata },
    ...req,
  };
};

export const persistableStateAttachment: PersistableStateAttachmentPayload = {
  type: AttachmentType.persistableState,
  owner: 'securitySolutionFixture',
  persistableStateAttachmentTypeId: '.test',
  persistableStateAttachmentState: { foo: 'foo' },
};

export const postCaseResp = (
  id?: string | null,
  req: CasePostRequest = postCaseReq
): Partial<Case> => ({
  ...req,
  ...(id != null ? { id } : {}),
  comments: [],
  duration: null,
  severity: req.severity ?? CaseSeverity.LOW,
  totalAlerts: 0,
  totalEvents: 0,
  totalComment: 0,
  closed_by: null,
  created_by: defaultUser,
  external_service: null,
  status: CaseStatuses.open,
  updated_by: null,
  category: null,
  customFields: [],
  observables: [],
  total_observables: 0,
});

export const getCaseWithoutCommentsResp = (
  id?: string | null,
  req: CasePostRequest = postCaseReq
): Partial<Case> => {
  const { comments, ...caseWithoutComments } = postCaseResp(id, req);
  return caseWithoutComments;
};

interface CommentRequestWithID {
  id: string;
  comment: AttachmentRequest;
}

export const commentsResp = ({
  comments,
}: {
  comments: CommentRequestWithID[];
}): Array<Partial<Attachment>> => {
  return comments.map(({ comment, id }) => {
    const baseFields = {
      id,
      created_by: defaultUser,
      pushed_at: null,
      pushed_by: null,
      updated_by: null,
    };

    return {
      ...comment,
      ...baseFields,
    };
  });
};

const findCommon = {
  page: 1,
  per_page: 20,
  total: 0,
  count_open_cases: 0,
  count_closed_cases: 0,
  count_in_progress_cases: 0,
};

export const findCasesResp: CasesFindResponse = {
  ...findCommon,
  cases: [],
};
