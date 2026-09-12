/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Capabilities, CoreSetup } from '@kbn/core/server';
import { coreMock, httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { asSpaceId } from '@kbn/core-spaces-common';
import type { KibanaFeature } from '@kbn/features-plugin/server';
import { featuresPluginMock } from '@kbn/features-plugin/server/mocks';

import { setupCapabilitiesSwitcher } from './capabilities_switcher';
import type { Space } from '../../common';
import { spacesServiceMock } from '../spaces_service/spaces_service.mock';
import type { SpacesPluginStartDeps } from '../types';

const features = [
  {
    id: 'feature_1',
    name: 'Feature 1',
    app: [],
    category: { id: 'enterpriseSearch' },
    scope: ['spaces', 'security'],
  },
  {
    id: 'feature_2',
    name: 'Feature 2',
    app: ['feature2'],
    scope: ['spaces', 'security'],
    catalogue: ['feature2Entry'],
    management: {
      kibana: ['somethingElse'],
    },
    privileges: {
      all: {
        app: [],
        ui: [],
        savedObject: {
          all: [],
          read: [],
        },
      },
    },
    category: { id: 'observability' },
  },
  {
    id: 'feature_3',
    name: 'Feature 3',
    app: ['feature3_app'],
    scope: ['spaces', 'security'],
    catalogue: ['feature3Entry'],
    management: {
      kibana: ['indices'],
    },
    privileges: {
      all: {
        app: [],
        ui: [],
        savedObject: {
          all: [],
          read: [],
        },
      },
    },
    category: { id: 'securitySolution' },
  },
  {
    // feature 4 intentionally declares the same items as feature 3
    id: 'feature_4',
    name: 'Feature 4',
    app: ['feature3', 'feature3_app'],
    scope: ['spaces', 'security'],
    catalogue: ['feature3Entry'],
    management: {
      kibana: ['indices'],
    },
    privileges: {
      all: {
        app: [],
        ui: [],
        savedObject: {
          all: [],
          read: [],
        },
      },
    },
    category: { id: 'observability' },
  },
  {
    deprecated: { notice: 'It was a mistake.' },
    id: 'deprecated_feature',
    name: 'Deprecated Feature',
    // Expose the same `app` and `catalogue` entries as `feature_2` to make sure they are disabled
    // when `feature_2` is disabled even if the deprecated feature isn't explicitly disabled.
    app: ['feature2'],
    catalogue: ['feature2Entry'],
    category: { id: 'deprecated', label: 'deprecated' },
    privileges: {
      all: {
        savedObject: { all: [], read: [] },
        ui: ['ui_deprecated_all'],
        app: ['feature2'],
        catalogue: ['feature2Entry'],
        replacedBy: [{ feature: 'feature_2', privileges: ['all'] }],
      },
      read: {
        savedObject: { all: [], read: [] },
        ui: ['ui_deprecated_read'],
        app: ['feature2'],
        catalogue: ['feature2Entry'],
        replacedBy: [{ feature: 'feature_2', privileges: ['all'] }],
      },
    },
  },
] as unknown as KibanaFeature[];

const buildCapabilities = () =>
  Object.freeze({
    navLinks: {
      feature1: true,
      feature2: true,
      feature3: true,
      feature3_app: true,
      unknownFeature: true,
    },
    catalogue: {
      discover: true,
      visualize: false,
      feature3Entry: true,
    },
    management: {
      kibana: {
        settings: false,
        indices: true,
        somethingElse: true,
      },
    },
    feature_1: {
      foo: true,
      bar: true,
    },
    feature_2: {
      foo: true,
      bar: true,
    },
    feature_3: {
      foo: true,
      bar: true,
    },
  }) as Capabilities;

const setup = (space: Space) => {
  const coreSetup = coreMock.createSetup();

  const featuresStart = featuresPluginMock.createStart();
  featuresStart.getKibanaFeatures.mockReturnValue(features);

  coreSetup.getStartServices.mockResolvedValue([
    coreMock.createStart(),
    { features: featuresStart },
    {},
  ]);

  const spacesService = spacesServiceMock.createStartContract();
  spacesService.getActiveSpace.mockResolvedValue(space);

  const logger = loggingSystemMock.createLogger();

  const switcher = setupCapabilitiesSwitcher(
    coreSetup as unknown as CoreSetup<SpacesPluginStartDeps>,
    () => spacesService,
    logger
  );

  return { switcher, logger, spacesService };
};

describe('capabilitiesSwitcher', () => {
  it('does not toggle capabilities when the space has no disabled features', async () => {
    const space: Space = {
      id: asSpaceId('space'),
      name: '',
      disabledFeatures: [],
    };

    const capabilities = buildCapabilities();

    const { switcher } = setup(space);
    const request = httpServerMock.createKibanaRequest();
    const result = await switcher(request, capabilities, false);

    expect(result).toEqual(buildCapabilities());
  });

  it('does not toggle capabilities when the request is not authenticated', async () => {
    const space: Space = {
      id: asSpaceId('space'),
      name: '',
      disabledFeatures: ['feature_1', 'feature_2', 'feature_3'],
    };

    const capabilities = buildCapabilities();

    const { switcher, spacesService } = setup(space);
    const request = httpServerMock.createKibanaRequest({ routeAuthRequired: false });

    const result = await switcher(request, capabilities, false);

    expect(result).toEqual({});
    expect(spacesService.getActiveSpace).not.toHaveBeenCalled();
  });

  it('does not toggle capabilities when the default capabilities are requested', async () => {
    const space: Space = {
      id: asSpaceId('space'),
      name: '',
      disabledFeatures: ['feature_1', 'feature_2', 'feature_3'],
    };

    const capabilities = buildCapabilities();

    const { switcher, spacesService } = setup(space);
    const request = httpServerMock.createKibanaRequest();

    const result = await switcher(request, capabilities, true);

    expect(result).toEqual({});
    expect(spacesService.getActiveSpace).not.toHaveBeenCalled();
  });

  it('logs a debug message, and does not toggle capabilities if an error is encountered', async () => {
    const space: Space = {
      id: asSpaceId('space'),
      name: '',
      disabledFeatures: ['feature_1', 'feature_2', 'feature_3'],
    };

    const capabilities = buildCapabilities();

    const { switcher, logger, spacesService } = setup(space);
    const request = httpServerMock.createKibanaRequest();

    spacesService.getActiveSpace.mockRejectedValue(new Error('Something terrible happened'));

    const result = await switcher(request, capabilities, false);

    expect(result).toEqual(buildCapabilities());
    expect(logger.debug).toHaveBeenCalledWith(
      `Error toggling capabilities for request to /path: Error: Something terrible happened`
    );
  });

  it('ignores unknown disabledFeatures', async () => {
    const space: Space = {
      id: asSpaceId('space'),
      name: '',
      disabledFeatures: ['i-do-not-exist'],
    };

    const capabilities = buildCapabilities();

    const { switcher } = setup(space);
    const request = httpServerMock.createKibanaRequest();
    const result = await switcher(request, capabilities, false);

    expect(result).toEqual(buildCapabilities());
  });

  it('disables the corresponding navLink, catalogue, management sections, and all capability flags for disabled features', async () => {
    const space: Space = {
      id: asSpaceId('space'),
      name: '',
      disabledFeatures: ['feature_2'],
    };

    const capabilities = buildCapabilities();

    const { switcher } = setup(space);
    const request = httpServerMock.createKibanaRequest();
    const result = await switcher(request, capabilities, false);

    const expectedCapabilities = buildCapabilities();

    expectedCapabilities.navLinks.feature2 = false;
    expectedCapabilities.catalogue.feature2Entry = false;
    expectedCapabilities.management.kibana.somethingElse = false;
    expectedCapabilities.feature_2.bar = false;
    expectedCapabilities.feature_2.foo = false;

    expect(result).toEqual(expectedCapabilities);
  });

  it('does not disable catalogue, management, or app entries when they are shared with an enabled feature', async () => {
    const space: Space = {
      id: asSpaceId('space'),
      name: '',
      disabledFeatures: ['feature_3'],
    };

    const capabilities = buildCapabilities();

    const { switcher } = setup(space);
    const request = httpServerMock.createKibanaRequest();
    const result = await switcher(request, capabilities, false);

    const expectedCapabilities = buildCapabilities();

    // These capabilities are shared by feature_4, which is enabled
    expectedCapabilities.navLinks.feature3 = true;
    expectedCapabilities.navLinks.feature3_app = true;
    expectedCapabilities.catalogue.feature3Entry = true;
    expectedCapabilities.management.kibana.indices = true;
    // These capabilities are only exposed by feature_3, which is disabled
    expectedCapabilities.feature_3.bar = false;
    expectedCapabilities.feature_3.foo = false;

    expect(result).toEqual(expectedCapabilities);
  });

  it('can disable everything', async () => {
    const space: Space = {
      id: asSpaceId('space'),
      name: '',
      disabledFeatures: ['feature_1', 'feature_2', 'feature_3', 'feature_4'],
    };

    const capabilities = buildCapabilities();

    const { switcher } = setup(space);
    const request = httpServerMock.createKibanaRequest();
    const result = await switcher(request, capabilities, false);

    const expectedCapabilities = buildCapabilities();

    expectedCapabilities.feature_1.bar = false;
    expectedCapabilities.feature_1.foo = false;

    expectedCapabilities.navLinks.feature2 = false;
    expectedCapabilities.catalogue.feature2Entry = false;
    expectedCapabilities.management.kibana.somethingElse = false;
    expectedCapabilities.feature_2.bar = false;
    expectedCapabilities.feature_2.foo = false;

    expectedCapabilities.navLinks.feature3 = false;
    expectedCapabilities.navLinks.feature3_app = false;
    expectedCapabilities.catalogue.feature3Entry = false;
    expectedCapabilities.management.kibana.indices = false;
    expectedCapabilities.feature_3.bar = false;
    expectedCapabilities.feature_3.foo = false;

    expect(result).toEqual(expectedCapabilities);
  });

  describe('when the space has a solution set', () => {
    it('does toggles capabilities of the solutions different from the space one even when the space has no disabled features', async () => {
      const space: Space = {
        id: asSpaceId('space'),
        name: '',
        disabledFeatures: [],
      };

      const capabilities = buildCapabilities();

      const { switcher } = setup(space);
      const request = httpServerMock.createKibanaRequest();

      {
        space.solution = 'es';

        // It should disable observability and securitySolution features
        // which correspond to feature_2 and feature_3
        const result = await switcher(request, capabilities, false);

        const expectedCapabilities = buildCapabilities();

        expectedCapabilities.navLinks.feature2 = false;
        expectedCapabilities.catalogue.feature2Entry = false;
        expectedCapabilities.navLinks.feature3 = false;
        expectedCapabilities.catalogue.feature3Entry = false;
        expectedCapabilities.navLinks.feature3_app = false;
        expectedCapabilities.management.kibana.indices = false;
        expectedCapabilities.management.kibana.somethingElse = false;
        expectedCapabilities.feature_2.bar = false;
        expectedCapabilities.feature_2.foo = false;
        expectedCapabilities.feature_3.bar = false;
        expectedCapabilities.feature_3.foo = false;

        expect(result).toEqual(expectedCapabilities);
      }

      {
        space.solution = 'oblt';

        // It should disable enterpriseSearch and securitySolution features
        // which correspond to feature_1 and feature_3
        const result = await switcher(request, capabilities, false);

        const expectedCapabilities = buildCapabilities();

        expectedCapabilities.feature_1.bar = false;
        expectedCapabilities.feature_1.foo = false;
        expectedCapabilities.feature_3.bar = false;
        expectedCapabilities.feature_3.foo = false;

        expect(result).toEqual(expectedCapabilities);
      }

      {
        space.solution = 'security';

        // It should disable enterpriseSearch and observability features
        // which correspond to feature_1 and feature_2
        const result = await switcher(request, capabilities, false);

        const expectedCapabilities = buildCapabilities();

        expectedCapabilities.navLinks.feature2 = false;
        expectedCapabilities.catalogue.feature2Entry = false;
        expectedCapabilities.navLinks.feature3 = false;
        expectedCapabilities.management.kibana.somethingElse = false;
        expectedCapabilities.feature_1.bar = false;
        expectedCapabilities.feature_1.foo = false;
        expectedCapabilities.feature_2.bar = false;
        expectedCapabilities.feature_2.foo = false;

        expect(result).toEqual(expectedCapabilities);
      }
    });
  });
});
