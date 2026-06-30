/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation } from '@kbn/react-query';

import { i18n } from '@kbn/i18n';

import type {
  ScheduleNowTransformsRequestSchema,
  ScheduleNowTransformsResponseSchema,
} from '../../../server/routes/api_schemas/schedule_now_transforms';
import { addInternalBasePath } from '../../../common/constants';
import { getErrorMessage } from '../../../common/utils/errors';

import { useAppDependencies, useToastNotifications } from '../app_dependencies';
import { useToastNotificationText } from '../components';

import { useRefreshTransformList } from './use_refresh_transform_list';

export const useScheduleNowTransforms = () => {
  const { http } = useAppDependencies();
  const refreshTransformList = useRefreshTransformList();
  const toastNotifications = useToastNotifications();
  const getToastNotificationText = useToastNotificationText();

  const mutation = useMutation({
    mutationFn: (reqBody: ScheduleNowTransformsRequestSchema) =>
      http.post<ScheduleNowTransformsResponseSchema>(
        addInternalBasePath('schedule_now_transforms'),
        {
          body: JSON.stringify(reqBody),
          version: '1',
        }
      ),
    onError: (error) =>
      toastNotifications.addDanger({
        title: i18n.translate(
          'xpack.transform.stepCreateForm.scheduleNowTransformResponseSchemaErrorMessage',
          {
            defaultMessage:
              'An error occurred calling the request to schedule the transform to process data instantly.',
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
                  'xpack.transform.transformList.scheduleNowTransformErrorMessage',
                  {
                    defaultMessage:
                      'An error occurred scheduling transform {transformId} to process data instantly.',
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
