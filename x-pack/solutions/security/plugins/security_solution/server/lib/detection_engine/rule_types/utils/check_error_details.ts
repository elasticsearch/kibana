/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { KbnSearchError } from '@kbn/data-plugin/server/search/report_search_error';

const USER_ERRORS_EXCEPTIONS = [
  'index_not_found_exception',
  'status_exception',
  'verification_exception',
  'parsing_exception',
  'x_content_parse_exception',
];

// illegal_argument_exception is too broad to classify as a user error globally (ES itself
// can produce it from framework-generated queries). These reason substrings identify cases
// that are unambiguously caused by user data or configuration.
const ILLEGAL_ARGUMENT_USER_REASON_SUBSTRINGS = [
  'is not an IP string literal',
  'Fielddata is disabled on',
];

const isIllegalArgumentUserError = (errorString: string): boolean =>
  errorString.includes('illegal_argument_exception') &&
  ILLEGAL_ARGUMENT_USER_REASON_SUBSTRINGS.some((reason) => errorString.includes(reason));

/**
 *
 * @param error
 * @returns
 */
export const isMlJobMissingError = (error: unknown): boolean => {
  /*
  This is the logic I pulled directly from the ML rule type.
  I am also checking length here because the message returned
  from ES for a missing ML job is seemingly always <job name> missing.
  So to ensure we are not checking "missing" as a user error for other
  possible error messages, I added this check.
  */
  return typeof error === 'string' && error.endsWith('missing') && error.split(' ').length === 2;
};

/**
 * if error can be qualified as user error(configurational), returns isUserError: true
 * user errors are excluded from SLO dashboards
 */
export const checkErrorDetails = (error: unknown): { isUserError: boolean } => {
  const errorType = (error as KbnSearchError)?.errBody?.error?.type;
  if (USER_ERRORS_EXCEPTIONS.includes(errorType)) {
    return { isUserError: true };
  }

  if (
    (error instanceof Error &&
      typeof error.message === 'string' &&
      (error.message as string).endsWith('missing')) ||
    isMlJobMissingError(error)
  ) {
    return { isUserError: true };
  }

  const isUserError =
    (error instanceof Error &&
      USER_ERRORS_EXCEPTIONS.some((exception) => error.message.includes(exception))) ||
    (typeof error === 'string' &&
      USER_ERRORS_EXCEPTIONS.some((exception) => error.includes(exception))) ||
    (error instanceof Error && isIllegalArgumentUserError(error.message)) ||
    (typeof error === 'string' && isIllegalArgumentUserError(error));

  return { isUserError };
};
