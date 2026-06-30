/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation } from '@kbn/react-query';

import { i18n } from '@kbn/i18n';

import type {
  StopTransformsRequestSchema,
  StopTransformsResponseSchema,
} from '../../../server/routes/api_schemas/stop_transforms';
import { addInternalBasePath } from '../../../common/constants';
import { getErrorMessage } from '../../../common/utils/errors';

import { useAppDependencies, useToastNotifications } from '../app_dependencies';
import { useToastNotificationText } from '../components';

import { useRefreshTransformList } from './use_refresh_transform_list';

export const useStopTransforms = () => {
  const { http } = useAppDependencies();
  const refreshTransformList = useRefreshTransformList();
  const toastNotifications = useToastNotifications();
  const getToastNotificationText = useToastNotificationText();

  const mutation = useMutation({
    mutationFn: (reqBody: StopTransformsRequestSchema) =>
      http.post<StopTransformsResponseSchema>(addInternalBasePath('stop_transforms'), {
        body: JSON.stringify(reqBody),
        version: '1',
      }),
    onError: (error) =>
      toastNotifications.addDanger({
        title: i18n.translate(
          'xpack.transform.transformList.stopTransformResponseSchemaErrorMessage',
          {
            defaultMessage: 'An error occurred called the stop transforms request.',
          }
        ),
        ...getToastNotificationText(getErrorMessage(error)),
      }),
    onSuccess: (results) => {
      for (const transformId in results) {
        // hasOwnProperty check to ensure only properties on object itself, and not its prototypes
        if (Object.hasOwn(results, transformId)) {
          if (!results[transformId].success) {
            toastNotifications.addDanger(
              i18n.translate('xpack.transform.transformList.stopTransformErrorMessage', {
                defaultMessage: 'An error occurred stopping the data frame transform {transformId}',
                values: { transformId },
              })
            );
          }
        }
      }

      refreshTransformList();
    },
  });

  return mutation.mutate;
};
