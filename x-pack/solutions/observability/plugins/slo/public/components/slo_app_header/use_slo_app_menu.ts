/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppHeaderMenu } from '@kbn/app-header';
import { i18n } from '@kbn/i18n';
import { enableInspectEsQueries } from '@kbn/observability-plugin/public';
import { useInspectorContext } from '@kbn/observability-shared-plugin/public';
import { paths } from '@kbn/slo-shared-plugin/common/locators/paths';
import { useMemo } from 'react';
import { useKibana } from '../../hooks/use_kibana';
import { usePluginContext } from '../../hooks/use_plugin_context';

export type SloAppMenuItemId = 'settings' | 'management' | 'inspect' | 'annotations';

export function useSloAppMenu({
  hiddenItemIds = [],
}: {
  hiddenItemIds?: readonly SloAppMenuItemId[];
} = {}): { items: NonNullable<AppHeaderMenu['items']>; docLink: string } {
  const { http, docLinks, inspector, uiSettings } = useKibana().services;
  const { isDev } = usePluginContext();
  const inspectorContext = useInspectorContext();
  const inspectorAdapters = inspectorContext?.inspectorAdapters;
  const isInspectorEnabled = Boolean(uiSettings?.get<boolean>(enableInspectEsQueries));

  const items = useMemo<NonNullable<AppHeaderMenu['items']>>(() => {
    const menuItems: NonNullable<AppHeaderMenu['items']> = [
      {
        id: 'settings',
        label: i18n.translate('xpack.slo.headerMenu.settings', {
          defaultMessage: 'Settings',
        }),
        iconType: 'gear',
        href: http.basePath.prepend(paths.slosSettings),
        testId: 'sloHeaderSettingsLink',
      },
      {
        id: 'management',
        label: i18n.translate('xpack.slo.home.manage', {
          defaultMessage: 'Manage SLOs',
        }),
        iconType: 'tableOfContents',
        href: http.basePath.prepend(paths.slosManagement),
        testId: 'sloHeaderManageLink',
      },
    ];

    if (isInspectorEnabled || isDev) {
      menuItems.push({
        id: 'inspect',
        label: i18n.translate('xpack.slo.inspectButtonText', {
          defaultMessage: 'Inspect',
        }),
        iconType: 'inspect',
        overflow: true,
        testId: 'sloInspectHeaderLink',
        run: () => {
          if (inspectorAdapters) {
            inspector.open(inspectorAdapters);
          }
        },
      });
    }

    menuItems.push({
      id: 'annotations',
      label: i18n.translate('xpack.slo.home.annotations', {
        defaultMessage: 'Annotations',
      }),
      iconType: 'folderOpen',
      overflow: true,
      href: http.basePath.prepend('/app/observability/annotations'),
      testId: 'sloHeaderAnnotationsLink',
    });

    return menuItems.filter((item) => !hiddenItemIds.includes(item.id as SloAppMenuItemId));
  }, [hiddenItemIds, http.basePath, inspector, inspectorAdapters, isDev, isInspectorEnabled]);

  return {
    items,
    docLink: docLinks.links.observability.slo,
  };
}
