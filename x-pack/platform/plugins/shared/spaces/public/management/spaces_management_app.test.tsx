/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

jest.mock('./spaces_grid', () => ({
  SpacesGridPage: (props: any) => `Spaces Page: ${JSON.stringify(props)}`,
}));

jest.mock('./create_space', () => ({
  CreateSpacePage: (props: any) => {
    if (props.spacesManager && props.onLoadSpace) {
      props.spacesManager.getSpace().then((space: any) => props.onLoadSpace(space));
    }
    return `Spaces Create Page: ${JSON.stringify(props)}`;
  },
}));

jest.mock('./edit_space', () => ({
  EditSpacePage: (props: any) => {
    if (props.spacesManager && props.onLoadSpace) {
      props.spacesManager.getSpace().then((space: any) => props.onLoadSpace(space));
    }
    return `Spaces Edit Page: ${JSON.stringify(props)}`;
  },
}));

import {
  coreMock,
  loggingSystemMock,
  scopedHistoryMock,
  themeServiceMock,
} from '@kbn/core/public/mocks';
import { featuresPluginMock } from '@kbn/features-plugin/public/mocks';

import { spacesManagementApp } from './spaces_management_app';
import { EventTracker } from '../analytics';
import type { ConfigType } from '../config';
import type { PluginsStart } from '../plugin';
import { spacesManagerMock } from '../spaces_manager/mocks';

const config: ConfigType = {
  maxSpaces: 1000,
  allowFeatureVisibility: true,
  allowSolutionVisibility: true,
};

const eventTracker = new EventTracker({ reportEvent: jest.fn() });
const logger = loggingSystemMock.createLogger();

async function mountApp(basePath: string, pathname: string, spaceId?: string) {
  const container = document.createElement('div');
  const setBreadcrumbs = jest.fn();

  const spacesManager = spacesManagerMock.create();
  if (spaceId) {
    spacesManager.getSpace.mockResolvedValue({
      id: spaceId,
      name: `space with id ${spaceId}`,
      disabledFeatures: [],
    });
  }

  const [coreStart, pluginsStart] = await coreMock.createSetup().getStartServices();
  (pluginsStart as PluginsStart).features = featuresPluginMock.createStart();

  const unmount = await spacesManagementApp
    .create({
      spacesManager,
      getStartServices: async () => [coreStart, pluginsStart as PluginsStart, {}],
      config,
      logger,
      getIsRoleManagementEnabled: () => Promise.resolve(() => undefined),
      getRolesAPIClient: jest.fn(),
      getPrivilegesAPIClient: jest.fn(),
      getSecurityLicense: jest.fn(),
      eventTracker,
      isServerless: false,
    })
    .mount({
      basePath,
      element: container,
      setBreadcrumbs,
      history: scopedHistoryMock.create({ pathname }),
      theme: coreStart.theme,
      theme$: themeServiceMock.createTheme$(), // needed as a deprecated field in ManagementAppMountParams
    });

  return { unmount, container, setBreadcrumbs, docTitle: coreStart.chrome.docTitle };
}

describe('spacesManagementApp', () => {
  it('create() returns proper management app descriptor', () => {
    expect(
      spacesManagementApp.create({
        spacesManager: spacesManagerMock.create(),
        getStartServices: coreMock.createSetup().getStartServices as any,
        config,
        logger,
        getIsRoleManagementEnabled: () => Promise.resolve(() => undefined),
        getRolesAPIClient: jest.fn(),
        getPrivilegesAPIClient: jest.fn(),
        getSecurityLicense: jest.fn(),
        eventTracker,
        isServerless: false,
      })
    ).toMatchInlineSnapshot(`
      Object {
        "id": "spaces",
        "mount": [Function],
        "order": 2,
        "title": "Spaces",
      }
    `);
  });

  it('mount() works for the `grid` page', async () => {
    const { setBreadcrumbs, container, unmount, docTitle } = await mountApp('/', '/');

    expect(setBreadcrumbs).toHaveBeenCalledTimes(1);
    expect(setBreadcrumbs).toHaveBeenCalledWith([{ text: 'Spaces' }]);
    expect(docTitle.change).toHaveBeenCalledWith('Spaces');
    expect(docTitle.reset).not.toHaveBeenCalled();
    expect(container).toMatchInlineSnapshot(`
      <div>
        <div
          class="css-qvyf25-redirectAppLinksStyles"
          data-test-subj="kbnRedirectAppLink"
        >
          Spaces Page: {"capabilities":{"catalogue":{},"management":{},"navLinks":{}},"notifications":{"toasts":{},"feedback":{},"tours":{}},"spacesManager":{"onActiveSpaceChange$":{}},"serverBasePath":"","history":{"action":"PUSH","length":1,"location":{"pathname":"/","search":"","hash":""}},"maxSpaces":1000,"allowSolutionVisibility":true,"isServerless":false}
        </div>
      </div>
    `);

    unmount();

    expect(docTitle.reset).toHaveBeenCalledTimes(1);
    expect(container).toMatchInlineSnapshot(`<div />`);
  });

  it('mount() works for the `create space` page', async () => {
    const { setBreadcrumbs, container, unmount, docTitle } = await mountApp('/', '/create');

    expect(setBreadcrumbs).toHaveBeenCalledTimes(1);
    expect(setBreadcrumbs).toHaveBeenCalledWith([
      { href: `/`, text: 'Spaces' },
      { text: 'Create' },
    ]);
    expect(docTitle.change).toHaveBeenCalledWith('Spaces');
    expect(docTitle.reset).not.toHaveBeenCalled();
    expect(container).toMatchInlineSnapshot(`
      <div>
        <div
          class="css-qvyf25-redirectAppLinksStyles"
          data-test-subj="kbnRedirectAppLink"
        >
          Spaces Create Page: {"capabilities":{"catalogue":{},"management":{},"navLinks":{}},"notifications":{"toasts":{},"feedback":{},"tours":{}},"spacesManager":{"onActiveSpaceChange$":{}},"history":{"action":"PUSH","length":1,"location":{"pathname":"/create","search":"","hash":""}},"allowFeatureVisibility":true,"allowSolutionVisibility":true,"eventTracker":{"analytics":{}}}
        </div>
      </div>
    `);

    unmount();
    expect(docTitle.reset).toHaveBeenCalledTimes(1);

    expect(container).toMatchInlineSnapshot(`<div />`);
  });

  it('mount() works for the `edit space` page', async () => {
    const spaceId = 'some-space';

    const { setBreadcrumbs, container, unmount, docTitle } = await mountApp(
      '/',
      `/edit/${spaceId}`,
      spaceId
    );

    expect(setBreadcrumbs).toHaveBeenCalledTimes(1);
    expect(setBreadcrumbs).toHaveBeenCalledWith([
      { href: `/`, text: 'Spaces' },
      { text: `Edit "space with id some-space"` },
    ]);
    expect(docTitle.change).toHaveBeenCalledWith('Spaces');
    expect(docTitle.reset).not.toHaveBeenCalled();
    expect(container).toMatchInlineSnapshot(`
      <div>
        <div
          class="css-qvyf25-redirectAppLinksStyles"
          data-test-subj="kbnRedirectAppLink"
        >
          Spaces Edit Page: {"capabilities":{"catalogue":{},"management":{},"navLinks":{}},"serverBasePath":"","http":{"spaceId":"default","basePath":{"basePath":"","serverBasePath":"","assetsHrefBase":""},"anonymousPaths":{},"externalUrl":{},"staticAssets":{}},"overlays":{"banners":{}},"notifications":{"toasts":{},"feedback":{},"tours":{}},"userProfile":{"dataUpdates$":{}},"theme":{"theme$":{}},"i18n":{},"logger":{"context":[]},"spacesManager":{"onActiveSpaceChange$":{}},"spaceId":"some-space","history":{"action":"PUSH","length":1,"location":{"pathname":"/edit/some-space","search":"","hash":""}},"allowFeatureVisibility":true,"allowSolutionVisibility":true,"enableSecurityLink":"https://www.elastic.co/docs/deploy-manage/security/set-up-minimal-security#_enable_es_security_features"}
        </div>
      </div>
    `);

    unmount();
    expect(docTitle.reset).toHaveBeenCalledTimes(1);

    expect(container).toMatchInlineSnapshot(`<div />`);
  });
});
