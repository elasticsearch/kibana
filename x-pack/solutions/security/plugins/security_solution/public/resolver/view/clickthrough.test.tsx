/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactWrapper } from 'enzyme';
import { createMemoryHistory } from 'history';
import { noAncestorsTwoChildenInIndexCalledAwesomeIndex } from '../data_access_layer/mocks/no_ancestors_two_children_in_index_called_awesome_index';
import { noAncestorsTwoChildren } from '../data_access_layer/mocks/no_ancestors_two_children';
import { Simulator } from '../test_utilities/simulator';
// Extend jest with a custom matcher
import '../test_utilities/extend_jest';
import { noAncestorsTwoChildrenWithRelatedEventsOnOrigin } from '../data_access_layer/mocks/no_ancestors_two_children_with_related_events_on_origin';
import { urlSearch } from '../test_utilities/url_search';
import type { Vector2, AABB, TimeRange, DataAccessLayer } from '../types';
import { generateTreeWithDAL } from '../data_access_layer/mocks/generator_tree';
import type { SafeResolverEvent } from '../../../common/endpoint/types';

let simulator: Simulator;
let databaseDocumentID: string;
let entityIDs: { origin: string; firstChild: string; secondChild: string };

// the resolver component instance ID, used by the react code to distinguish piece of global state from those used by other resolver instances
const resolverComponentInstanceID = 'resolverComponentInstanceID';

describe("Resolver, when rendered with the `indices` prop set to `[]` and the `databaseDocumentID` prop set to `_id`, and when the document is found in an index called 'awesome_index'", () => {
  beforeEach(() => {
    // create a mock data access layer
    const { metadata: dataAccessLayerMetadata, dataAccessLayer } =
      noAncestorsTwoChildenInIndexCalledAwesomeIndex();

    // save a reference to the entity IDs exposed by the mock data layer
    entityIDs = dataAccessLayerMetadata.entityIDs;

    // save a reference to the `_id` supported by the mock data layer
    databaseDocumentID = dataAccessLayerMetadata.databaseDocumentID;

    // create a resolver simulator, using the data access layer and an arbitrary component instance ID
    simulator = new Simulator({
      databaseDocumentID,
      dataAccessLayer,
      resolverComponentInstanceID,
      history: createMemoryHistory(),
      indices: [],
      shouldUpdate: false,
      filters: {},
    });
  });

  afterEach(() => {
    simulator.unmount();
  });

  it('should render no processes', async () => {
    await expect(
      simulator.map(() => ({
        processes: simulator.processNodeElements().length,
      }))
    ).toYieldEqualTo({
      processes: 0,
    });
  });

  describe("when rerendered with the `indices` prop set to `['awesome_index'`]", () => {
    beforeEach(() => {
      simulator.indices = ['awesome_index'];
    });
    // Combining assertions here for performance. Unfortunately, Enzyme + jsdom + React is slow.
    it(`should have 3 nodes, with the entityID's 'origin', 'firstChild', and 'secondChild'. 'origin' should be selected when the simulator has the right indices`, async () => {
      await expect(
        simulator.map(() => ({
          selectedOriginCount: simulator.selectedProcessNode(entityIDs.origin).length,
          unselectedFirstChildCount: simulator.unselectedProcessNode(entityIDs.firstChild).length,
          unselectedSecondChildCount: simulator.unselectedProcessNode(entityIDs.secondChild).length,
          nodePrimaryButtonCount: simulator.testSubject('resolver:node:primary-button').length,
        }))
      ).toYieldEqualTo({
        selectedOriginCount: 1,
        unselectedFirstChildCount: 1,
        unselectedSecondChildCount: 1,
        nodePrimaryButtonCount: 3,
      });
    }, 30000);
  });
});

describe('Resolver, when analyzing a tree that has no ancestors and 2 children', () => {
  beforeEach(() => {
    // create a mock data access layer
    const { metadata: dataAccessLayerMetadata, dataAccessLayer } = noAncestorsTwoChildren();

    // save a reference to the entity IDs exposed by the mock data layer
    entityIDs = dataAccessLayerMetadata.entityIDs;

    // save a reference to the `_id` supported by the mock data layer
    databaseDocumentID = dataAccessLayerMetadata.databaseDocumentID;

    // create a resolver simulator, using the data access layer and an arbitrary component instance ID
    simulator = new Simulator({
      databaseDocumentID,
      dataAccessLayer,
      resolverComponentInstanceID,
      history: createMemoryHistory(),
      indices: [],
      shouldUpdate: false,
      filters: {},
    });
  });

  afterEach(() => {
    simulator.unmount();
  });

  describe('when it has loaded', () => {
    beforeEach(async () => {
      await expect(
        /**
         * It's important that all of these are done in a single `expect`.
         * If you do them concurrently with each other, you'll have incorrect results.
         *
         * For example, there might be no loading element at one point, and 1 graph element at one point, but never a single time when there is both 1 graph element and 0 loading elements.
         *
         * nodeListLinkCount is included here so that the node list panel is also confirmed
         * ready before any `it` in this describe runs. The node list may render one React
         * cycle after the graph (e.g. when EUI's AutoSizer provides its size), so verifying
         * it here ensures the "should show links to the 3 nodes in the node list" test
         * sees an up-to-date enzyme wrapper in its synchronous assertion.
         */
        simulator.map(() => ({
          graphElements: simulator.testSubject('resolver:graph').length,
          graphLoadingElements: simulator.testSubject('resolver:graph:loading').length,
          graphErrorElements: simulator.testSubject('resolver:graph:error').length,
          nodeListLinkCount: simulator.testSubject('resolver:node-list:node-link:title').length,
        }))
      ).toYieldEqualTo({
        // it should have 1 graph element, an no error or loading elements.
        graphElements: 1,
        graphLoadingElements: 0,
        graphErrorElements: 0,
        nodeListLinkCount: 3,
      });
    }, 30000);

    // Combining assertions here for performance. Unfortunately, Enzyme + jsdom + React is slow.
    it(`should have 3 nodes, with the entityID's 'origin', 'firstChild', and 'secondChild'. 'origin' should be selected.`, async () => {
      await expect(
        simulator.map(() => ({
          selectedOriginCount: simulator.selectedProcessNode(entityIDs.origin).length,
          unselectedFirstChildCount: simulator.unselectedProcessNode(entityIDs.firstChild).length,
          unselectedSecondChildCount: simulator.unselectedProcessNode(entityIDs.secondChild).length,
          nodePrimaryButtonCount: simulator.testSubject('resolver:node:primary-button').length,
        }))
      ).toYieldEqualTo({
        selectedOriginCount: 1,
        unselectedFirstChildCount: 1,
        unselectedSecondChildCount: 1,
        nodePrimaryButtonCount: 3,
      });
    }, 30000);

    it('should render 3 elements with "treeitem" roles, each owned by an element with a "tree" role', async () => {
      await expect(
        simulator.map(() => {
          /**
           * This test verifies correctness w.r.t. the tree/treeitem roles
           * From W3C: `Authors MUST ensure elements with role treeitem are contained in, or owned by, an element with the role group or tree.`
           *
           * https://www.w3.org/TR/wai-aria-1.1/#tree
           * https://www.w3.org/TR/wai-aria-1.1/#treeitem
           *
           * w3c defines two ways for an element to be an "owned element"
           *  1. Any DOM descendant
           *  2. Any element specified as a child via aria-owns
           *  (see: https://www.w3.org/TR/wai-aria-1.1/#dfn-owned-element)
           *
           * In the context of Resolver (as of this writing) nodes/treeitems are children of the tree,
           * but they could be moved out of the tree, provided that the tree is given an `aria-owns`
           * attribute referring to them (method 2 above).
           */
          const tree = simulator.domNodesWithRole('tree');
          return {
            // There should be only one tree.
            treeCount: tree.length,
            // The tree should have 3 nodes in it.
            nodesOwnedByTrees: tree.find(Simulator.nodeElementSelector()).length,
          };
        })
      ).toYieldEqualTo({ treeCount: 1, nodesOwnedByTrees: 3 });
    }, 30000);

    it(`should show links to the 3 nodes in the node list.`, () => {
      // The beforeEach already confirmed nodeListLinkCount === 3 and updated the enzyme wrapper,
      // so a direct synchronous assertion is sufficient and avoids any async timeout risk.
      expect(simulator.testSubject('resolver:node-list:node-link:title').length).toBe(3);
    });

    describe("when the second child node's first button has been clicked", () => {
      beforeEach(async () => {
        const button = await simulator.resolveWrapper(() =>
          simulator.processNodePrimaryButton(entityIDs.secondChild)
        );
        // Click the second child node's primary button
        if (button) {
          button.simulate('click', { button: 0 });
        }
      }, 30000);
      it('should render the second child node as selected, and the origin as not selected, and the query string should indicate that the second child is selected', async () => {
        await expect(
          simulator.map(() => ({
            // the query string has a key showing that the second child is selected
            search: simulator.historyLocationSearch,
            // the second child is rendered in the DOM, and shows up as selected
            selectedSecondChildNodeCount: simulator.selectedProcessNode(entityIDs.secondChild)
              .length,
            // the origin is in the DOM, but shows up as unselected
            unselectedOriginNodeCount: simulator.unselectedProcessNode(entityIDs.origin).length,
          }))
        ).toYieldEqualTo({
          // Just the second child should be marked as selected in the query string
          search: urlSearch(resolverComponentInstanceID, {
            panelParameters: { nodeID: entityIDs.secondChild },
            panelView: 'nodeDetail',
          }),
          // The second child is rendered and has `[aria-selected]`
          selectedSecondChildNodeCount: 1,
          // The origin child is rendered and doesn't have `[aria-selected]`
          unselectedOriginNodeCount: 1,
        });
      }, 30000);
    });
  });
});

// FLAKY: https://github.com/elastic/kibana/issues/181369
describe.skip('Resolver, when using a generated tree with 20 generations, 4 children per child, and 10 ancestors', () => {
  const findAndClickFirstLoadingNodeInPanel = async (graphSimulator: Simulator) => {
    // If the camera has not moved it will return a node with ID 2kt059pl3i, this is the first node with the state
    // loading that is outside of the initial loaded view
    const getLoadingNodeInList = async () => {
      return (await graphSimulator.resolve('resolver:node-list:node-link'))
        ?.findWhere((wrapper) => wrapper.text().toLowerCase().includes('loading'))
        ?.first();
    };

    const loadingNode = await getLoadingNodeInList();

    if (!loadingNode) {
      throw new Error("Unable to find a node without it's node data");
    }
    loadingNode.simulate('click', { button: 0 });
    // the time here is equivalent to the animation duration in the camera reducer
    graphSimulator.runAnimationFramesTimeFromNow(1000);
    return loadingNode.prop('data-test-node-id');
  };

  const identifiedLoadingNodeInGraph: (
    graphSimulator: Simulator,
    nodeIDToFind: string
  ) => Promise<ReactWrapper | undefined> = async (
    graphSimulator: Simulator,
    nodeIDToFind: string
  ) => graphSimulator.resolveWrapper(() => graphSimulator.selectedProcessNode(nodeIDToFind));

  const identifiedLoadingNodeInGraphState: (
    graphSimulator: Simulator,
    nodeIDToFind: string
  ) => Promise<string | undefined> = async (graphSimulator: Simulator, nodeIDToFind: string) =>
    (await graphSimulator.resolveWrapper(() => graphSimulator.selectedProcessNode(nodeIDToFind)))
      ?.find('[data-test-subj="resolver:node:description"]')
      .first()
      .text();

  let generatorDAL: DataAccessLayer;

  beforeEach(async () => {
    const { metadata: dataAccessLayerMetadata, dataAccessLayer } = generateTreeWithDAL({
      ancestors: 3,
      children: 3,
      generations: 4,
    });

    generatorDAL = dataAccessLayer;
    // save a reference to the `_id` supported by the mock data layer
    databaseDocumentID = dataAccessLayerMetadata.databaseDocumentID;
  });

  describe('when clicking on a node in the panel whose node data has not yet been loaded and using a data access layer that returns an error for the clicked node', () => {
    let throwError: boolean;
    let foundLoadingNodeInList: string;
    beforeEach(async () => {
      // all the tests in this describe block will receive an error when loading data for the firstLoadingNodeInListID
      // unless the tests explicitly sets this flag to false
      throwError = true;
      const nodeDataError = ({
        ids,
        timeRange,
        indexPatterns,
        limit,
        agentId,
      }: {
        ids: string[];
        timeRange: TimeRange;
        indexPatterns: string[];
        limit: number;
        agentId: string;
      }): Promise<SafeResolverEvent[]> => {
        if (throwError) {
          throw new Error(
            'simulated error for retrieving first loading node in the process node list'
          );
        }

        return generatorDAL.nodeData({ ids, timeRange, indexPatterns, limit, agentId });
      };

      // create a simulator using most of the generator's data access layer, but let's use our nodeDataError
      // so we can simulator an error when loading data
      simulator = new Simulator({
        databaseDocumentID,
        dataAccessLayer: { ...generatorDAL, nodeData: nodeDataError },
        resolverComponentInstanceID,
        history: createMemoryHistory(),
        indices: [],
        shouldUpdate: false,
        filters: {},
      });

      foundLoadingNodeInList = await findAndClickFirstLoadingNodeInPanel(simulator);
    });

    it('should receive an error while loading the node data', async () => {
      throwError = true;

      await expect(
        simulator.map(async () => ({
          nodeState: await identifiedLoadingNodeInGraphState(simulator, foundLoadingNodeInList),
        }))
      ).toYieldEqualTo({
        nodeState: 'Error Process',
      });
    });

    describe('when completing the navigation to the node that is in an error state and clicking the reload data button', () => {
      beforeEach(async () => {
        throwError = true;
        // ensure that the node is in view
        await identifiedLoadingNodeInGraph(simulator, foundLoadingNodeInList);
        // at this point the node's state should be error

        // don't throw an error now, so we can test that the reload button actually loads the data correctly
        throwError = false;
        const firstLoadingNodeInListButton = await simulator.resolveWrapper(() =>
          simulator.processNodePrimaryButton(foundLoadingNodeInList)
        );
        // Click the primary button to reload the node's data
        if (firstLoadingNodeInListButton) {
          firstLoadingNodeInListButton.simulate('click', { button: 0 });
        }
      });

      it('should load data after receiving an error', async () => {
        // we should receive the node's data now so we'll know that it is terminated
        await expect(
          simulator.map(async () => ({
            nodeState: await identifiedLoadingNodeInGraphState(simulator, foundLoadingNodeInList),
          }))
        ).toYieldEqualTo({
          nodeState: 'Terminated Process',
        });
      });
    });
  });

  describe('when clicking on a node in the process panel that is not loaded', () => {
    let foundLoadingNodeInList: string;
    beforeEach(async () => {
      simulator = new Simulator({
        databaseDocumentID,
        dataAccessLayer: generatorDAL,
        resolverComponentInstanceID,
        history: createMemoryHistory(),
        indices: [],
        shouldUpdate: false,
        filters: {},
      });

      foundLoadingNodeInList = await findAndClickFirstLoadingNodeInPanel(simulator);
    });

    it('should load the node data for the process and mark the process node as terminated in the graph', async () => {
      await expect(
        simulator.map(async () => ({
          nodeState: await identifiedLoadingNodeInGraphState(simulator, foundLoadingNodeInList),
        }))
      ).toYieldEqualTo({
        nodeState: 'Terminated Process',
      });
    });

    describe('when finishing the navigation to the node that is not loaded and navigating back to the process list in the panel', () => {
      beforeEach(async () => {
        // make sure the node is in view
        await identifiedLoadingNodeInGraph(simulator, foundLoadingNodeInList);

        const breadcrumbs = await simulator.resolve(
          'resolver:node-detail:breadcrumbs:node-list-link'
        );

        // navigate back to the node list in the panel
        if (breadcrumbs) {
          breadcrumbs.simulate('click', { button: 0 });
        }
      });

      it('should load the node data and mark it as terminated in the node list', async () => {
        const getNodeInPanelList = async () => {
          // grab the node in the list that has the ID that we're looking for
          return (
            (await simulator.resolve('resolver:node-list:node-link'))
              ?.findWhere((wrapper) => wrapper.prop('data-test-node-id') === foundLoadingNodeInList)
              ?.first()
              // grab the description tag so we can determine the state of the process
              .find('desc')
              .first()
          );
        };

        // check that the panel displays the node as terminated as well
        await expect(
          simulator.map(async () => ({
            nodeState: (await getNodeInPanelList())?.text(),
          }))
        ).toYieldEqualTo({
          nodeState: 'Terminated Process',
        });
      });
    });
  });
});

describe('Resolver, when analyzing a tree that has 2 related registry and 1 related event of all other categories for the origin node', () => {
  beforeEach(() => {
    // create a mock data access layer with related events
    const { metadata: dataAccessLayerMetadata, dataAccessLayer } =
      noAncestorsTwoChildrenWithRelatedEventsOnOrigin();

    // save a reference to the entity IDs exposed by the mock data layer
    entityIDs = dataAccessLayerMetadata.entityIDs;

    // save a reference to the `_id` supported by the mock data layer
    databaseDocumentID = dataAccessLayerMetadata.databaseDocumentID;

    // create a resolver simulator, using the data access layer and an arbitrary component instance ID
    simulator = new Simulator({
      databaseDocumentID,
      dataAccessLayer,
      resolverComponentInstanceID,
      history: createMemoryHistory(),
      indices: [],
      shouldUpdate: false,
      filters: {},
    });
  });

  afterEach(() => {
    simulator.unmount();
  });

  // FLAKY: https://github.com/elastic/kibana/issues/170118
  describe.skip('when it has loaded', () => {
    let originBounds: AABB;
    let firstChildBounds: AABB;
    let secondChildBounds: AABB;
    let edgeStartingCoordinates: Vector2[];
    let edgeTerminalCoordinates: Vector2[];
    beforeEach(async () => {
      await expect(
        simulator.map(() => ({
          graphElements: simulator.testSubject('resolver:graph').length,
          graphLoadingElements: simulator.testSubject('resolver:graph:loading').length,
          graphErrorElements: simulator.testSubject('resolver:graph:error').length,
          originNodeButton: simulator.processNodePrimaryButton(entityIDs.origin).length,
        }))
      ).toYieldEqualTo({
        graphElements: 1,
        graphLoadingElements: 0,
        graphErrorElements: 0,
        originNodeButton: 1,
      });

      originBounds = computedNodeBoundaries(entityIDs.origin);
      firstChildBounds = computedNodeBoundaries(entityIDs.firstChild);
      secondChildBounds = computedNodeBoundaries(entityIDs.secondChild);
      edgeStartingCoordinates = computedEdgeStartingCoordinates();
      edgeTerminalCoordinates = computedEdgeTerminalCoordinates();
    });

    it('should have one and only one outgoing edge from the origin node', () => {
      // This winnows edges to the one(s) that "start" under the origin node
      const edgesThatStartUnderneathOrigin = edgeStartingCoordinates.filter(
        coordinateBoundaryFilter(originBounds)
      );
      expect(edgesThatStartUnderneathOrigin).toHaveLength(1);
    });
    it('leaf nodes should each have one and only one incoming edge', () => {
      const edgesThatTerminateUnderneathFirstChild = edgeTerminalCoordinates.filter(
        coordinateBoundaryFilter(firstChildBounds)
      );
      expect(edgesThatTerminateUnderneathFirstChild).toHaveLength(1);

      const edgesThatTerminateUnderneathSecondChild = edgeTerminalCoordinates.filter(
        coordinateBoundaryFilter(secondChildBounds)
      );
      expect(edgesThatTerminateUnderneathSecondChild).toHaveLength(1);
    });
    it('should show exactly one option with the correct count', async () => {
      await expect(
        simulator.map(() =>
          simulator.testSubject('resolver:map:node-submenu-item').map((node) => node.text())
        )
      ).toYieldEqualTo([
        '1 authentication',
        '1 database',
        '1 driver',
        '1 file',
        '1 host',
        '1 iam',
        '1 intrusion_detection',
        '1 malware',
        '1 network',
        '1 package',
        '1 process',
        '2 registry',
        '1 web',
      ]);
    });
  });
});

/**
 * Get the integer in a CSS px unit string
 * @param px a string with `px` preceded by numbers
 */
function pxNum(px: string): number {
  return parseInt(px.match(/\d+/)![0], 10);
}

/**
 * Get computed boundaries for process node elements
 */
function computedNodeBoundaries(entityID: string): AABB {
  const { left, top, width, height } = getComputedStyle(
    simulator.processNodeElements({ entityID }).getDOMNode()
  );
  return {
    minimum: [pxNum(left), pxNum(top)],
    maximum: [pxNum(left) + pxNum(width), pxNum(top) + pxNum(height)],
  };
}

/**
 * Coordinates for where the edgelines "start"
 */
function computedEdgeStartingCoordinates(): Vector2[] {
  return simulator.testSubject('resolver:graph:edgeline').map((edge) => {
    const { left, top } = getComputedStyle(edge.getDOMNode());
    return [pxNum(left), pxNum(top)];
  });
}

/**
 * Coordinates for where edgelines "end" (after application of transform)
 */
function computedEdgeTerminalCoordinates(): Vector2[] {
  return simulator.testSubject('resolver:graph:edgeline').map((edge) => {
    const { left, top, width, transform } = getComputedStyle(edge.getDOMNode());
    /**
     * Without the transform in the rotation, edgelines lay flat across the x-axis.
     * Plotting the x/y of the line's terminal point here takes the rotation into account.
     * This could cause tests to break if/when certain adjustments are made to the view that might
     * regress the alignment of nodes and edges.
     */
    const edgeLineRotationInRadians = parseFloat(transform.match(/rotateZ\((-?\d+\.?\d+)/i)![1]);
    const rotateDownTo = Math.sin(edgeLineRotationInRadians) * pxNum(width);
    const rotateLeftTo = Math.cos(edgeLineRotationInRadians) * pxNum(width);
    return [pxNum(left) + rotateLeftTo, pxNum(top) + rotateDownTo];
  });
}

/**
 *
 * @param bounds Get a function that filters x/y of edges to those contained in a certain bounding box
 */
function coordinateBoundaryFilter(bounds: AABB) {
  return (coords: Vector2) => {
    return (
      coords[0] >= bounds.minimum[0] &&
      coords[0] <= bounds.maximum[0] &&
      coords[1] >= bounds.minimum[1] &&
      coords[1] <= bounds.maximum[1]
    );
  };
}
