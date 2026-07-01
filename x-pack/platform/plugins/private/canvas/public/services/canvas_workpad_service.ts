/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsResolveResponse, SavedObject } from '@kbn/core-saved-objects-api-server';
import { buildPath } from '@kbn/core-http-browser';
import {
  API_ROUTE_TEMPLATES,
  API_ROUTE_WORKPAD,
  API_ROUTE_WORKPAD_ASSETS,
  API_ROUTE_WORKPAD_STRUCTURES,
  DEFAULT_WORKPAD_CSS,
} from '../../common/lib';
import type { CanvasTemplate, CanvasWorkpad } from '../../types';
import { coreServices } from './kibana_services';

export type FoundWorkpads = Array<Pick<CanvasWorkpad, 'name' | 'id' | '@timestamp' | '@created'>>;
export type FoundWorkpad = FoundWorkpads[number];
export interface WorkpadFindResponse {
  total: number;
  workpads: FoundWorkpads;
}

export interface TemplateFindResponse {
  templates: CanvasTemplate[];
}

export interface UpdateWorkpadResponse {
  ok: boolean;
  // The server re-stamps the modified time on every save and returns it so the
  // client can sync it into state.
  '@timestamp'?: string;
}

export interface ResolveWorkpadResponse {
  workpad: CanvasWorkpad;
  outcome: SavedObjectsResolveResponse['outcome'];
  aliasId?: SavedObjectsResolveResponse['alias_target_id'];
  aliasPurpose?: SavedObjectsResolveResponse['alias_purpose'];
}

/*
  Remove any top level keys from the workpad which will be rejected by validation
*/
const validKeys = [
  '@created',
  '@timestamp',
  'assets',
  'colors',
  'css',
  'variables',
  'height',
  'id',
  'isWriteable',
  'name',
  'page',
  'pages',
  'width',
];

const sanitizeWorkpad = function (workpad: CanvasWorkpad) {
  const workpadKeys = Object.keys(workpad);

  for (const key of workpadKeys) {
    if (!validKeys.includes(key)) {
      delete (workpad as { [key: string]: any })[key];
    }
  }

  return workpad;
};

class CanvasWorkpadService {
  private apiPath = `${API_ROUTE_WORKPAD}`;

  public async get(id: string): Promise<CanvasWorkpad> {
    const workpad = await coreServices.http.get<CanvasWorkpad>(
      buildPath(`${this.apiPath}/{id}`, { id }),
      {
        version: '1',
      }
    );

    return {
      ...workpad,
      css: workpad.css ?? DEFAULT_WORKPAD_CSS,
      variables: workpad.variables ?? [],
    };
  }

  public async export(id: string) {
    const workpad = await coreServices.http.get<SavedObject<CanvasWorkpad>>(
      `${this.apiPath}/export/${id}`,
      { version: '1' }
    );
    const { attributes } = workpad;

    return {
      ...workpad,
      attributes: {
        ...attributes,
        css: attributes.css ?? DEFAULT_WORKPAD_CSS,
        variables: attributes.variables ?? [],
      },
    };
  }

  public async resolve(id: string): Promise<ResolveWorkpadResponse> {
    const { workpad, ...resolveProps } = await coreServices.http.get<ResolveWorkpadResponse>(
      `${this.apiPath}/resolve/${id}`,
      { version: '1' }
    );

    return {
      ...resolveProps,
      workpad: {
        // @ts-ignore: Shimming legacy workpads that might not have CSS
        css: DEFAULT_WORKPAD_CSS,
        // @ts-ignore: Shimming legacy workpads that might not have variables
        variables: [],
        ...workpad,
      },
    };
  }

  public async create(workpad: CanvasWorkpad): Promise<CanvasWorkpad> {
    return await coreServices.http.post(this.apiPath, {
      body: JSON.stringify({
        ...sanitizeWorkpad({ ...workpad }),
        assets: workpad.assets || {},
        variables: workpad.variables || [],
      }),
      version: '1',
    });
  }

  public async import(workpad: CanvasWorkpad): Promise<CanvasWorkpad> {
    return await coreServices.http.post(`${this.apiPath}/import`, {
      body: JSON.stringify({
        ...sanitizeWorkpad({ ...workpad }),
        assets: workpad.assets || {},
        variables: workpad.variables || [],
      }),
      version: '1',
    });
  }

  public async createFromTemplate(templateId: string): Promise<CanvasWorkpad> {
    return await coreServices.http.post(this.apiPath, {
      body: JSON.stringify({ templateId }),
      version: '1',
    });
  }

  public async findTemplates(): Promise<TemplateFindResponse> {
    return await coreServices.http.get(API_ROUTE_TEMPLATES, { version: '1' });
  }

  public async find(searchTerm: string): Promise<WorkpadFindResponse> {
    // TODO: this shouldn't be necessary.  Check for usage.
    const validSearchTerm = typeof searchTerm === 'string' && searchTerm.length > 0;

    return await coreServices.http.get(`${this.apiPath}/find`, {
      query: {
        perPage: 10000,
        name: validSearchTerm ? searchTerm : '',
      },
      version: '1',
    });
  }

  public async remove(id: string) {
    return await coreServices.http.delete(buildPath(`${this.apiPath}/{id}`, { id }), {
      version: '1',
    });
  }

  public async update(id: string, workpad: CanvasWorkpad) {
    return await coreServices.http.put(buildPath(`${this.apiPath}/{id}`, { id }), {
      body: JSON.stringify({ ...sanitizeWorkpad({ ...workpad }) }),
      version: '1',
    });
  }

  public async updateWorkpad(id: string, workpad: CanvasWorkpad): Promise<UpdateWorkpadResponse> {
    return await coreServices.http.put<UpdateWorkpadResponse>(
      buildPath(`${API_ROUTE_WORKPAD_STRUCTURES}/{id}`, { id }),
      {
        body: JSON.stringify({ ...sanitizeWorkpad({ ...workpad }) }),
        version: '1',
      }
    );
  }

  public async updateAssets(id: string, assets: CanvasWorkpad['assets']) {
    return await coreServices.http.put(buildPath(`${API_ROUTE_WORKPAD_ASSETS}/{id}`, { id }), {
      body: JSON.stringify(assets),
      version: '1',
    });
  }
}

let canvasWorkpadService: CanvasWorkpadService;

export const getCanvasWorkpadService: () => CanvasWorkpadService = () => {
  if (!canvasWorkpadService) {
    canvasWorkpadService = new CanvasWorkpadService();
  }
  return canvasWorkpadService;
};
