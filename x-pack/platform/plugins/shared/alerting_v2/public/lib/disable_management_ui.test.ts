/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ManagementSection, ManagementApp } from '@kbn/management-plugin/public';
import { disableAlertingManagementUi } from './disable_management_ui';

const createSectionWithApps = (appIds: string[]): ManagementSection => {
  const section = new ManagementSection({ id: 'alertingV2', title: 'V2 Alerting Preview' });

  appIds.forEach((id) => {
    section.apps.push(
      new ManagementApp({
        id,
        title: id,
        basePath: `/${section.id}/${id}`,
        mount: async () => () => {},
      })
    );
  });

  return section;
};

describe('disableAlertingManagementUi', () => {
  it('disables the section', () => {
    const section = createSectionWithApps([]);
    expect(section.enabled).toBe(true);

    disableAlertingManagementUi(section);

    expect(section.enabled).toBe(false);
  });

  it('disables every app registered under the section', () => {
    const section = createSectionWithApps([
      'rules',
      'episodes',
      'action_policies',
      'execution_history',
    ]);
    expect(section.apps.every((app) => app.enabled)).toBe(true);

    disableAlertingManagementUi(section);

    expect(section.apps.every((app) => app.enabled === false)).toBe(true);
  });

  it('is a no-op for apps when the section has none', () => {
    const section = createSectionWithApps([]);

    expect(() => disableAlertingManagementUi(section)).not.toThrow();
    expect(section.enabled).toBe(false);
    expect(section.apps).toHaveLength(0);
  });
});
