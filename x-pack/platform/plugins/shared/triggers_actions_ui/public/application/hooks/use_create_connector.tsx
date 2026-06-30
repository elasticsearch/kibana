/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useRef, useState, useEffect } from 'react';
import { i18n } from '@kbn/i18n';
import type { UserConfiguredActionConnector } from '@kbn/alerts-ui-shared/src/common/types/action_types';
import type { ActionConnector } from '../../types';
import { createActionConnector } from '../lib/action_connector_api';
import { useKibana } from '../../common/lib/kibana';

type CreateConnectorSchema = Pick<
  UserConfiguredActionConnector<Record<string, unknown>, Record<string, unknown>>,
  'actionTypeId' | 'name' | 'config' | 'secrets' | 'id'
>;

export interface CreateConnectorError {
  title: string;
  message: string;
}

interface UseCreateConnectorReturnValue {
  isLoading: boolean;
  createConnectorError: CreateConnectorError | null;
  createConnector: (connector: CreateConnectorSchema) => Promise<ActionConnector | undefined>;
}

export const useCreateConnector = (): UseCreateConnectorReturnValue => {
  const {
    http,
    notifications: { toasts },
  } = useKibana().services;

  const [isLoading, setIsLoading] = useState(false);
  const [createConnectorError, setCreateConnectorError] = useState<CreateConnectorError | null>(
    null
  );
  const abortCtrlRef = useRef(new AbortController());
  const isMounted = useRef(false);

  async function createConnector(connector: CreateConnectorSchema) {
    setCreateConnectorError(null);
    setIsLoading(true);
    isMounted.current = true;
    abortCtrlRef.current.abort();
    abortCtrlRef.current = new AbortController();

    try {
      const { id, ...connectorData } = connector;
      const res = await createActionConnector({ http, connector: connectorData, id });

      if (isMounted.current) {
        setIsLoading(false);

        toasts.addSuccess(
          i18n.translate(
            'xpack.triggersActionsUI.sections.addConnectorForm.updateSuccessNotificationText',
            {
              defaultMessage: "Created ''{connectorName}''",
              values: {
                connectorName: res.name,
              },
            }
          )
        );
      }

      return res;
    } catch (error) {
      if (isMounted.current) {
        setIsLoading(false);

        if (error.name !== 'AbortError') {
          const title = i18n.translate(
            'xpack.triggersActionsUI.sections.useCreateConnector.updateErrorNotificationTitle',
            { defaultMessage: 'Unable to create a connector.' }
          );
          const message =
            error.body?.message ??
            i18n.translate(
              'xpack.triggersActionsUI.sections.useCreateConnector.updateErrorNotificationText',
              { defaultMessage: 'Check the Kibana logs for more information.' }
            );

          setCreateConnectorError({ title, message });
          toasts.addError(error, {
            title,
            toastMessage: message,
          });
        }
      }
    }
  }

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      abortCtrlRef.current.abort();
    };
  }, []);

  return { isLoading, createConnectorError, createConnector };
};
