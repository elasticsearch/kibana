/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';

/**
 * No-op i18n implementation for the standalone package.
 *
 * Source components call `i18n.translate()` and render `<FormattedMessage>` for
 * internal labels. Without the Kibana i18n runtime, these stubs render the
 * `defaultMessage` (with `{placeholder}` interpolation) so the component works
 * out of the box for non-Kibana consumers.
 */

/** No-op `i18n.translate` that returns `defaultMessage` with interpolated values. */
export const translate = (
  _id: string,
  options?: { defaultMessage?: string; values?: Record<string, unknown> }
) => {
  const msg = options?.defaultMessage ?? _id;

  if (options?.values) {
    return Object.entries(options.values).reduce(
      (result, [key, val]) => result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val)),
      msg
    );
  }

  return msg;
};

/** No-op `FormattedMessage` component that renders `defaultMessage`. */
export const FormattedMessage: React.FC<{
  id: string;
  defaultMessage?: string;
  values?: Record<string, unknown>;
}> = ({ id, defaultMessage, values }) => {
  if (values && defaultMessage) {
    return (
      <>
        {Object.entries(values).reduce(
          (msg, [key, val]) => msg.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val)),
          defaultMessage
        )}
      </>
    );
  }
  return <>{defaultMessage ?? id}</>;
};

/** No-op `I18nProvider` that renders children unchanged. */
export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export const i18n = { translate };
