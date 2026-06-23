/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { set } from '@kbn/safer-lodash-set';
import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { KbnClient } from '@kbn/test';
import { sendEndpointActionResponse, sendFleetActionResponse } from '../../common/response_actions';
import { BaseRunningService } from '../../common/base_running_service';
import { fetchEndpointActionList } from './endpoint_response_actions';
import type { ActionDetails } from '../../../../common/endpoint/types';

/**
 * Base class for start/stopping background services
 */
export class ActionResponderService extends BaseRunningService {
  private readonly delay: number;

  constructor(
    esClient: Client,
    kbnClient: KbnClient,
    logger?: ToolingLog,
    intervalMs?: number,
    delay: number = 5_000 // 5s
  ) {
    super(esClient, kbnClient, logger, intervalMs);
    this.delay = delay;
  }

  protected async run(): Promise<void> {
    const { logger: log, kbnClient, esClient, delay } = this;

    let hasMore = true;
    let nextPage = 1;

    try {
      while (hasMore) {
        const { data: actions } = await fetchEndpointActionList(kbnClient, {
          page: nextPage++,
          pageSize: 100,
        });

        if (actions.length === 0) {
          hasMore = false;
          return;
        }

        for (const action of actions) {
          if (action.isCompleted === false) {
            if (Date.now() - new Date(action.startedAt).getTime() >= delay) {
              log.verbose(
                `${this.logPrefix}.run() [${new Date().toLocaleTimeString()}]: Responding to [${
                  action.command
                }] action [id: ${action.id}] agent: [${action.agents.join(', ')}]`
              );

              const tokens = parseCommentTokens(getActionComment(action));

              log.verbose(`${this.logPrefix}.run() tokens found in action:`, tokens);

              if (tokens.state !== 'pending') {
                const fleetResponse = await sendFleetActionResponse(esClient, action, {
                  // If an Endpoint state token was found, then force the Fleet response to `success`
                  // so that we can actually generate an endpoint response below.
                  state: tokens.state ? 'success' : tokens.fleet.state,
                });

                // If not a fleet response error, then also sent the Endpoint Response
                if (!fleetResponse.error) {
                  await sendEndpointActionResponse(esClient, action, { state: tokens.state });
                }
              }
            }
          }
        }
      }
    } catch (e) {
      log.error(`${this.logPrefix}.run() ${e.message}. Run with '--verbose' option to see more`);
      log.verbose(e);
    }
  }
}

interface CommentTokens {
  state: 'success' | 'failure' | 'pending' | undefined;
  fleet: {
    state: 'success' | 'failure' | undefined;
  };
}

const parseCommentTokens = (comment: string): CommentTokens => {
  const response: CommentTokens = {
    state: undefined,
    fleet: {
      state: undefined,
    },
  };

  if (comment) {
    const findTokensRegExp = /(respond\.\S*=\S*)/gi;
    let matches;

    while ((matches = findTokensRegExp.exec(comment)) !== null) {
      const [key, value] = matches[0]
        .toLowerCase()
        .split('=')
        .map((s) => s.trim());

      set(response, key.split('.').slice(1), value);
    }
  }
  return response;
};

const getActionComment = (action: ActionDetails): string => {
  return action.comment ?? '';
};
