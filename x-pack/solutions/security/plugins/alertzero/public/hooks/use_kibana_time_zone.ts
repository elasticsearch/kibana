/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { IUiSettingsClient } from '@kbn/core/public';

/**
 * The timezone every user-facing timestamp in this plugin should be rendered in.
 *
 * `Intl` defaults to the *operating system's* timezone, which is not necessarily
 * the one the rest of Kibana renders in: `dateFormat:tz` is an advanced setting a
 * user or an admin can pin independently. Formatting against the OS default makes
 * this plugin's timestamps disagree with every other timestamp on the page.
 *
 * Returns `undefined` for the `'Browser'` setting (the default), which is exactly
 * what `Intl.DateTimeFormatOptions.timeZone` wants for "use the browser's".
 */
export const useKibanaTimeZone = (): string | undefined => {
  const { services } = useKibana<{ uiSettings?: IUiSettingsClient }>();
  const timeZone = services.uiSettings?.get<string>('dateFormat:tz');

  return !timeZone || timeZone === 'Browser' ? undefined : timeZone;
};
