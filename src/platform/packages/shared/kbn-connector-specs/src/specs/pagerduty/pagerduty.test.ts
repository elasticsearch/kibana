/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionContext } from '../../connector_spec';
import { PagerdutyConnector } from './pagerduty';

const mockCallTool = jest.fn();
const mockListTools = jest.fn();

const parse = <K extends keyof typeof PagerdutyConnector.actions>(
  action: K,
  raw: Record<string, unknown>
) => PagerdutyConnector.actions[action].input.parse(raw);

describe('PagerdutyConnector', () => {
  const mockContext = {
    client: {},
    log: {},
    config: { serverUrl: 'https://mcp.pagerduty.com/mcp' },
    getClient: () => Promise.resolve({ callTool: mockCallTool, listTools: mockListTools }),
  } as unknown as ActionContext;

  const mockJson = { ok: true };
  const mockContent = [{ type: 'text', text: JSON.stringify(mockJson) }];

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallTool.mockResolvedValue({ content: mockContent });
    mockListTools.mockResolvedValue({
      tools: [{ name: 'get_user_data' }, { name: 'list_incidents' }],
    });
  });

  describe('getUserData action', () => {
    it('calls get_user_data tool and returns parsed JSON', async () => {
      const result = await PagerdutyConnector.actions.getUserData.handler(mockContext, {});

      expect(mockCallTool).toHaveBeenCalledWith({ name: 'get_user_data', arguments: {} });
      expect(result).toEqual(mockJson);
    });
  });

  describe('listSchedules action', () => {
    it('passes input as query_model', async () => {
      const input = parse('listSchedules', { query: 'primary' });
      await PagerdutyConnector.actions.listSchedules.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_schedules',
        arguments: { query_model: { query: 'primary' } },
      });
    });

    it('passes all optional filters', async () => {
      const input = parse('listSchedules', {
        query: 'ops',
        limit: 5,
        team_ids: ['T1'],
        user_ids: ['U1'],
        include: ['schedule_layers'],
      });
      await PagerdutyConnector.actions.listSchedules.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_schedules',
        arguments: {
          query_model: {
            query: 'ops',
            limit: 5,
            team_ids: ['T1'],
            user_ids: ['U1'],
            include: ['schedule_layers'],
          },
        },
      });
    });
  });

  describe('listEscalationPolicies action', () => {
    it('passes input as query_model', async () => {
      const input = parse('listEscalationPolicies', { query: 'critical' });
      await PagerdutyConnector.actions.listEscalationPolicies.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_escalation_policies',
        arguments: { query_model: { query: 'critical' } },
      });
    });
  });

  describe('listIncidents action', () => {
    it('passes input as query_model', async () => {
      const input = parse('listIncidents', { status: ['triggered'] });
      await PagerdutyConnector.actions.listIncidents.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_incidents',
        arguments: { query_model: { status: ['triggered'], limit: 25 } },
      });
    });
  });

  describe('listOncalls action', () => {
    it('applies default limit when omitted', async () => {
      const input = parse('listOncalls', {});
      await PagerdutyConnector.actions.listOncalls.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_oncalls',
        arguments: { query_model: { limit: 20 } },
      });
    });

    it('passes custom limit and filters', async () => {
      const input = parse('listOncalls', {
        limit: 5,
        schedule_ids: ['S1'],
        earliest: true,
      });
      await PagerdutyConnector.actions.listOncalls.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_oncalls',
        arguments: {
          query_model: { limit: 5, schedule_ids: ['S1'], earliest: true },
        },
      });
    });
  });

  describe('listUsers action', () => {
    it('passes input as query_model', async () => {
      const input = parse('listUsers', { query: 'alice' });
      await PagerdutyConnector.actions.listUsers.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_users',
        arguments: { query_model: { query: 'alice' } },
      });
    });
  });

  describe('listTeams action', () => {
    it('passes input as query_model', async () => {
      const input = parse('listTeams', { query: 'platform' });
      await PagerdutyConnector.actions.listTeams.handler(mockContext, input);

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_teams',
        arguments: { query_model: { query: 'platform' } },
      });
    });
  });

  describe('getSchedule action', () => {
    it('calls get_schedule with the schedule_id', async () => {
      await PagerdutyConnector.actions.getSchedule.handler(mockContext, {
        schedule_id: 'PSCHED01',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_schedule',
        arguments: { schedule_id: 'PSCHED01' },
      });
    });
  });

  describe('getIncident action', () => {
    it('calls get_incident with the incident_id', async () => {
      await PagerdutyConnector.actions.getIncident.handler(mockContext, {
        incident_id: 'PINC001',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_incident',
        arguments: { incident_id: 'PINC001' },
      });
    });
  });

  describe('getEscalationPolicy action', () => {
    it('calls get_escalation_policy with the policy_id', async () => {
      await PagerdutyConnector.actions.getEscalationPolicy.handler(mockContext, {
        policy_id: 'PPOL01',
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_escalation_policy',
        arguments: { policy_id: 'PPOL01' },
      });
    });
  });

  describe('getTeam action', () => {
    it('calls get_team with the team_id', async () => {
      await PagerdutyConnector.actions.getTeam.handler(mockContext, { team_id: 'PTEAM01' });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_team',
        arguments: { team_id: 'PTEAM01' },
      });
    });
  });

  describe('listTools action', () => {
    it('returns the list of available tools', async () => {
      const result = await PagerdutyConnector.actions.listTools.handler(mockContext, {});

      expect(mockListTools).toHaveBeenCalled();
      expect(result).toEqual([{ name: 'get_user_data' }, { name: 'list_incidents' }]);
    });
  });

  describe('callTool action', () => {
    it('calls the named tool with provided arguments', async () => {
      const result = await PagerdutyConnector.actions.callTool.handler(mockContext, {
        name: 'list_incidents',
        arguments: { limit: 5 },
      });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'list_incidents',
        arguments: { limit: 5 },
      });
      expect(result).toEqual(mockContent);
    });

    it('calls the named tool with no arguments when omitted', async () => {
      await PagerdutyConnector.actions.callTool.handler(mockContext, { name: 'get_user_data' });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_user_data',
        arguments: {},
      });
    });
  });

  describe('test handler', () => {
    it('returns ok with tool count on successful connection', async () => {
      if (!PagerdutyConnector.test) {
        throw new Error('test handler not defined');
      }
      const result = await PagerdutyConnector.test.handler(mockContext);

      expect(mockListTools).toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        message: 'Connected to PagerDuty MCP server. 2 tools available.',
      });
    });

    it('propagates build errors from getClient', async () => {
      const failCtx = {
        ...mockContext,
        getClient: () => Promise.reject(new Error('connection refused')),
      } as unknown as ActionContext;

      if (!PagerdutyConnector.test) {
        throw new Error('test handler not defined');
      }

      await expect(PagerdutyConnector.test.handler(failCtx)).rejects.toThrow('connection refused');
    });
  });
});
