/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { sortBy } from 'lodash';
import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import type { Subscription } from 'rxjs';
import { BehaviorSubject, map, ReplaySubject, takeUntil } from 'rxjs';

import type { CoreStart } from '@kbn/core/public';
import { CurrentUserProvider } from '@kbn/core-user-profile-browser';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import type {
  AuthenticationServiceSetup,
  SecurityNavControlServiceStart,
  UserMenuLink,
} from '@kbn/security-plugin-types-public';
import { RedirectAppLinks } from '@kbn/shared-ux-link-redirect-app';

import { SecurityNavControl } from './nav_control_component';
import { UserMenuComponent } from './user_menu_component';
import type { SecurityLicense } from '../../common';
import type { SecurityApiClients } from '../components';
import { AuthenticationProvider, SecurityApiClientsProvider } from '../components';

interface SetupDeps {
  securityLicense: SecurityLicense;
  logoutUrl: string;
  securityApiClients: SecurityApiClients;
}

interface StartDeps {
  core: CoreStart;
  authc: AuthenticationServiceSetup;
}

export class SecurityNavControlService {
  private securityLicense!: SecurityLicense;
  private logoutUrl!: string;
  private securityApiClients!: SecurityApiClients;

  private navControlRegistered!: boolean;

  private securityFeaturesSubscription?: Subscription;

  private readonly stop$ = new ReplaySubject<void>(1);
  private userMenuLinks$ = new BehaviorSubject<UserMenuLink[]>([]);

  public setup({ securityLicense, logoutUrl, securityApiClients }: SetupDeps) {
    this.securityLicense = securityLicense;
    this.logoutUrl = logoutUrl;
    this.securityApiClients = securityApiClients;
  }

  public start({ core, authc }: StartDeps): SecurityNavControlServiceStart {
    this.securityFeaturesSubscription = this.securityLicense.features$.subscribe(
      ({ showLinks }) => {
        const isAnonymousPath = core.http.anonymousPaths.isAnonymous(window.location.pathname);

        const shouldRegisterNavControl =
          !isAnonymousPath && showLinks && !this.navControlRegistered;
        if (shouldRegisterNavControl) {
          this.registerSecurityNavControl(core, authc);
        }
      }
    );

    return {
      getUserMenuLinks$: () =>
        this.userMenuLinks$.pipe(map(this.sortUserMenuLinks), takeUntil(this.stop$)),
      addUserMenuLinks: (userMenuLinks: UserMenuLink[]) => {
        const currentLinks = this.userMenuLinks$.value;
        const hasCustomProfileLink = currentLinks.find(({ setAsProfile }) => setAsProfile === true);
        const passedCustomProfileLinkCount = userMenuLinks.filter(
          ({ setAsProfile }) => setAsProfile === true
        ).length;

        if (hasCustomProfileLink && passedCustomProfileLinkCount > 0) {
          throw new Error(
            `Only one custom profile link can be set. A custom profile link named ${hasCustomProfileLink.label} (${hasCustomProfileLink.href}) already exists`
          );
        }

        if (passedCustomProfileLinkCount > 1) {
          throw new Error(
            `Only one custom profile link can be passed at a time (found ${passedCustomProfileLinkCount})`
          );
        }

        const newLinks = [...currentLinks, ...userMenuLinks];
        this.userMenuLinks$.next(newLinks);
      },
    };
  }

  public stop() {
    if (this.securityFeaturesSubscription) {
      this.securityFeaturesSubscription.unsubscribe();
      this.securityFeaturesSubscription = undefined;
    }
    this.navControlRegistered = false;
    this.stop$.next();
  }

  private registerSecurityNavControl(core: CoreStart, authc: AuthenticationServiceSetup) {
    core.chrome.navControls.registerRight({
      order: 4000,
      content: (
        <Providers services={core} authc={authc} securityApiClients={this.securityApiClients}>
          <SecurityNavControl
            editProfileUrl={core.http.basePath.prepend('/security/account')}
            logoutUrl={this.logoutUrl}
            userMenuLinks$={this.userMenuLinks$}
          />
        </Providers>
      ),
    });

    if (core.chrome.next.isEnabled) {
      this.registerChromeNextUserMenu(core, authc);
    }

    this.navControlRegistered = true;
  }

  private registerChromeNextUserMenu(core: CoreStart, authc: AuthenticationServiceSetup) {
    core.chrome.next.userMenu.set(
      <Providers services={core} authc={authc} securityApiClients={this.securityApiClients}>
        <SecurityNavControl
          editProfileUrl={core.http.basePath.prepend('/security/account')}
          logoutUrl={this.logoutUrl}
          userMenuLinks$={this.userMenuLinks$}
          renderButton={(props) => <UserMenuComponent {...props} />}
          avatarSize="m"
        />
      </Providers>
    );
  }

  private sortUserMenuLinks(userMenuLinks: UserMenuLink[]) {
    return sortBy(userMenuLinks, 'order');
  }
}

export interface ProvidersProps {
  authc: AuthenticationServiceSetup;
  services: CoreStart;
  securityApiClients: SecurityApiClients;
}

export const Providers: FC<PropsWithChildren<ProvidersProps>> = ({
  authc,
  services,
  securityApiClients,
  children,
}) => (
  <KibanaContextProvider services={services}>
    <AuthenticationProvider authc={authc}>
      <SecurityApiClientsProvider {...securityApiClients}>
        <CurrentUserProvider authc={authc} userProfile={services.userProfile}>
          <RedirectAppLinks coreStart={services}>{children}</RedirectAppLinks>
        </CurrentUserProvider>
      </SecurityApiClientsProvider>
    </AuthenticationProvider>
  </KibanaContextProvider>
);
