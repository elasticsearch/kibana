/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InternalChromeStart } from '@kbn/core-chrome-browser-internal';
import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import type {
  NavigationTreeDefinition,
  SolutionId,
  NavTreeExtensionSlotDataSources,
} from '@kbn/core-chrome-browser';
import type { Observable } from 'rxjs';
import { from, map } from 'rxjs';
import { generateManageOrgMembersNavCard, manageOrgMembersNavCardName } from './navigation';
import type {
  ServerlessPluginSetup,
  ServerlessPluginSetupDependencies,
  ServerlessPluginStart,
  ServerlessPluginStartDependencies,
} from './types';

export class ServerlessPlugin
  implements
    Plugin<
      ServerlessPluginSetup,
      ServerlessPluginStart,
      ServerlessPluginSetupDependencies,
      ServerlessPluginStartDependencies
    >
{
  constructor() {}

  public setup(
    _core: CoreSetup,
    _dependencies: ServerlessPluginSetupDependencies
  ): ServerlessPluginSetup {
    return {};
  }

  public start(
    core: CoreStart,
    dependencies: ServerlessPluginStartDependencies
  ): ServerlessPluginStart {
    const { chrome } = core;

    // Casting the "chrome.project" service to an "internal" type: this is intentional to obscure the property from Typescript.
    const { project } = chrome as InternalChromeStart;
    const { cloud } = dependencies;

    chrome.setChromeStyle('project');

    if (cloud.serverless.projectName) {
      project.setKibanaName(cloud.serverless.projectName);
    }

    project.setCloudUrls(cloud.getUrls()); // Ensure the project has the non-privileged URLs immediately

    // Wraps a single Promise — emits once when privileged URLs resolve, then completes.
    // Privileged URL visibility (e.g., Members link gated on manage_security) is evaluated
    // once at plugin start and not re-evaluated for the lifetime of the page.
    const privilegedUrls$ = from(cloud.getPrivilegedUrls());

    privilegedUrls$.subscribe((privilegedUrls) => {
      if (Object.keys(privilegedUrls).length === 0) return;

      project.setCloudUrls({ ...privilegedUrls, ...cloud.getUrls() }); // Merge the privileged URLs once available
    });

    return {
      initNavigation: <TTree extends NavigationTreeDefinition>(
        id: SolutionId,
        navigationTree$: Observable<TTree>,
        slotDataSources?: NavTreeExtensionSlotDataSources<TTree>
      ) => {
        project.initNavigation(id, navigationTree$, slotDataSources);
      },
      setBreadcrumbs: (breadcrumbs, params) => project.setBreadcrumbs(breadcrumbs, params),
      getNavigationCards$: (roleManagementEnabled, extendCardNavDefinitions) => {
        return privilegedUrls$.pipe(
          map((privilegedUrls) => {
            if (!roleManagementEnabled) return extendCardNavDefinitions;

            const { usersAndRolesUrl } = privilegedUrls;
            if (!usersAndRolesUrl) return extendCardNavDefinitions;

            const manageOrgMembersNavCard = generateManageOrgMembersNavCard(usersAndRolesUrl);
            if (extendCardNavDefinitions) {
              return {
                ...extendCardNavDefinitions,
                [manageOrgMembersNavCardName]: manageOrgMembersNavCard,
              };
            }
            return { [manageOrgMembersNavCardName]: manageOrgMembersNavCard };
          })
        );
      },
    };
  }

  public stop() {}
}
