/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  buildWaitForApprovalResumeLinks,
  hasExternalApprovalChannels,
  sendWaitForApprovalNotifications,
} from './send_wait_for_approval_notifications';

describe('send_wait_for_approval_notifications', () => {
  describe('hasExternalApprovalChannels', () => {
    it('returns false when channels are omitted', () => {
      expect(hasExternalApprovalChannels(undefined)).toBe(false);
    });

    it('returns true when slack webhook connector config is present', () => {
      expect(
        hasExternalApprovalChannels({
          slack: { 'connector-id': 'slack-1' },
        })
      ).toBe(true);
    });

    it('returns true when slack_api channel config is present', () => {
      expect(
        hasExternalApprovalChannels({
          slack_api: { 'connector-id': 'slack-api-1', channels: ['C0123'] },
        })
      ).toBe(true);
    });
  });

  describe('buildWaitForApprovalResumeLinks', () => {
    it('builds approve and reject URLs with encoded apiKey', () => {
      const links = buildWaitForApprovalResumeLinks({
        kibanaUrl: 'https://kibana.example',
        spaceId: 'default',
        executionId: 'exec-1',
        encodedApiKey: 'encoded-api-key',
      });

      expect(links.approveUrl).toContain('approved=true');
      expect(links.rejectUrl).toContain('approved=false');
      expect(links.approveUrl).toContain('apiKey=encoded-api-key');
      expect(links.rejectUrl).toContain('apiKey=encoded-api-key');
    });
  });

  describe('sendWaitForApprovalNotifications', () => {
    const resumeLinks = {
      approveUrl: 'https://kibana.example/approve',
      rejectUrl: 'https://kibana.example/reject',
    };

    it('sends webhook slack notification with mrkdwn-safe resume links', async () => {
      const execute = jest.fn().mockResolvedValue({ status: 'ok' });
      const resumeLinksWithQuery = {
        approveUrl: 'https://kibana.example/approve?apiKey=abc&approved=true',
        rejectUrl: 'https://kibana.example/reject?apiKey=abc&approved=false',
      };

      await sendWaitForApprovalNotifications({
        channels: {
          slack: { 'connector-id': 'slack-webhook-1' },
        },
        message: 'Approve change?',
        approveLabel: 'Approve',
        rejectLabel: 'Decline',
        resumeLinks: resumeLinksWithQuery,
        connectorExecutor: { execute } as never,
        abortController: new AbortController(),
      });

      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0][0].connectorType).toBe('slack');
      expect(execute.mock.calls[0][0].input.message).toContain('&amp;approved=true');
      expect(execute.mock.calls[0][0].input.message).toContain(
        '<https://kibana.example/approve?apiKey=abc&amp;approved=true|Approve>'
      );
    });

    it('sends slack and slack_api notifications when both are configured', async () => {
      const execute = jest
        .fn()
        .mockResolvedValueOnce({ status: 'ok' })
        .mockResolvedValueOnce({ status: 'ok' });

      await sendWaitForApprovalNotifications({
        channels: {
          slack: { 'connector-id': 'slack-webhook-1' },
          slack_api: { 'connector-id': 'slack-api-1', channels: ['C0123'] },
        },
        message: 'Approve change?',
        approveLabel: 'Approve',
        rejectLabel: 'Decline',
        resumeLinks,
        connectorExecutor: { execute } as never,
        abortController: new AbortController(),
      });

      expect(execute).toHaveBeenCalledTimes(2);
      expect(execute.mock.calls[0][0].connectorType).toBe('slack');
      expect(execute.mock.calls[1][0].connectorType).toBe('slack_api');
      expect(execute.mock.calls[1][0].input).toEqual({
        subAction: 'postBlockkit',
        subActionParams: {
          channelIds: ['C0123'],
          text: expect.stringContaining('"type":"actions"'),
        },
      });
    });

    it('throws when a configured connector fails', async () => {
      const execute = jest
        .fn()
        .mockResolvedValue({ status: 'error', message: 'Slack unavailable' });

      await expect(
        sendWaitForApprovalNotifications({
          channels: {
            slack: { 'connector-id': 'slack-1' },
          },
          message: 'Approve change?',
          approveLabel: 'Approve',
          rejectLabel: 'Decline',
          resumeLinks,
          connectorExecutor: { execute } as never,
          abortController: new AbortController(),
        })
      ).rejects.toThrow('Slack unavailable');
    });
  });
});
