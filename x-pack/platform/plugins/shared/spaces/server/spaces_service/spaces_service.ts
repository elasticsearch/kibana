/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { DEFAULT_SPACE_ID, type SpaceId } from '@kbn/core-spaces-common';

import type { Space } from '../../common';
import { namespaceToSpaceId, spaceIdToNamespace } from '../lib/utils/namespace';
import type { ISpacesClient, SpacesClientServiceStart } from '../spaces_client';

/**
 * The Spaces service setup contract.
 */
export interface SpacesServiceSetup {
  /**
   * Retrieves the space id associated with the provided request.
   * @param request the request.
   */
  getSpaceId(request: KibanaRequest): SpaceId;

  /**
   * Converts the provided space id into the corresponding Saved Objects `namespace` id.
   * @param spaceId the space id to convert.
   */
  spaceIdToNamespace(spaceId: string): string | undefined;

  /**
   * Converts the provided namespace into the corresponding space id.
   * @param namespace the namespace to convert.
   */
  namespaceToSpaceId(namespace: string | undefined): string;
}

/**
 * The Spaces service start contract.
 */
export interface SpacesServiceStart {
  /**
   * Creates a scoped instance of the SpacesClient.
   * @param request the request.
   */
  createSpacesClient: (request: KibanaRequest) => ISpacesClient;

  /**
   * Retrieves the space id associated with the provided request.
   * @param request the request.
   */
  getSpaceId(request: KibanaRequest): SpaceId;

  /**
   * Indicates if the provided request is executing within the context of the `default` space.
   * @param request the request.
   */
  isInDefaultSpace(request: KibanaRequest): boolean;

  /**
   * Retrieves the Space associated with the provided request.
   * @param request the request.
   */
  getActiveSpace(request: KibanaRequest): Promise<Space>;

  /**
   * Converts the provided space id into the corresponding Saved Objects `namespace` id.
   * @param spaceId the space id to convert.
   */
  spaceIdToNamespace(spaceId: string): string | undefined;

  /**
   * Converts the provided namespace into the corresponding space id.
   * @param namespace the namespace to convert.
   */
  namespaceToSpaceId(namespace: string | undefined): string;
}

interface SpacesServiceStartDeps {
  spacesClientService: SpacesClientServiceStart;
}

/**
 * Service for interacting with spaces.
 */
export class SpacesService {
  public setup(): SpacesServiceSetup {
    return {
      getSpaceId: (request: KibanaRequest) => request.spaceId ?? DEFAULT_SPACE_ID,
      spaceIdToNamespace,
      namespaceToSpaceId,
    };
  }

  public start({ spacesClientService }: SpacesServiceStartDeps): SpacesServiceStart {
    return {
      getSpaceId: (request: KibanaRequest) => request.spaceId ?? DEFAULT_SPACE_ID,

      getActiveSpace: (request: KibanaRequest) =>
        spacesClientService.createSpacesClient(request).get(request.spaceId ?? DEFAULT_SPACE_ID),

      isInDefaultSpace: (request: KibanaRequest) =>
        (request.spaceId ?? DEFAULT_SPACE_ID) === DEFAULT_SPACE_ID,

      createSpacesClient: (request: KibanaRequest) =>
        spacesClientService.createSpacesClient(request),

      spaceIdToNamespace,
      namespaceToSpaceId,
    };
  }

  public stop() {}
}
