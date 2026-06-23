/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import useObservable from 'react-use/lib/useObservable';
import { combineLatest, map } from 'rxjs';
import type { FullscreenEntryPointSource } from '@kbn/agent-builder-common';
import type { ConversationAttachment } from '@kbn/agent-builder-common/attachments';
import { AGENTBUILDER_APP_ID } from '../../../common/features';
import type { CreateOAuthClientResponse } from '../../../common/http_api/oauth_clients';
import { useKibana } from './use_kibana';

export interface LocationState {
  shouldStickToBottom?: boolean;
  initialMessage?: string;
  attachments?: ConversationAttachment[];
  autoSendInitialMessage?: boolean;
  mcpClientCreated?: CreateOAuthClientResponse;
  entryPointSource?: FullscreenEntryPointSource;
}

export const INFERENCE_MANAGEMENT_APP_ID = 'management';

export const INFERENCE_MANAGEMENT_PATH = '/modelManagement/model_settings';

export const useIsOnManagementLlmConnectorsPage = (): boolean => {
  const {
    services: { application },
  } = useKibana();

  const isOnPage$ = useMemo(
    () =>
      combineLatest([application.currentAppId$, application.currentLocation$]).pipe(
        map(
          ([appId, location]) =>
            appId === INFERENCE_MANAGEMENT_APP_ID && location.includes(INFERENCE_MANAGEMENT_PATH)
        )
      ),
    [application]
  );

  return useObservable(isOnPage$, false);
};

export const useNavigation = () => {
  const {
    services: { application },
  } = useKibana();

  const navigateToAgentBuilderUrl = useCallback(
    (path: string, params?: Record<string, string>, state?: LocationState) => {
      const queryParams = new URLSearchParams(params);
      application.navigateToApp(AGENTBUILDER_APP_ID, {
        path: queryParams.size ? `${path}?${queryParams}` : path,
        state,
      });
    },
    [application]
  );

  const createAgentBuilderUrl = useCallback(
    (path: string, params?: Record<string, string>) => {
      const queryParams = new URLSearchParams(params);
      return application.getUrlForApp(AGENTBUILDER_APP_ID, {
        path: queryParams.size ? `${path}?${queryParams}` : path,
      });
    },
    [application]
  );

  const navigateToManageConnectors = useCallback(
    () =>
      application.navigateToApp(INFERENCE_MANAGEMENT_APP_ID, { path: INFERENCE_MANAGEMENT_PATH }),
    [application]
  );

  const manageConnectorsUrl = useMemo(
    () =>
      application.getUrlForApp(INFERENCE_MANAGEMENT_APP_ID, {
        path: INFERENCE_MANAGEMENT_PATH,
      }),
    [application]
  );

  return {
    createAgentBuilderUrl,
    navigateToAgentBuilderUrl,
    navigateToManageConnectors,
    manageConnectorsUrl,
  };
};
