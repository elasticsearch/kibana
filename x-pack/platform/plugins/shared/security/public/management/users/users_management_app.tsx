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
import { Redirect } from 'react-router-dom';

import type { CoreStart, StartServicesAccessor } from '@kbn/core/public';
import { CurrentUserProvider } from '@kbn/core-user-profile-browser';
import { i18n } from '@kbn/i18n';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import type { RegisterManagementAppArgs } from '@kbn/management-plugin/public';
import type { AuthenticationServiceSetup } from '@kbn/security-plugin-types-public';
import { Route, Router, Routes } from '@kbn/shared-ux-router';

import type { BreadcrumbsChangeHandler } from '../../components/breadcrumb';
import {
  Breadcrumb,
  BreadcrumbsProvider,
  createBreadcrumbsChangeHandler,
} from '../../components/breadcrumb';
import { AuthenticationProvider } from '../../components/use_current_user';
import type { PluginStartDependencies } from '../../plugin';
import { ReadonlyBadge } from '../badges/readonly_badge';
import { tryDecodeURIComponent } from '../url_utils';

interface CreateParams {
  authc: AuthenticationServiceSetup;
  getStartServices: StartServicesAccessor<PluginStartDependencies>;
}

export const usersManagementApp = Object.freeze({
  id: 'users',
  create({ authc, getStartServices }: CreateParams) {
    const title = i18n.translate('xpack.security.management.usersTitle', {
      defaultMessage: 'Users',
    });
    return {
      id: this.id,
      order: 10,
      title,
      async mount({ element, setBreadcrumbs, history }) {
        const [
          [coreStart],
          { UsersGridPage },
          { CreateUserPage, EditUserPage },
          { UserAPIClient },
          { RolesAPIClient },
        ] = await Promise.all([
          getStartServices(), // TODO: remove this and write test.
          import('./users_grid'),
          import('./edit_user'),
          import('./user_api_client'),
          import('../roles'),
        ]);

        render(
          coreStart.rendering.addContext(
            <Providers
              services={coreStart}
              history={history}
              authc={authc}
              onChange={createBreadcrumbsChangeHandler(coreStart.chrome, setBreadcrumbs)}
            >
              <ReadonlyBadge
                featureId="users"
                tooltip={i18n.translate('xpack.security.management.users.readonlyTooltip', {
                  defaultMessage: 'Unable to create or edit users',
                })}
              />
              <Breadcrumb
                text={i18n.translate('xpack.security.users.breadcrumb', {
                  defaultMessage: 'Users',
                })}
                href="/"
              >
                <Routes>
                  <Route path={['/', '']} exact>
                    <UsersGridPage
                      notifications={coreStart.notifications}
                      userAPIClient={new UserAPIClient(coreStart.http)}
                      rolesAPIClient={new RolesAPIClient(coreStart.http)}
                      history={history}
                      navigateToApp={coreStart.application.navigateToApp}
                      readOnly={!coreStart.application.capabilities.users.save}
                    />
                  </Route>
                  <Route path="/create">
                    <Breadcrumb
                      text={i18n.translate('xpack.security.users.editUserPage.createBreadcrumb', {
                        defaultMessage: 'Create',
                      })}
                      href="/create"
                    >
                      <CreateUserPage />
                    </Breadcrumb>
                  </Route>
                  <Route
                    path="/edit/:username"
                    render={(props) => {
                      // Additional decoding is a workaround for a bug in react-router's version of the `history` module.
                      // See https://github.com/elastic/kibana/issues/82440
                      const username = tryDecodeURIComponent(props.match.params.username);
                      return (
                        <Breadcrumb text={username} href={`/edit/${encodeURIComponent(username)}`}>
                          <EditUserPage username={username} />
                        </Breadcrumb>
                      );
                    }}
                  />
                  <Route path="/edit">
                    <Redirect to="/create" />
                  </Route>
                </Routes>
              </Breadcrumb>
            </Providers>
          ),
          element
        );

        return () => {
          unmountComponentAtNode(element);
        };
      },
    } as RegisterManagementAppArgs;
  },
});

export interface ProvidersProps {
  services: CoreStart;
  history: History;
  authc: AuthenticationServiceSetup;
  onChange?: BreadcrumbsChangeHandler;
}

export const Providers: FC<PropsWithChildren<ProvidersProps>> = ({
  services,
  history,
  authc,
  onChange,
  children,
}) => (
  <KibanaContextProvider services={services}>
    <AuthenticationProvider authc={authc}>
      <CurrentUserProvider authc={authc} userProfile={services.userProfile}>
        <Router history={history}>
          <BreadcrumbsProvider onChange={onChange}>{children}</BreadcrumbsProvider>
        </Router>
      </CurrentUserProvider>
    </AuthenticationProvider>
  </KibanaContextProvider>
);
