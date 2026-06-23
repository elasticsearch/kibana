/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { IHttpFetchError } from '@kbn/core/public';

/**
 * Map an HTTP error to a short, user-facing sentence suitable for a toast.
 *
 * The toast is the brief surface — the long server message (body.message)
 * still lives behind "See the full error". This helper returns translated
 * copy for common statuses and falls back to the raw HTTP status text for
 * the rest.
 */
export const getFriendlyRuleHttpErrorToastMessage = (error: Error): string => {
  const status = (error as IHttpFetchError).response?.status;

  switch (status) {
    case 400:
      return i18n.translate('xpack.alertingV2.httpError.badRequest', {
        defaultMessage:
          'The rule could not be saved because some fields are invalid. See the full error for details.',
      });
    case 401:
      return i18n.translate('xpack.alertingV2.httpError.unauthorized', {
        defaultMessage: 'Your session has expired. Sign in again and try once more.',
      });
    case 403:
      return i18n.translate('xpack.alertingV2.httpError.forbidden', {
        defaultMessage:
          'Your role needs additional privileges to save rules. Contact your administrator for help.',
      });
    case 404:
      return i18n.translate('xpack.alertingV2.httpError.notFound', {
        defaultMessage: 'This rule no longer exists. Go back to view all rules.',
      });
    case 408:
    case 504:
      return i18n.translate('xpack.alertingV2.httpError.timeout', {
        defaultMessage: 'The request timed out. Check your connection and try again.',
      });
    case 409:
      return i18n.translate('xpack.alertingV2.httpError.conflict', {
        defaultMessage:
          'This conflicts with the current state of the rule. See the full error for details.',
      });
    case 500:
    case 502:
    case 503:
      return i18n.translate('xpack.alertingV2.httpError.serverError', {
        defaultMessage:
          'Something went wrong on the server. Try again in a moment or contact support.',
      });
    default:
      return error.message;
  }
};
