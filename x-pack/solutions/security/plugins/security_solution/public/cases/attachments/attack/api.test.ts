/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core/public';
import { MAX_BULK_DELETE_ATTACHMENTS } from '@kbn/cases-plugin/common/constants';
import {
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_ATTACK_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common';
import { bulkDeleteCaseAttachments, fetchCaseAttachments } from './api';

const buildHttp = () =>
  ({
    post: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({ case: { comments: [] } }),
  } as unknown as HttpSetup);

describe('bulkDeleteCaseAttachments', () => {
  it('sends every attachment id in a single request', async () => {
    const http = buildHttp();

    await bulkDeleteCaseAttachments({
      http,
      caseId: 'case-1',
      attachmentIds: ['so-attack-1', 'so-alert-1', 'so-alert-2'],
    });

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith('/api/cases/case-1/comments/_bulk_delete', {
      body: JSON.stringify({ ids: ['so-attack-1', 'so-alert-1', 'so-alert-2'] }),
      signal: undefined,
    });
  });

  it('forwards the abort signal', async () => {
    const http = buildHttp();
    const signal = new AbortController().signal;

    await bulkDeleteCaseAttachments({
      http,
      caseId: 'case-1',
      attachmentIds: ['so-attack-1'],
      signal,
    });

    expect(http.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal }));
  });

  it('makes no request when there is nothing to delete', async () => {
    const http = buildHttp();

    await bulkDeleteCaseAttachments({ http, caseId: 'case-1', attachmentIds: [] });

    expect(http.post).not.toHaveBeenCalled();
  });

  it('batches sets larger than the endpoint limit, sending the first id first', async () => {
    const http = buildHttp();
    const attachmentIds = Array.from(
      { length: MAX_BULK_DELETE_ATTACHMENTS + 3 },
      (_, index) => `so-${index}`
    );

    await bulkDeleteCaseAttachments({ http, caseId: 'case-1', attachmentIds });

    expect(http.post).toHaveBeenCalledTimes(2);
    const [[, first], [, second]] = (http.post as jest.Mock).mock.calls;
    expect(JSON.parse(first.body).ids).toEqual(attachmentIds.slice(0, MAX_BULK_DELETE_ATTACHMENTS));
    expect(JSON.parse(second.body).ids).toEqual(attachmentIds.slice(MAX_BULK_DELETE_ATTACHMENTS));
  });

  it('propagates a failed request', async () => {
    const http = buildHttp();
    (http.post as jest.Mock).mockRejectedValue(new Error('boom'));

    await expect(
      bulkDeleteCaseAttachments({ http, caseId: 'case-1', attachmentIds: ['so-attack-1'] })
    ).rejects.toThrow('boom');
  });
});

const foundAttachment = (overrides: Record<string, unknown> = {}) => ({
  id: 'so-attack-1',
  version: 'WzEsMV0=',
  type: SECURITY_ATTACK_ATTACHMENT_TYPE,
  owner: 'securitySolution',
  attachmentId: 'attack-1',
  metadata: { title: 'Credential dumping on host-1', alertCount: 2, index: '.alerts-attack' },
  created_at: '2024-05-02T10:00:00.000Z',
  created_by: { email: null, full_name: 'Ada Lovelace', username: 'ada', profile_uid: 'uid-1' },
  pushed_at: null,
  pushed_by: null,
  updated_at: null,
  updated_by: null,
  ...overrides,
});

const resolveResponse = (comments: unknown[]) => ({ case: { comments } });

describe('fetchCaseAttachments', () => {
  it('reads the case attachments in one request, as the case view does', async () => {
    const http = buildHttp();
    (http.get as jest.Mock).mockResolvedValue(resolveResponse([foundAttachment()]));

    const attachments = await fetchCaseAttachments({ http, caseId: 'case-1' });

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith('/api/cases/case-1/resolve', {
      query: { includeComments: true, mode: 'unified' },
      signal: undefined,
    });
    expect(attachments).toHaveLength(1);
  });

  it('camel-cases the audit fields the case view would otherwise have converted', async () => {
    const http = buildHttp();
    (http.get as jest.Mock).mockResolvedValue(resolveResponse([foundAttachment()]));

    const [attachment] = await fetchCaseAttachments({ http, caseId: 'case-1' });

    expect(attachment).toEqual({
      id: 'so-attack-1',
      version: 'WzEsMV0=',
      type: SECURITY_ATTACK_ATTACHMENT_TYPE,
      owner: 'securitySolution',
      attachmentId: 'attack-1',
      metadata: { title: 'Credential dumping on host-1', alertCount: 2, index: '.alerts-attack' },
      createdAt: '2024-05-02T10:00:00.000Z',
      createdBy: {
        email: null,
        fullName: 'Ada Lovelace',
        username: 'ada',
        profileUid: 'uid-1',
      },
      pushedAt: null,
      pushedBy: null,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it('keeps the alert attachments, which is what the removal scope is resolved against', async () => {
    const http = buildHttp();
    (http.get as jest.Mock).mockResolvedValue(
      resolveResponse([
        foundAttachment(),
        foundAttachment({
          id: 'so-alert-1',
          type: SECURITY_ALERT_ATTACHMENT_TYPE,
          attachmentId: ['alert-1', 'alert-2'],
          metadata: { index: '.alerts-detections' },
        }),
      ])
    );

    const attachments = await fetchCaseAttachments({ http, caseId: 'case-1' });

    expect(attachments.map(({ id }) => id)).toEqual(['so-attack-1', 'so-alert-1']);
  });

  it('drops value attachments, which reference nothing an attack could have brought in', async () => {
    const http = buildHttp();
    const { attachmentId, ...userComment } = foundAttachment({
      id: 'so-comment-1',
      type: 'comment',
    });
    (http.get as jest.Mock).mockResolvedValue(resolveResponse([foundAttachment(), userComment]));

    const attachments = await fetchCaseAttachments({ http, caseId: 'case-1' });

    expect(attachments.map(({ id }) => id)).toEqual(['so-attack-1']);
  });

  it('reads a case that carries no attachments at all', async () => {
    const http = buildHttp();
    (http.get as jest.Mock).mockResolvedValue({ case: {} });

    await expect(fetchCaseAttachments({ http, caseId: 'case-1' })).resolves.toEqual([]);
  });

  it('forwards the abort signal', async () => {
    const http = buildHttp();
    const signal = new AbortController().signal;
    (http.get as jest.Mock).mockResolvedValue(resolveResponse([foundAttachment()]));

    await fetchCaseAttachments({ http, caseId: 'case-1', signal });

    expect(http.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal }));
  });

  it('propagates a failed request', async () => {
    const http = buildHttp();
    (http.get as jest.Mock).mockRejectedValue(new Error('boom'));

    await expect(fetchCaseAttachments({ http, caseId: 'case-1' })).rejects.toThrow('boom');
  });
});
