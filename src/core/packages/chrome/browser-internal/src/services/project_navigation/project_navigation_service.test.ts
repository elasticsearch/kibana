/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createMemoryHistory } from 'history';
import {
  firstValueFrom,
  lastValueFrom,
  take,
  map,
  BehaviorSubject,
  of,
  type Observable,
} from 'rxjs';
import { loggerMock } from '@kbn/logging-mocks';
import type {
  ChromeNavLinks,
  ChromeNavLink,
  ChromeBreadcrumb,
  AppDeepLinkId,
  ChromeProjectNavigationNode,
  NavigationTreeDefinition,
} from '@kbn/core-chrome-browser';
import { ProjectNavigationService } from './project_navigation_service';

jest.mock('rxjs', () => {
  const original = jest.requireActual('rxjs');
  return {
    ...original,
    debounceTime: () => (source: Observable<any>) => source,
  };
});

const getNavLink = (partial: Partial<ChromeNavLink> = {}): ChromeNavLink => ({
  id: 'kibana',
  title: 'Kibana',
  baseUrl: '/app',
  url: `/app/${partial.id ?? 'kibana'}`,
  href: `/app/${partial.id ?? 'kibana'}`,
  visibleIn: ['globalSearch', 'classicSideNav', 'projectSideNav'],
  ...partial,
});

const getNavLinksService = (ids: Readonly<string[]> = []) => {
  const navLinks = ids.map((id) => getNavLink({ id, title: id.toUpperCase() }));

  const navLinksMock: jest.Mocked<ChromeNavLinks> = {
    getNavLinks$: jest.fn().mockReturnValue(of(navLinks)),
    has: jest.fn(),
    get: jest.fn(),
    getAll: jest.fn().mockReturnValue(navLinks),
  };
  return navLinksMock;
};

const logger = loggerMock.create();

const setup = ({
  locationPathName = '/',
  navLinkIds,
  isServerless = true,
  isNextChrome = false,
}: {
  locationPathName?: string;
  navLinkIds?: Readonly<string[]>;
  isServerless?: boolean;
  isNextChrome?: boolean;
} = {}) => {
  const history = createMemoryHistory({
    initialEntries: [locationPathName],
  });
  history.replace(locationPathName);

  const projectNavigationService = new ProjectNavigationService(isServerless);
  const chromeBreadcrumbs$ = new BehaviorSubject<ChromeBreadcrumb[]>([]);
  const navLinksService = getNavLinksService(navLinkIds);

  const projectNavigation = projectNavigationService.start({
    history,
    prependBasePath: (p) => p,
    navLinks: navLinksService,
    getUiSettingsHomeRoute: () => undefined,
    logger,
    chromeBreadcrumbs$,
    isNextChrome,
  });

  return { projectNavigation, history, chromeBreadcrumbs$, navLinksService };
};

describe('initNavigation()', () => {
  const setupInitNavigation = () => {
    const { projectNavigation } = setup({
      navLinkIds: ['foo', 'bar', 'discover', 'dashboards', 'visualize'],
    });

    const getNavigationTree = () =>
      lastValueFrom(
        projectNavigation.getNavigation$().pipe(
          take(1),
          map((nav) => nav.navigationTree)
        )
      );

    return { projectNavigation, getNavigationTree };
  };

  describe('setup nodes', () => {
    const { projectNavigation, getNavigationTree } = setupInitNavigation();

    beforeAll(() => {
      projectNavigation.initNavigation<any>(
        'es',
        of({
          body: [
            {
              id: 'group1',
              type: 'navGroup',
              children: [
                { link: 'foo' },
                { link: 'bar', title: 'Custom title' },
                { link: 'unknown' }, // will be filtered out
              ],
            },
            {
              type: 'navGroup', // No group id, should auto generate one
              children: [
                {
                  children: [{ link: 'foo' }],
                },
              ],
            },
            {
              type: 'recentlyAccessed',
            },
            {
              type: 'preset',
              preset: 'analytics',
            },
          ],
          footer: [
            {
              type: 'navGroup', // No group id, should auto generate one
              title: 'Footer group',
              children: [
                {
                  children: [{ link: 'foo' }],
                },
              ],
            },
          ],
        })
      );
    });

    test('should convert link to deepLink and filter out unknown deepLinks', async () => {
      const treeDefinition = await getNavigationTree();
      const [node] = treeDefinition.body as [ChromeProjectNavigationNode];
      expect(node?.children?.length).toBe(2);
    });

    test('should read the title from prop or deeplink', async () => {
      const treeDefinition = await getNavigationTree();
      const [node] = treeDefinition.body as [ChromeProjectNavigationNode];
      expect(node.children![0].title).toBe('FOO');
      expect(node.children![1].title).toBe('Custom title');
    });

    test('should add metadata to node (title, path, href, sideNavStatus...)', async () => {
      const treeDefinition = await getNavigationTree();
      const [node] = treeDefinition.body as [ChromeProjectNavigationNode];
      expect(node.children![0]).toEqual({
        id: 'foo',
        title: 'FOO',
        path: 'group1.foo',
        href: '/app/foo',
        deepLink: getNavLink({ id: 'foo', title: 'FOO' }),
        isExternalLink: false,
        sideNavStatus: 'visible',
      });
      expect(node.children![0].href).toBe(node.children![0]!.deepLink!.href);
    });

    test('should allow href for absolute links', async () => {
      const { projectNavigation: projNavigation, getNavigationTree: getNavTree } =
        setupInitNavigation();
      projNavigation.initNavigation<any>(
        'es',
        of({
          body: [
            {
              id: 'group1',
              type: 'navGroup',
              children: [
                {
                  id: 'foo',
                  href: 'https://elastic.co',
                },
              ],
            },
          ],
        })
      );
      const treeDefinition = await getNavTree();
      const [node] = treeDefinition.body as [ChromeProjectNavigationNode];
      expect(node.children?.[0].href).toBe('https://elastic.co');
    });

    test('should filter out deepLinks that exclude projectSideNav from visibleIn', async () => {
      const { projectNavigation: svc, navLinksService: nls } = setup({
        navLinkIds: ['management:genAiSettings'],
      });

      // Add a second link that is registered but explicitly excludes projectSideNav
      const evalsNoSideNav: ChromeNavLink = getNavLink({
        id: 'management:evals',
        title: 'MANAGEMENT:EVALS',
        visibleIn: ['globalSearch'],
      });
      const existing = nls.getAll();
      nls.getNavLinks$.mockReturnValue(of([...existing, evalsNoSideNav]));
      nls.getAll.mockReturnValue([...existing, evalsNoSideNav]);

      svc.initNavigation<any>(
        'es',
        of({
          body: [
            {
              id: 'group1',
              type: 'navGroup',
              children: [
                { link: 'management:genAiSettings' },
                { link: 'management:evals' }, // registered but no projectSideNav → removed
              ],
            },
          ],
        })
      );

      const treeDefinition = await lastValueFrom(
        svc.getNavigation$().pipe(
          take(1),
          map((nav) => nav.navigationTree)
        )
      );

      const [node] = treeDefinition.body as [ChromeProjectNavigationNode];
      expect(node.children?.map((c) => c.id)).toEqual(['management:genAiSettings']);
    });

    test('removes deepLinks from the solution nav tree when their visibleIn excludes projectSideNav', async () => {
      const { projectNavigation: svc, navLinksService: nls } = setup({
        navLinkIds: ['management:genAiSettings'],
      });

      const classicOnlyLink: ChromeNavLink = getNavLink({
        id: 'management:evals',
        title: 'MANAGEMENT:EVALS',
        visibleIn: ['globalSearch', 'classicSideNav'],
      });
      const existing = nls.getAll();
      nls.getNavLinks$.mockReturnValue(of([...existing, classicOnlyLink]));
      nls.getAll.mockReturnValue([...existing, classicOnlyLink]);

      svc.initNavigation<any>(
        'es',
        of({
          body: [
            {
              id: 'group1',
              type: 'navGroup',
              children: [
                { link: 'management:genAiSettings' },
                { link: 'management:evals' }, // visibleIn excludes projectSideNav → removed
              ],
            },
          ],
        })
      );

      const treeDefinition = await lastValueFrom(
        svc.getNavigation$().pipe(
          take(1),
          map((nav) => nav.navigationTree)
        )
      );

      const [node] = treeDefinition.body as [ChromeProjectNavigationNode];
      expect(node.children?.map((c) => c.id)).toEqual(['management:genAiSettings']);
    });

    test('should filter out missing deepLinks (e.g. evals) from the navigation tree', async () => {
      const { projectNavigation: projectNavigationService } = setup({
        navLinkIds: ['management:genAiSettings'],
      });

      projectNavigationService.initNavigation<any>(
        'es',
        of({
          body: [
            {
              id: 'group1',
              type: 'navGroup',
              children: [
                { link: 'management:genAiSettings' },
                { link: 'management:evals' }, // will be filtered out if evals is disabled
              ],
            },
          ],
        })
      );

      const treeDefinition = await lastValueFrom(
        projectNavigationService.getNavigation$().pipe(
          take(1),
          map((nav) => nav.navigationTree)
        )
      );

      const [node] = treeDefinition.body as [ChromeProjectNavigationNode];
      expect(node.children?.map((c) => c.id)).toEqual(['management:genAiSettings']);
    });

    test('should throw if href is not an absolute links', async () => {
      const { projectNavigation: projNavigation } = setupInitNavigation();

      projNavigation.initNavigation<any>(
        'es',
        of({
          body: [
            {
              id: 'group1',
              type: 'navGroup',
              children: [
                {
                  id: 'foo',
                  href: '../dashboards',
                },
              ],
            },
          ],
        })
      );

      expect(logger.error).toHaveBeenCalledWith(
        new Error('href must be an absolute URL. Node id [foo].')
      );
    });

    test('should auto generate IDs for groups that dont have one', async () => {
      const treeDefinition = await getNavigationTree();
      const nodesBody = treeDefinition.body as ChromeProjectNavigationNode[];
      expect(nodesBody[1]).toEqual({
        id: 'node-1', // auto generated
        path: 'node-1',
        type: 'navGroup',
        isExternalLink: false,
        sideNavStatus: 'visible',
        children: [
          {
            id: 'node-0', // auto generated
            path: 'node-1.node-0',
            isExternalLink: false,
            sideNavStatus: 'visible',
            children: [
              {
                deepLink: {
                  baseUrl: '/app',
                  href: '/app/foo',
                  id: 'foo',
                  title: 'FOO',
                  url: '/app/foo',
                  visibleIn: ['globalSearch', 'classicSideNav', 'projectSideNav'],
                },
                href: '/app/foo',
                id: 'foo',
                isExternalLink: false,
                path: 'node-1.node-0.foo',
                sideNavStatus: 'visible',
                title: 'FOO',
              },
            ],
          },
        ],
      });

      const nodesFooter = treeDefinition.footer as ChromeProjectNavigationNode[];
      expect(nodesFooter[0]).toEqual({
        id: 'node-4', // auto generated - Counting countinue from the body array length
        title: 'Footer group',
        path: 'node-4',
        type: 'navGroup',
        isExternalLink: false,
        sideNavStatus: 'visible',
        children: [
          {
            id: 'node-0', // auto generated
            path: 'node-4.node-0',
            isExternalLink: false,
            sideNavStatus: 'visible',
            children: [
              {
                deepLink: expect.any(Object), // we are not testing the deepLink here
                href: '/app/foo',
                id: 'foo',
                isExternalLink: false,
                path: 'node-4.node-0.foo',
                sideNavStatus: 'visible',
                title: 'FOO',
              },
            ],
          },
        ],
      });
    });
  });

  test('should handle race condition when initNavigation() is called after getNavigation$()', async () => {
    const { projectNavigation } = setup({ navLinkIds: ['foo', 'bar'] });

    // 1. getNavigation$() is called
    const promise = lastValueFrom(
      projectNavigation.getNavigation$().pipe(
        take(1),
        map((nav) => nav.navigationTree)
      )
    );

    // 2. initNavigation() is called
    projectNavigation.initNavigation<any>(
      'es',
      of({
        body: [
          {
            id: 'group1',
            type: 'navGroup',
            children: [{ link: 'foo' }],
          },
        ],
      })
    );

    // 3. getNavigation$() is resolved
    const treeDefinition = await promise;
    const [node] = treeDefinition.body as [ChromeProjectNavigationNode];
    expect(node.children![0].title).toBe('FOO');
  });

  test('should add the Cloud links to the navigation tree', async () => {
    const { projectNavigation } = setup();
    projectNavigation.setCloudUrls({
      usersAndRolesUrl: 'https://cloud.elastic.co/userAndRoles/', // trailing slash should be removed!
      performanceUrl: 'https://cloud.elastic.co/performance/',
      billingUrl: 'https://cloud.elastic.co/billing/',
      deploymentUrl: 'https://cloud.elastic.co/deployment/',
    });

    projectNavigation.initNavigation<any>(
      'es',
      // @ts-expect-error - We pass a non valid cloudLink that is not TS valid
      of({
        body: [
          {
            id: 'group1',
            type: 'navGroup',
            children: [
              { cloudLink: 'userAndRoles' },
              { cloudLink: 'performance' },
              { cloudLink: 'billingAndSub' },
              { cloudLink: 'deployment' },
              { cloudLink: 'unknown' }, // Should be filtered out
            ],
          },
        ],
      })
    );

    const treeDefinition = await lastValueFrom(
      projectNavigation.getNavigation$().pipe(
        take(1),
        map((nav) => nav.navigationTree)
      )
    );
    const [node] = treeDefinition.body as [ChromeProjectNavigationNode];
    expect(node?.children?.length).toBe(4);

    // userAndRoles
    expect(node.children![0]).toEqual({
      deepLink: undefined,
      href: 'https://cloud.elastic.co/userAndRoles',
      id: 'node-0',
      isExternalLink: true,
      path: 'group1.node-0',
      sideNavStatus: 'visible',
      title: 'Members',
    });

    // performance
    expect(node.children![1]).toEqual({
      deepLink: undefined,
      href: 'https://cloud.elastic.co/performance',
      id: 'node-1',
      isExternalLink: true,
      path: 'group1.node-1',
      sideNavStatus: 'visible',
      title: 'Performance',
    });

    // billingAndSub
    expect(node.children![2]).toEqual({
      deepLink: undefined,
      href: 'https://cloud.elastic.co/billing',
      id: 'node-2',
      isExternalLink: true,
      path: 'group1.node-2',
      sideNavStatus: 'visible',
      title: 'Billing and subscription',
    });

    // deployment
    expect(node.children![3]).toEqual({
      deepLink: undefined,
      href: 'https://cloud.elastic.co/deployment',
      id: 'node-3',
      isExternalLink: true,
      path: 'group1.node-3',
      sideNavStatus: 'visible',
      title: 'Project',
    });
  });

  test('should update the navigation tree when cloud URLs are updated after initialization', async () => {
    const { projectNavigation } = setup();

    // First: Set cloud URLs WITHOUT billingUrl
    projectNavigation.setCloudUrls({
      usersAndRolesUrl: 'https://cloud.elastic.co/userAndRoles/',
      performanceUrl: 'https://cloud.elastic.co/performance/',
      deploymentUrl: 'https://cloud.elastic.co/deployment/',
    });

    projectNavigation.initNavigation<any>(
      'es',
      of({
        body: [
          {
            id: 'group1',
            type: 'navGroup',
            children: [
              { cloudLink: 'userAndRoles' },
              { cloudLink: 'billingAndSub' }, // No URL for this yet
              { cloudLink: 'performance' },
              { cloudLink: 'deployment' },
            ],
          },
        ],
      })
    );

    // Verify that billingAndSub link is NOT in the tree (no URL available)
    let treeDefinition = await lastValueFrom(
      projectNavigation.getNavigation$().pipe(
        take(1),
        map((nav) => nav.navigationTree)
      )
    );
    let [node] = treeDefinition.body as [ChromeProjectNavigationNode];
    expect(node?.children?.length).toBe(3); // Only 3 links without billing

    // Verify the links are userAndRoles, performance, deployment (no billing)
    expect(node.children![0].title).toBe('Members');
    expect(node.children![1].title).toBe('Performance');
    expect(node.children![2].title).toBe('Project'); // deployment

    // Second: Update cloud URLs WITH billingUrl
    projectNavigation.setCloudUrls({
      usersAndRolesUrl: 'https://cloud.elastic.co/userAndRoles/',
      performanceUrl: 'https://cloud.elastic.co/performance/',
      billingUrl: 'https://cloud.elastic.co/billing/', // NOW we add billing
      deploymentUrl: 'https://cloud.elastic.co/deployment/',
    });

    // Verify that billingAndSub link IS now in the tree
    treeDefinition = await lastValueFrom(
      projectNavigation.getNavigation$().pipe(
        take(1),
        map((nav) => nav.navigationTree)
      )
    );
    [node] = treeDefinition.body as [ChromeProjectNavigationNode];
    expect(node?.children?.length).toBe(4); // Now 4 links including billing

    // Verify the billing link is present with correct properties
    expect(node.children![1]).toEqual({
      deepLink: undefined,
      href: 'https://cloud.elastic.co/billing',
      id: 'node-1',
      isExternalLink: true,
      path: 'group1.node-1',
      sideNavStatus: 'visible',
      title: 'Billing and subscription',
    });
  });
});

describe('breadcrumbs', () => {
  const setupWithNavTree = (initiateNavigation = true) => {
    const currentLocationPathName = '/app/navItem1';
    const { projectNavigation, chromeBreadcrumbs$, history } = setup({
      locationPathName: currentLocationPathName,
      navLinkIds: ['navItem1'],
    });

    const mockNavigation: NavigationTreeDefinition<any> = {
      body: [
        {
          id: 'root',
          title: 'Root',
          breadcrumbStatus: 'hidden' as 'hidden',
          children: [
            {
              id: 'subNav',
              title: '', // intentionally empty to skip rendering
              children: [
                {
                  link: 'navItem1',
                  title: 'Nav Item 1',
                },
              ],
            },
          ],
        },
      ],
    };

    const subj = new BehaviorSubject<NavigationTreeDefinition<any>>(mockNavigation);
    const obs = subj.asObservable();

    if (initiateNavigation) {
      projectNavigation.initNavigation('es', obs);
    }

    return {
      projectNavigation,
      history,
      mockNavigation,
      chromeBreadcrumbs$,
      updateDefinition: subj.next.bind(subj),
    };
  };

  test('should set breadcrumbs home / nav / custom', async () => {
    const { projectNavigation } = setupWithNavTree();

    projectNavigation.setProjectBreadcrumbs([
      { text: 'custom1', href: '/custom1' },
      { text: 'custom2', href: '/custom1/custom2' },
    ]);

    const breadcrumbs = await firstValueFrom(projectNavigation.getProjectBreadcrumbs$());
    expect(breadcrumbs).toMatchInlineSnapshot(`
      Array [
        Object {
          "popoverContent": <EuiContextMenuPanelClass
            items={
              Array [
                <EuiContextMenuItem
                  icon="gear"
                >
                  <Memo(MemoizedFormattedMessage)
                    defaultMessage="Manage project"
                    id="core.ui.primaryNav.cloud.linkToProject"
                  />
                </EuiContextMenuItem>,
                <EuiContextMenuItem
                  icon="grid"
                >
                  <Memo(MemoizedFormattedMessage)
                    defaultMessage="View all projects"
                    id="core.ui.primaryNav.cloud.linkToAllProjects"
                  />
                </EuiContextMenuItem>,
              ]
            }
          />,
          "popoverProps": Object {
            "panelPaddingSize": "none",
          },
          "style": Object {
            "maxWidth": "320px",
          },
          "text": "Project",
        },
        Object {
          "deepLinkId": "navItem1",
          "href": "/app/navItem1",
          "text": "Nav Item 1",
        },
        Object {
          "href": "/custom1",
          "text": "custom1",
        },
        Object {
          "href": "/custom1/custom2",
          "text": "custom2",
        },
      ]
    `);
  });

  test('should skip the default navigation from project navigation when absolute: true is used', async () => {
    const { projectNavigation } = setupWithNavTree();

    projectNavigation.setProjectBreadcrumbs(
      [
        { text: 'custom1', href: '/custom1' },
        { text: 'custom2', href: '/custom1/custom2' },
      ],
      { absolute: true }
    );

    const breadcrumbs = await firstValueFrom(projectNavigation.getProjectBreadcrumbs$());
    expect(breadcrumbs).toMatchInlineSnapshot(`
      Array [
        Object {
          "popoverContent": <EuiContextMenuPanelClass
            items={
              Array [
                <EuiContextMenuItem
                  icon="gear"
                >
                  <Memo(MemoizedFormattedMessage)
                    defaultMessage="Manage project"
                    id="core.ui.primaryNav.cloud.linkToProject"
                  />
                </EuiContextMenuItem>,
                <EuiContextMenuItem
                  icon="grid"
                >
                  <Memo(MemoizedFormattedMessage)
                    defaultMessage="View all projects"
                    id="core.ui.primaryNav.cloud.linkToAllProjects"
                  />
                </EuiContextMenuItem>,
              ]
            }
          />,
          "popoverProps": Object {
            "panelPaddingSize": "none",
          },
          "style": Object {
            "maxWidth": "320px",
          },
          "text": "Project",
        },
        Object {
          "href": "/custom1",
          "text": "custom1",
        },
        Object {
          "href": "/custom1/custom2",
          "text": "custom2",
        },
      ]
    `);
  });

  test('should merge nav breadcrumbs and chrome breadcrumbs', async () => {
    const { projectNavigation, chromeBreadcrumbs$ } = setupWithNavTree();

    projectNavigation.setProjectBreadcrumbs([]);
    chromeBreadcrumbs$.next([
      { text: 'Kibana' },
      { deepLinkId: 'navItem1' as AppDeepLinkId, text: 'Nav Item 1 from Chrome' },
      { text: 'Deep context from Chrome' },
    ]);

    const breadcrumbs = await firstValueFrom(projectNavigation.getProjectBreadcrumbs$());
    expect(breadcrumbs).toMatchInlineSnapshot(`
      Array [
        Object {
          "popoverContent": <EuiContextMenuPanelClass
            items={
              Array [
                <EuiContextMenuItem
                  icon="gear"
                >
                  <Memo(MemoizedFormattedMessage)
                    defaultMessage="Manage project"
                    id="core.ui.primaryNav.cloud.linkToProject"
                  />
                </EuiContextMenuItem>,
                <EuiContextMenuItem
                  icon="grid"
                >
                  <Memo(MemoizedFormattedMessage)
                    defaultMessage="View all projects"
                    id="core.ui.primaryNav.cloud.linkToAllProjects"
                  />
                </EuiContextMenuItem>,
              ]
            }
          />,
          "popoverProps": Object {
            "panelPaddingSize": "none",
          },
          "style": Object {
            "maxWidth": "320px",
          },
          "text": "Project",
        },
        Object {
          "deepLinkId": "navItem1",
          "text": "Nav Item 1 from Chrome",
        },
        Object {
          "text": "Deep context from Chrome",
        },
      ]
    `);
  });

  test('should reset custom breadcrumbs when active path changes', async () => {
    const { projectNavigation, history } = setupWithNavTree();
    projectNavigation.setProjectBreadcrumbs([
      { text: 'custom1', href: '/custom1' },
      { text: 'custom2', href: '/custom1/custom2' },
    ]);

    let breadcrumbs = await firstValueFrom(projectNavigation.getProjectBreadcrumbs$());
    expect(breadcrumbs).toHaveLength(4);
    history.push('/foo/item2');
    breadcrumbs = await firstValueFrom(projectNavigation.getProjectBreadcrumbs$());
    expect(breadcrumbs).toHaveLength(1); // only home is left
  });

  // this handles race condition where the `initNavigation` call happens after the app called `setProjectBreadcrumbs`
  test("shouldn't reset initial deep context breadcrumbs", async () => {
    const { projectNavigation, mockNavigation } = setupWithNavTree(false);
    projectNavigation.setProjectBreadcrumbs([
      { text: 'custom1', href: '/custom1' },
      { text: 'custom2', href: '/custom1/custom2' },
    ]);
    projectNavigation.initNavigation('es', of(mockNavigation)); // init navigation

    const breadcrumbs = await firstValueFrom(projectNavigation.getProjectBreadcrumbs$());
    expect(breadcrumbs).toHaveLength(4);
  });

  test("shouldn't reset custom breadcrumbs when nav node contents changes, but not the path", async () => {
    const { projectNavigation, mockNavigation, updateDefinition } = setupWithNavTree();
    projectNavigation.setProjectBreadcrumbs([
      { text: 'custom1', href: '/custom1' },
      { text: 'custom2', href: '/custom1/custom2' },
    ]);
    let breadcrumbs = await firstValueFrom(projectNavigation.getProjectBreadcrumbs$());
    expect(breadcrumbs).toHaveLength(4);

    // navigation node contents changed, but not the path
    const [node] = mockNavigation.body;
    updateDefinition({
      body: [{ ...node, title: 'Changed title' }, ...mockNavigation.body],
    });

    // context breadcrumbs should not reset
    breadcrumbs = await firstValueFrom(projectNavigation.getProjectBreadcrumbs$());
    expect(breadcrumbs).toHaveLength(4);
  });
});

describe('getNavigation$() active nodes', () => {
  test('should set the active nodes from history location', async () => {
    const currentLocationPathName = '/app/item1';
    const { projectNavigation } = setup({
      locationPathName: currentLocationPathName,
      navLinkIds: ['item1'],
    });

    projectNavigation.initNavigation<any>(
      'es',
      of({
        body: [
          {
            id: 'root',
            title: 'Root',
            type: 'navGroup',
            children: [
              {
                link: 'item1',
              },
            ],
          },
        ],
      })
    );

    const { activeNodes } = await lastValueFrom(projectNavigation.getNavigation$().pipe(take(1)));

    expect(activeNodes).toEqual([
      [
        {
          id: 'root',
          title: 'Root',
          path: 'root',
          isExternalLink: false,
          sideNavStatus: 'visible',
          type: 'navGroup',
        },
        {
          id: 'item1',
          title: 'ITEM1',
          path: 'root.item1',
          isExternalLink: false,
          sideNavStatus: 'visible',
          href: '/app/item1',
          deepLink: {
            id: 'item1',
            title: 'ITEM1',
            baseUrl: '/app',
            url: '/app/item1',
            href: '/app/item1',
            visibleIn: ['globalSearch', 'classicSideNav', 'projectSideNav'],
          },
        },
      ],
    ]);
  });

  test('should set the active nodes from getIsActive() handler', async () => {
    const { projectNavigation } = setup({ navLinkIds: ['item1'] });

    projectNavigation.initNavigation<any>(
      'es',
      of({
        body: [
          {
            id: 'root',
            title: 'Root',
            type: 'navGroup',
            children: [
              {
                link: 'item1',
                getIsActive: () => true,
              },
            ],
          },
        ],
      })
    );

    const { activeNodes } = await lastValueFrom(projectNavigation.getNavigation$().pipe(take(1)));

    expect(activeNodes).toEqual([
      [
        {
          id: 'root',
          title: 'Root',
          path: 'root',
          isExternalLink: false,
          sideNavStatus: 'visible',
          type: 'navGroup',
        },
        {
          id: 'item1',
          title: 'ITEM1',
          path: 'root.item1',
          isExternalLink: false,
          sideNavStatus: 'visible',
          href: '/app/item1',
          deepLink: {
            id: 'item1',
            title: 'ITEM1',
            baseUrl: '/app',
            url: '/app/item1',
            href: '/app/item1',
            visibleIn: ['globalSearch', 'classicSideNav', 'projectSideNav'],
          },
          getIsActive: expect.any(Function),
        },
      ],
    ]);
  });
});

describe('getActiveSolutionNavId$()', () => {
  it('should return null initially and update when initNavigation is called', async () => {
    const { projectNavigation } = setup({ navLinkIds: ['app1', 'app2'] });

    const activeId = await lastValueFrom(projectNavigation.getActiveSolutionNavId$().pipe(take(1)));
    expect(activeId).toBeNull();

    projectNavigation.initNavigation<any>('es', of({ body: [{ type: 'navItem', link: 'app1' }] }));

    const activeIdAfterInit = await lastValueFrom(
      projectNavigation.getActiveSolutionNavId$().pipe(take(1))
    );
    expect(activeIdAfterInit).toBe('es');
  });

  it('should update when switching to a different solution', async () => {
    const { projectNavigation } = setup({ navLinkIds: ['app1', 'app2'] });

    projectNavigation.initNavigation<any>('es', of({ body: [{ type: 'navItem', link: 'app1' }] }));

    let activeId = await lastValueFrom(projectNavigation.getActiveSolutionNavId$().pipe(take(1)));
    expect(activeId).toBe('es');

    projectNavigation.initNavigation<any>(
      'oblt',
      of({ body: [{ type: 'navItem', link: 'app2' }] })
    );

    activeId = await lastValueFrom(projectNavigation.getActiveSolutionNavId$().pipe(take(1)));
    expect(activeId).toBe('oblt');
  });
});
