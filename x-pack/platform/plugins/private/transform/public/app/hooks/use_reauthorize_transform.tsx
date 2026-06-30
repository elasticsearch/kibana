/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation } from '@kbn/react-query';

import { i18n } from '@kbn/i18n';

import type {
  ReauthorizeTransformsRequestSchema,
  ReauthorizeTransformsResponseSchema,
} from '../../../server/routes/api_schemas/reauthorize_transforms';
import { addInternalBasePath } from '../../../common/constants';
import { getErrorMessage } from '../../../common/utils/errors';

import { useAppDependencies, useToastNotifications } from '../app_dependencies';
import { useToastNotificationText } from '../components';

import { useRefreshTransformList } from './use_refresh_transform_list';

export const useReauthorizeTransforms = () => {
  const { http } = useAppDependencies();
  const refreshTransformList = useRefreshTransformList();
  const toastNotifications = useToastNotifications();
  const getToastNotificationText = useToastNotificationText();

  const mutation = useMutation({
    mutationFn: (reqBody: ReauthorizeTransformsRequestSchema) =>
      http.post<ReauthorizeTransformsResponseSchema>(
        addInternalBasePath('reauthorize_transforms'),
        {
          body: JSON.stringify(reqBody),
          version: '1',
        }
      ),
    onError: (error) =>
      toastNotifications.addDanger({
        title: i18n.translate(
          'xpack.transform.stepCreateForm.reauthorizeTransformResponseSchemaErrorMessage',
          {
            defaultMessage: 'An error occurred calling the reauthorize transforms request.',
          }
        ),
        ...getToastNotificationText(getErrorMessage(error)),
      }),
    onSuccess: (results) => {
      for (const transformId in results) {
        // hasOwnProperty check to ensure only properties on object itself, and not its prototypes
        if (Object.hasOwn(results, transformId)) {
          const result = results[transformId];
          if (!result.success) {
            toastNotifications.addError(
              new Error(JSON.stringify(result.error!.caused_by, null, 2)),
              {
                title: i18n.translate(
                  'xpack.transform.transformList.reauthorizeTransformErrorMessage',
                  {
                    defaultMessage: 'An error occurred reauthorizing the transform {transformId}',
                    values: { transformId },
                  }
                ),
                toastMessage: result.error!.reason,
              }
            );
          }
        }
      }

      refreshTransformList();
    },
  });

  return mutation.mutate;
};
