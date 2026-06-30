/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { waitFor } from '@testing-library/dom';
import { toNavigationItems } from './to_navigation_items';
import { PanelStateManager } from './panel_state_manager';
import type {
  ChromeProjectNavigationNode,
  NavigationTreeDefinitionUI,
} from '@kbn/core-chrome-browser';

// use require to bypass unnecessary TypeScript checks for JSON imports
// eslint-disable-next-line @typescript-eslint/no-var-requires
const navigationTree = require('./mocks/mock_security_tree.json') as NavigationTreeDefinitionUI;

const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

// Mock panelStateManager for testing
const mockPanelStateManager = new PanelStateManager();

// Utility function to simplify toNavigationItems calls in tests
const createNavigationItems = (
  tree: NavigationTreeDefinitionUI = navigationTree,
  activeNodes: ChromeProjectNavigationNode[][] = []
) => {
  return toNavigationItems(tree, activeNodes, [], mockPanelStateManager);
};

beforeEach(() => {
  consoleWarnSpy.mockClear();
  mockPanelStateManager.clear();
});

describe('toNavigationItems', () => {
  const {
    logoItem,
    navItems: { footerItems, primaryItems },
  } = createNavigationItems();

  it('should return logo node from navigation tree', () => {
    expect(logoItem).toMatchInlineSnapshot(`
      Object {
        "data-test-subj": "nav-item nav-item-security_solution_home nav-item-deepLinkId-undefined nav-item-id-security_solution_home nav-item-home",
        "href": "/jom/app/security/get_started",
        "iconType": "logoSecurity",
        "id": "security_solution_home",
        "label": "Security",
      }
    `);
  });

  it('should return primary items from navigation tree', () => {
    expect(primaryItems).toMatchSnapshot();
  });

  it('should return footer items from navigation tree', () => {
    expect(footerItems).toMatchSnapshot();
  });

  it('should warn about issues with navigation tree', async () => {
    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });

    expect(consoleWarnSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
      "
      === Navigation Warnings ===
      • Panel opener node \\"securityGroup:entityAnalytics\\" should contain panel sections, not direct links. Flattening links \\"entity_analytics-overview, entity_analytics-privileged_user_monitoring\\" into secondary items and creating a placeholder section for these links.
      • Panel opener node \\"securityGroup:explore\\" should contain panel sections, not direct links. Flattening links \\"hosts, network, users\\" into secondary items and creating a placeholder section for these links.
      • Panel opener node \\"securityGroup:investigations\\" should contain panel sections, not direct links. Flattening links \\"timelines, notes, osquery\\" into secondary items and creating a placeholder section for these links.
      • Secondary menu item node \\"fleet\\" has a href \\"/jom/app/fleet\\", but it should not. We're using it as a section title that doesn't have a link.
      • ID \\"endpoints\\" is used 2 times in navigation items. Each navigation item must have a unique ID."
    `);
  });
});

describe('isActive', () => {
  it('should return null if no active paths', () => {
    const { activeItemId } = createNavigationItems();
    expect(activeItemId).toBeUndefined();
  });

  it('should return primary menu node as active item', () => {
    const primaryNode1 = navigationTree.body[0];

    const { activeItemId } = createNavigationItems(navigationTree, [[primaryNode1]]);
    expect(activeItemId).toBe(primaryNode1.id);
  });

  it('should return 1st primary menu node as active item if multiple matching', () => {
    const primaryNode1 = navigationTree.body[0];
    const primaryNode2 = navigationTree.body[0];

    const { activeItemId } = createNavigationItems(navigationTree, [
      [primaryNode1],
      [primaryNode2],
    ]);
    expect(activeItemId).toBe(primaryNode1.id);
  });

  it('should return secondary node as active item', () => {
    const primaryNode = navigationTree.body[3];
    const sectionNode = primaryNode.children![1]!;
    const secondaryNode = primaryNode.children![1]!.children![0]!;

    const { activeItemId } = createNavigationItems(navigationTree, [
      [primaryNode, sectionNode, secondaryNode],
    ]);
    expect(activeItemId).toBe(secondaryNode.id);
  });

  it('should return primary node as active item if active path is beyond navigation', () => {
    const primaryNode = navigationTree.body![2]!;
    const beyondNavNode = primaryNode.children![0]!;

    const { activeItemId } = createNavigationItems(navigationTree, [[primaryNode, beyondNavNode]]);
    expect(activeItemId).toBe(primaryNode.id);
  });

  it('logo node active state should be less priority for active state', () => {
    const logoNode = navigationTree.body[0];
    const deeperNode = navigationTree.footer![0]!;

    const { activeItemId } = createNavigationItems(navigationTree, [[logoNode], [deeperNode]]);
    expect(activeItemId).toBe(deeperNode.id);
  });

  it('same level nodes, earliest take priority', () => {
    const primaryNode1 = navigationTree.body[1];
    const primaryNode2 = navigationTree.body[2];

    const { activeItemId } = createNavigationItems(navigationTree, [
      [primaryNode1],
      [primaryNode2],
    ]);
    expect(activeItemId).toBe(primaryNode1.id);
  });

  it('deeper level nodes, deeper takes priority', () => {
    const primaryNode = navigationTree.body[1];
    const deepNode = navigationTree.body[3]!.children![0]!.children![0]!;

    const { activeItemId } = createNavigationItems(navigationTree, [
      [primaryNode],
      [navigationTree.body[3], navigationTree.body[3]!.children![0]!, deepNode],
    ]);
    expect(activeItemId).toBe(deepNode.id);
  });

  it('should support footer items as active', () => {
    const footerNode = navigationTree.footer![0]!;

    const { activeItemId } = createNavigationItems(navigationTree, [
      [footerNode, footerNode.children![0]!, footerNode.children![0]!.children![0]!],
    ]);

    expect(activeItemId).toBe(footerNode.children![0]!.children![0]!.id);
  });
});

describe('logo node', () => {
  test('should return logo node with correct properties', () => {
    const { logoItem } = createNavigationItems(navigationTree);
    expect(logoItem).toMatchInlineSnapshot(`
      Object {
        "data-test-subj": "nav-item nav-item-security_solution_home nav-item-deepLinkId-undefined nav-item-id-security_solution_home nav-item-home",
        "href": "/jom/app/security/get_started",
        "iconType": "logoSecurity",
        "id": "security_solution_home",
        "label": "Security",
      }
    `);
  });

  test('Logo node can be active', () => {
    const { activeItemId } = createNavigationItems(navigationTree, [[navigationTree.body[0]]]);
    expect(activeItemId).toBe(navigationTree.body[0].id);
  });
});

describe('panel opener href', () => {
  it('should return panel opener href as first child href', () => {
    const {
      navItems: { primaryItems },
    } = createNavigationItems();

    // Find a panel opener from the existing mock tree - 'securityGroup:rules' is a panel opener
    const rulesPanel = primaryItems.find((item) => item.id === 'securityGroup:rules');
    expect(rulesPanel).toBeDefined();
    expect(rulesPanel?.href).toBe('/jom/app/security/rules');
  });

  it('should ignore external urls', () => {
    const tree = structuredClone(navigationTree);
    // @ts-expect-error to avoid excess type checking for test
    tree.body[3].children[0].children[0].isExternalLink = true; // 'securityGroup:rules' first child is now external

    const {
      navItems: { primaryItems },
    } = createNavigationItems(tree);

    // Find a panel opener from the existing mock tree - 'securityGroup:rules' is a panel opener
    const rulesPanel = primaryItems.find((item) => item.id === 'securityGroup:rules');
    expect(rulesPanel).toBeDefined();
    expect(rulesPanel?.href).toBe('/jom/app/security/cloud_security_posture/benchmarks');
  });

  it('should return panel opener href as last active child href', () => {
    // Set up a last active item for the securityGroup:rules panel
    mockPanelStateManager.setPanelLastActive(
      'securityGroup:rules',
      'cloud_security_posture-benchmarks'
    );

    const {
      navItems: { primaryItems },
    } = createNavigationItems();

    // Find the panel opener and verify it uses the last active item's href
    const rulesPanel = primaryItems.find((item) => item.id === 'securityGroup:rules');
    expect(rulesPanel).toBeDefined();
    expect(rulesPanel?.href).toBe('/jom/app/security/cloud_security_posture/benchmarks');
  });
});

describe('empty panel opener', () => {
  it('should not return panel opener if it has no children', () => {
    const tree = structuredClone(navigationTree);
    tree.body![3].children = []; // 'securityGroup:rules' panel opener has no children now
    const {
      navItems: { primaryItems },
    } = createNavigationItems(tree);

    expect(primaryItems.find((item) => item.id === 'securityGroup:rules')).toBeUndefined();
  });
});

describe('hidden panel link', () => {
  // https://github.com/elastic/kibana/issues/240275
  it('should remove panel links marked as hidden, but should keep opener active', () => {
    const tree = structuredClone(navigationTree);
    // @ts-expect-error to avoid excess type checking for test
    const stackManagementNode = tree.footer[3];
    stackManagementNode.children!.push({
      deepLink: {
        id: 'stack_management',
        title: 'Stack Management',
        baseUrl: '/',
        href: '/app/management',
        url: '/app/management',
        visibleIn: ['classicSideNav', 'projectSideNav'],
      },
      sideNavStatus: 'hidden',
      id: 'stack_management',
      path: 'footer.stack_management.stack_management',
    });

    const {
      navItems: { footerItems },
      activeItemId,
    } = createNavigationItems(tree, [
      [
        stackManagementNode,
        stackManagementNode.children![stackManagementNode.children!.length - 1],
      ],
    ]);

    // No management link under Stack Management
    expect(footerItems[3]!.sections!.map((s) => s.label)).toMatchInlineSnapshot(`
      Array [
        undefined,
        "Alerts and Insights",
        "Machine Learning",
        "Model management",
        "AI",
        "Security",
        "Data",
        "Kibana",
        "Stack",
      ]
    `);

    // But management panel is considered active
    expect(activeItemId).toBe('stack_management');
  });
});

describe('Chrome Next mode (isNextChrome)', () => {
  const createChromeNextNavigationItems = (
    tree: NavigationTreeDefinitionUI = navigationTree,
    activeNodes: ChromeProjectNavigationNode[][] = []
  ) => {
    return toNavigationItems(tree, activeNodes, [], mockPanelStateManager, true);
  };

  it('should not extract logoItem when isNextChrome is true', () => {
    const { logoItem } = createChromeNextNavigationItems();
    expect(logoItem).toBeUndefined();
  });

  it('should extract logoItem when isNextChrome is false (default)', () => {
    const { logoItem } = createNavigationItems();
    expect(logoItem).toBeDefined();
    expect(logoItem?.id).toBe('security_solution_home');
  });

  it('should keep visible home node in primaryItems with title "Home" and icon "home"', () => {
    const {
      navItems: { primaryItems },
    } = createChromeNextNavigationItems();
    const homeItem = primaryItems.find((item) => item.id === 'security_solution_home');
    expect(homeItem).toBeDefined();
    expect(homeItem?.label).toBe('Home');
    expect(homeItem?.iconType).toBe('home');
  });
});
