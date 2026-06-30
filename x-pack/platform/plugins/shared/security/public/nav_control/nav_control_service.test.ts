/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { BehaviorSubject } from 'rxjs';

import type { httpServiceMock } from '@kbn/core/public/mocks';
import { coreMock } from '@kbn/core/public/mocks';
import type { ILicense } from '@kbn/licensing-types';

import { SecurityNavControlService } from './nav_control_service';
import { SecurityLicenseService } from '../../common/licensing';
import { UserProfileAPIClient } from '../account_management';
import { authenticationMock } from '../authentication/index.mock';
import * as UseCurrentUserImports from '../components/use_current_user';
import { UserAPIClient } from '../management';

const useUserProfileMock = jest.spyOn(UseCurrentUserImports, 'useUserProfile');

useUserProfileMock.mockReturnValue({
  loading: true,
});

const validLicense = {
  isAvailable: true,
  getFeature: (feature) => {
    expect(feature).toEqual('security');

    return {
      isAvailable: true,
      isEnabled: true,
    };
  },
  hasAtLeast: (...candidates) => true,
} as ILicense;

const authc = authenticationMock.createStart();

const mockApiClients = (http: ReturnType<typeof httpServiceMock.createStartContract>) => ({
  userProfiles: new UserProfileAPIClient(http),
  users: new UserAPIClient(http),
});

describe('SecurityNavControlService', () => {
  it('registers a ReactNode content for the nav control', () => {
    const license$ = new BehaviorSubject<ILicense>(validLicense);
    const coreStart = coreMock.createStart();

    const navControlService = new SecurityNavControlService();
    navControlService.setup({
      securityLicense: new SecurityLicenseService().setup({ license$ }).license,
      logoutUrl: '/some/logout/url',
      securityApiClients: mockApiClients(coreStart.http),
    });

    coreStart.chrome.navControls.registerRight = jest.fn();

    navControlService.start({ core: coreStart, authc });
    expect(coreStart.chrome.navControls.registerRight).toHaveBeenCalledTimes(1);
    const [{ content }] = coreStart.chrome.navControls.registerRight.mock.calls[0];

    expect(React.isValidElement(content)).toBe(true);
  });

  it('should register the nav control once the license supports it', () => {
    const license$ = new BehaviorSubject<ILicense>({} as ILicense);
    const coreStart = coreMock.createStart();

    const navControlService = new SecurityNavControlService();
    navControlService.setup({
      securityLicense: new SecurityLicenseService().setup({ license$ }).license,
      logoutUrl: '/some/logout/url',
      securityApiClients: mockApiClients(coreStart.http),
    });

    navControlService.start({ core: coreStart, authc });

    expect(coreStart.chrome.navControls.registerRight).not.toHaveBeenCalled();

    license$.next(validLicense);

    expect(coreStart.chrome.navControls.registerRight).toHaveBeenCalled();
  });

  it('should not register the nav control for anonymous paths', () => {
    const license$ = new BehaviorSubject<ILicense>(validLicense);
    const coreStart = coreMock.createStart();

    const navControlService = new SecurityNavControlService();
    navControlService.setup({
      securityLicense: new SecurityLicenseService().setup({ license$ }).license,
      logoutUrl: '/some/logout/url',
      securityApiClients: mockApiClients(coreStart.http),
    });

    coreStart.http.anonymousPaths.isAnonymous.mockReturnValue(true);
    navControlService.start({ core: coreStart, authc });

    expect(coreStart.chrome.navControls.registerRight).not.toHaveBeenCalled();
  });

  it('should only register the nav control once', () => {
    const license$ = new BehaviorSubject<ILicense>(validLicense);
    const coreStart = coreMock.createStart();

    const navControlService = new SecurityNavControlService();
    navControlService.setup({
      securityLicense: new SecurityLicenseService().setup({ license$ }).license,
      logoutUrl: '/some/logout/url',
      securityApiClients: mockApiClients(coreStart.http),
    });

    navControlService.start({ core: coreStart, authc });

    expect(coreStart.chrome.navControls.registerRight).toHaveBeenCalledTimes(1);

    // trigger license change
    license$.next({} as ILicense);
    license$.next(validLicense);

    expect(coreStart.chrome.navControls.registerRight).toHaveBeenCalledTimes(1);
  });

  it('should allow for re-registration if the service is restarted', () => {
    const license$ = new BehaviorSubject<ILicense>(validLicense);
    const coreStart = coreMock.createStart();

    const navControlService = new SecurityNavControlService();
    navControlService.setup({
      securityLicense: new SecurityLicenseService().setup({ license$ }).license,
      logoutUrl: '/some/logout/url',
      securityApiClients: mockApiClients(coreStart.http),
    });

    navControlService.start({ core: coreStart, authc });

    expect(coreStart.chrome.navControls.registerRight).toHaveBeenCalledTimes(1);

    navControlService.stop();

    navControlService.start({ core: coreStart, authc });
    expect(coreStart.chrome.navControls.registerRight).toHaveBeenCalledTimes(2);
  });

  it('should register Chrome Next user menu when next.isEnabled is true', () => {
    const license$ = new BehaviorSubject<ILicense>(validLicense);
    const coreStart = coreMock.createStart();
    Object.defineProperty(coreStart.chrome.next, 'isEnabled', { value: true });
    const navControlService = new SecurityNavControlService();

    navControlService.setup({
      securityLicense: new SecurityLicenseService().setup({ license$ }).license,
      logoutUrl: '/some/logout/url',
      securityApiClients: mockApiClients(coreStart.http),
    });
    navControlService.start({ core: coreStart, authc });

    expect(coreStart.chrome.navControls.registerRight).toHaveBeenCalledTimes(1);
    expect(coreStart.chrome.next.userMenu.set).toHaveBeenCalledTimes(1);
    const content = coreStart.chrome.next.userMenu.set.mock.calls[0][0];
    expect(React.isValidElement(content)).toBe(true);
  });

  it('should not register Chrome Next user menu when next.isEnabled is false', () => {
    const license$ = new BehaviorSubject<ILicense>(validLicense);
    const coreStart = coreMock.createStart();
    const navControlService = new SecurityNavControlService();

    navControlService.setup({
      securityLicense: new SecurityLicenseService().setup({ license$ }).license,
      logoutUrl: '/some/logout/url',
      securityApiClients: mockApiClients(coreStart.http),
    });
    navControlService.start({ core: coreStart, authc });

    expect(coreStart.chrome.navControls.registerRight).toHaveBeenCalledTimes(1);
    expect(coreStart.chrome.next.userMenu.set).not.toHaveBeenCalled();
  });

  describe(`#start`, () => {
    let navControlService: SecurityNavControlService;
    beforeEach(() => {
      const coreSetup = coreMock.createSetup();
      const license$ = new BehaviorSubject<ILicense>({} as ILicense);

      navControlService = new SecurityNavControlService();
      navControlService.setup({
        securityLicense: new SecurityLicenseService().setup({ license$ }).license,
        logoutUrl: '/some/logout/url',
        securityApiClients: mockApiClients(coreSetup.http),
      });
    });

    it('should return functions to register and retrieve user menu links', () => {
      const coreStart = coreMock.createStart();
      const navControlServiceStart = navControlService.start({ core: coreStart, authc });
      expect(navControlServiceStart).toHaveProperty('getUserMenuLinks$');
      expect(navControlServiceStart).toHaveProperty('addUserMenuLinks');
    });

    it('should register custom user menu links to be displayed in the nav controls', (done) => {
      const coreStart = coreMock.createStart();
      const { getUserMenuLinks$, addUserMenuLinks } = navControlService.start({
        core: coreStart,
        authc,
      });
      const userMenuLinks$ = getUserMenuLinks$();

      addUserMenuLinks([
        {
          label: 'link1',
          href: 'path-to-link1',
          iconType: 'empty',
        },
      ]);

      userMenuLinks$.subscribe((links) => {
        expect(links).toMatchInlineSnapshot(`
          Array [
            Object {
              "href": "path-to-link1",
              "iconType": "empty",
              "label": "link1",
            },
          ]
        `);
        done();
      });
    });

    it('should retrieve user menu links sorted by order', (done) => {
      const coreStart = coreMock.createStart();
      const { getUserMenuLinks$, addUserMenuLinks } = navControlService.start({
        core: coreStart,
        authc,
      });
      const userMenuLinks$ = getUserMenuLinks$();

      addUserMenuLinks([
        {
          label: 'link3',
          href: 'path-to-link3',
          iconType: 'empty',
          order: 3,
        },
        {
          label: 'link1',
          href: 'path-to-link1',
          iconType: 'empty',
          order: 1,
        },
        {
          label: 'link2',
          href: 'path-to-link2',
          iconType: 'empty',
          order: 2,
        },
      ]);
      addUserMenuLinks([
        {
          label: 'link4',
          href: 'path-to-link4',
          iconType: 'empty',
          order: 4,
        },
      ]);

      userMenuLinks$.subscribe((links) => {
        expect(links).toMatchInlineSnapshot(`
          Array [
            Object {
              "href": "path-to-link1",
              "iconType": "empty",
              "label": "link1",
              "order": 1,
            },
            Object {
              "href": "path-to-link2",
              "iconType": "empty",
              "label": "link2",
              "order": 2,
            },
            Object {
              "href": "path-to-link3",
              "iconType": "empty",
              "label": "link3",
              "order": 3,
            },
            Object {
              "href": "path-to-link4",
              "iconType": "empty",
              "label": "link4",
              "order": 4,
            },
          ]
        `);
        done();
      });
    });

    it('should allow adding a custom profile link', () => {
      const coreStart = coreMock.createStart();
      const { getUserMenuLinks$, addUserMenuLinks } = navControlService.start({
        core: coreStart,
        authc,
      });
      const userMenuLinks$ = getUserMenuLinks$();

      addUserMenuLinks([
        { label: 'link3', href: 'path-to-link3', iconType: 'empty', order: 3 },
        { label: 'link1', href: 'path-to-link1', iconType: 'empty', order: 1, setAsProfile: true },
      ]);

      const onUserMenuLinksHandler = jest.fn();
      userMenuLinks$.subscribe(onUserMenuLinksHandler);

      expect(onUserMenuLinksHandler).toHaveBeenCalledTimes(1);
      expect(onUserMenuLinksHandler).toHaveBeenCalledWith([
        { label: 'link1', href: 'path-to-link1', iconType: 'empty', order: 1, setAsProfile: true },
        { label: 'link3', href: 'path-to-link3', iconType: 'empty', order: 3 },
      ]);
    });

    it('should not allow adding more than one custom profile link', () => {
      const coreStart = coreMock.createStart();
      const { getUserMenuLinks$, addUserMenuLinks } = navControlService.start({
        core: coreStart,
        authc,
      });
      const userMenuLinks$ = getUserMenuLinks$();

      expect(() => {
        addUserMenuLinks([
          {
            label: 'link3',
            href: 'path-to-link3',
            iconType: 'empty',
            order: 3,
            setAsProfile: true,
          },
          {
            label: 'link1',
            href: 'path-to-link1',
            iconType: 'empty',
            order: 1,
            setAsProfile: true,
          },
        ]);
      }).toThrowErrorMatchingInlineSnapshot(
        `"Only one custom profile link can be passed at a time (found 2)"`
      );

      // Adding a single custom profile link.
      addUserMenuLinks([
        { label: 'link3', href: 'path-to-link3', iconType: 'empty', order: 3, setAsProfile: true },
      ]);

      expect(() => {
        addUserMenuLinks([
          {
            label: 'link1',
            href: 'path-to-link1',
            iconType: 'empty',
            order: 1,
            setAsProfile: true,
          },
        ]);
      }).toThrowErrorMatchingInlineSnapshot(
        `"Only one custom profile link can be set. A custom profile link named link3 (path-to-link3) already exists"`
      );

      const onUserMenuLinksHandler = jest.fn();
      userMenuLinks$.subscribe(onUserMenuLinksHandler);

      expect(onUserMenuLinksHandler).toHaveBeenCalledTimes(1);
      expect(onUserMenuLinksHandler).toHaveBeenCalledWith([
        { label: 'link3', href: 'path-to-link3', iconType: 'empty', order: 3, setAsProfile: true },
      ]);
    });
  });
});
