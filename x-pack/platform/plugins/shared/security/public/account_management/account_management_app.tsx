/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { History } from 'history';
import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import { render, unmountComponentAtNode } from 'react-dom';

import type {
  ApplicationSetup,
  AppMountParameters,
  CoreStart,
  StartServicesAccessor,
} from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { toMountPoint } from '@kbn/react-kibana-mount';
import type { AuthenticationServiceSetup } from '@kbn/security-plugin-types-public';
import { Router } from '@kbn/shared-ux-router';
import { UserProfilesKibanaProvider } from '@kbn/user-profile-components';

import type { SecurityApiClients } from '../components';
import { AuthenticationProvider, SecurityApiClientsProvider } from '../components';
import type { BreadcrumbsChangeHandler } from '../components/breadcrumb';
import { BreadcrumbsProvider } from '../components/breadcrumb';
import type { PluginStartDependencies } from '../plugin';

interface CreateDeps {
  application: ApplicationSetup;
  authc: AuthenticationServiceSetup;
  securityApiClients: SecurityApiClients;
  getStartServices: StartServicesAccessor<PluginStartDependencies>;
}

export const accountManagementApp = Object.freeze({
  id: 'security_account',
  create({ application, authc, getStartServices, securityApiClients }: CreateDeps) {
    application.register({
      id: this.id,
      title: i18n.translate('xpack.security.account.breadcrumb', {
        defaultMessage: 'User settings',
      }),
      visibleIn: [],
      appRoute: '/security/account',
      async mount({ element, history }: AppMountParameters) {
        const [[coreStart], { AccountManagementPage }] = await Promise.all([
          getStartServices(),
          import('./account_management_page'),
        ]);

        render(
          coreStart.rendering.addContext(
            <Providers
              services={coreStart}
              history={history}
              authc={authc}
              securityApiClients={securityApiClients}
            >
              <AccountManagementPage />
            </Providers>
          ),
          element
        );

        return () => unmountComponentAtNode(element);
      },
    });
  },
});

export interface ProvidersProps {
  services: CoreStart;
  history: History;
  authc: AuthenticationServiceSetup;
  securityApiClients: SecurityApiClients;
  onChange?: BreadcrumbsChangeHandler;
}

export const Providers: FC<PropsWithChildren<ProvidersProps>> = ({
  services,
  history,
  authc,
  securityApiClients,
  onChange,
  children,
}) => (
  <KibanaContextProvider services={services}>
    <AuthenticationProvider authc={authc}>
      <SecurityApiClientsProvider {...securityApiClients}>
        <Router history={history}>
          <BreadcrumbsProvider onChange={onChange}>
            <UserProfilesKibanaProvider
              core={services}
              security={{
                userProfiles: securityApiClients.userProfiles,
              }}
              toMountPoint={toMountPoint}
            >
              {children}
            </UserProfilesKibanaProvider>
          </BreadcrumbsProvider>
        </Router>
      </SecurityApiClientsProvider>
    </AuthenticationProvider>
  </KibanaContextProvider>
);
