/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PackageInfo, PackageListItem } from '../../common';
import { KibanaSavedObjectType } from '../../common/types/models';

export const getDeferredInstallationsCnt = (pkg?: PackageInfo | PackageListItem | null): number => {
  if (!pkg) return 0;

  return pkg && 'installationInfo' in pkg && pkg.installationInfo
    ? (pkg.installationInfo.installed_es?.filter((d) => d.deferred).length ?? 0) +
        // Alert refs are deferred-installed via the Alerting tab, not the Assets tab
        (pkg.installationInfo.installed_kibana?.filter(
          (d) => d.deferred && d.type !== KibanaSavedObjectType.alert
        ).length ?? 0)
    : 0;
};

export const hasDeferredInstallations = (pkg?: PackageInfo | PackageListItem | null): boolean =>
  getDeferredInstallationsCnt(pkg) > 0;
