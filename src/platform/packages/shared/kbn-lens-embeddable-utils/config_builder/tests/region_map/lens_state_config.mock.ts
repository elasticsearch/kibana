/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { LensAttributes } from '../../types';
import { LENS_ITEM_LATEST_VERSION } from '@kbn/lens-common/content_management/constants';

/**
 * Simple region map generated from kibana
 */
export const regionMapAttributes = {
  title: 'Region Map',
  description: 'Region Map without ems',
  visualizationType: 'lnsChoropleth',
  state: {
    visualization: {
      layerId: '7efe76bb-37cd-4229-924c-d91828e13498',
      layerType: 'data',
      regionAccessor: 'e2c263f9-1dc4-4f27-9fdb-a4b656d94bec',
      valueAccessor: 'f53fe9ac-a698-41df-b446-6c0fb731bd53',
    },
    query: {
      query: '',
      language: 'kuery',
    },
    filters: [],
    datasourceStates: {
      formBased: {
        layers: {
          '7efe76bb-37cd-4229-924c-d91828e13498': {
            columns: {
              'e2c263f9-1dc4-4f27-9fdb-a4b656d94bec': {
                label: 'Top 5 values of geo.dest',
                dataType: 'string',
                operationType: 'terms',
                sourceField: 'geo.dest',
                isBucketed: true,
                params: {
                  // @ts-expect-error
                  size: 5,
                  orderBy: {
                    type: 'column',
                    columnId: 'f53fe9ac-a698-41df-b446-6c0fb731bd53',
                  },
                  orderDirection: 'desc',
                  otherBucket: true,
                  missingBucket: false,
                  parentFormat: {
                    id: 'terms',
                  },
                  include: [],
                  exclude: [],
                  includeIsRegex: false,
                  excludeIsRegex: false,
                },
              },
              'f53fe9ac-a698-41df-b446-6c0fb731bd53': {
                label: 'Count of records',
                dataType: 'number',
                operationType: 'count',
                isBucketed: false,
                sourceField: '___records___',
                params: {
                  // @ts-expect-error
                  emptyAsNull: true,
                },
              },
            },
            columnOrder: [
              'e2c263f9-1dc4-4f27-9fdb-a4b656d94bec',
              'f53fe9ac-a698-41df-b446-6c0fb731bd53',
            ],
            sampling: 1,
            ignoreGlobalFilters: false,
            incompleteColumns: {},
          },
        },
      },
      indexpattern: {
        layers: {},
      },
      textBased: {
        layers: {},
      },
    },
    internalReferences: [],
    adHocDataViews: {},
  },
  references: [
    {
      type: 'index-pattern',
      id: '90943e30-9a47-11e8-b64d-95841ca0b247',
      name: 'indexpattern-datasource-layer-7efe76bb-37cd-4229-924c-d91828e13498',
    },
  ],
} satisfies LensAttributes;

/**
 * Region map generated from kibana with ems
 */
export const regionMapAttributesWithEms = {
  title: 'Region Map',
  description: 'Region Map with ems',
  visualizationType: 'lnsChoropleth',
  state: {
    visualization: {
      layerId: '7efe76bb-37cd-4229-924c-d91828e13498',
      layerType: 'data',
      regionAccessor: 'e2c263f9-1dc4-4f27-9fdb-a4b656d94bec',
      valueAccessor: 'f53fe9ac-a698-41df-b446-6c0fb731bd53',
      emsLayerId: 'world_countries',
      emsField: 'iso2',
    },
    query: {
      query: '',
      language: 'kuery',
    },
    filters: [],
    datasourceStates: {
      formBased: {
        layers: {
          '7efe76bb-37cd-4229-924c-d91828e13498': {
            columns: {
              'e2c263f9-1dc4-4f27-9fdb-a4b656d94bec': {
                label: 'Top 5 values of geo.dest',
                dataType: 'string',
                operationType: 'terms',
                sourceField: 'geo.dest',
                isBucketed: true,
                params: {
                  // @ts-expect-error
                  size: 5,
                  orderBy: {
                    type: 'column',
                    columnId: 'f53fe9ac-a698-41df-b446-6c0fb731bd53',
                  },
                  orderDirection: 'desc',
                  otherBucket: true,
                  missingBucket: false,
                  parentFormat: {
                    id: 'terms',
                  },
                  include: [],
                  exclude: [],
                  includeIsRegex: false,
                  excludeIsRegex: false,
                },
              },
              'f53fe9ac-a698-41df-b446-6c0fb731bd53': {
                label: 'Count of records',
                dataType: 'number',
                operationType: 'count',
                isBucketed: false,
                sourceField: '___records___',
                params: {
                  // @ts-expect-error
                  emptyAsNull: true,
                },
              },
            },
            columnOrder: [
              'e2c263f9-1dc4-4f27-9fdb-a4b656d94bec',
              'f53fe9ac-a698-41df-b446-6c0fb731bd53',
            ],
            sampling: 1,
            ignoreGlobalFilters: false,
            incompleteColumns: {},
            indexPatternId: '90943e30-9a47-11e8-b64d-95841ca0b247',
          },
        },
        currentIndexPatternId: '90943e30-9a47-11e8-b64d-95841ca0b247',
      },
      indexpattern: {
        layers: {},
        currentIndexPatternId: '90943e30-9a47-11e8-b64d-95841ca0b247',
      },
      textBased: {
        layers: {},
      },
    },
    internalReferences: [],
    adHocDataViews: {},
  },
  version: LENS_ITEM_LATEST_VERSION,
  references: [
    {
      type: 'index-pattern',
      id: '90943e30-9a47-11e8-b64d-95841ca0b247',
      name: 'indexpattern-datasource-layer-7efe76bb-37cd-4229-924c-d91828e13498',
    },
  ],
} satisfies LensAttributes;

/**
 * Region map generated from kibana with filters for region
 */
export const regionMapAttributesWithFilterForRegion = {
  title: 'Region Map',
  description: 'Region map with filters for region',
  visualizationType: 'lnsChoropleth',
  state: {
    visualization: {
      layerId: '7dfc6317-067b-48e3-b8b8-3fc2c51ec1f1',
      layerType: 'data',
      regionAccessor: 'e128b145-24bb-4f14-92ad-80c6141e14e4',
      emsLayerId: 'world_countries',
      emsField: 'iso2',
      valueAccessor: '780c178b-3fae-48d0-af31-493c007ce732',
    },
    query: {
      query: '',
      language: 'kuery',
    },
    filters: [],
    datasourceStates: {
      formBased: {
        layers: {
          '7dfc6317-067b-48e3-b8b8-3fc2c51ec1f1': {
            columns: {
              'e128b145-24bb-4f14-92ad-80c6141e14e4': {
                label: 'Filters',
                dataType: 'string',
                operationType: 'filters',
                isBucketed: true,
                params: {
                  // @ts-expect-error Check why this is here
                  filters: [
                    {
                      input: {
                        query: 'geo.dest : "US"',
                        language: 'kuery',
                      },
                      label: 'US',
                    },
                  ],
                },
              },
              '780c178b-3fae-48d0-af31-493c007ce732': {
                label: 'Count of records',
                dataType: 'number',
                operationType: 'count',
                isBucketed: false,
                sourceField: '___records___',
                params: {
                  // @ts-expect-error
                  emptyAsNull: true,
                },
              },
            },
            columnOrder: [
              'e128b145-24bb-4f14-92ad-80c6141e14e4',
              '780c178b-3fae-48d0-af31-493c007ce732',
            ],
            sampling: 1,
            ignoreGlobalFilters: false,
            incompleteColumns: {},
          },
        },
      },
      indexpattern: {
        layers: {},
      },
      textBased: {
        layers: {},
      },
    },
    internalReferences: [],
    adHocDataViews: {},
  },
  version: LENS_ITEM_LATEST_VERSION,
  references: [
    {
      type: 'index-pattern',
      id: '90943e30-9a47-11e8-b64d-95841ca0b247',
      name: 'indexpattern-datasource-layer-7dfc6317-067b-48e3-b8b8-3fc2c51ec1f1',
    },
  ],
} satisfies LensAttributes;

/**
 * ESQL Region map generated from kibana
 */
export const regionMapESQLAttributes = {
  title: 'Region Map ESQL',
  visualizationType: 'lnsChoropleth',
  state: {
    visualization: {
      layerId: '5644872f-3b96-4074-a92d-dd613ceff2a2',
      layerType: 'data',
      regionAccessor: 'a5d68e53-9965-482b-b38e-42aa1bcd3e75',
      valueAccessor: 'e71a4f1b-7cc0-4fcc-8223-a5a2d2a28d52',
    },
    query: {
      esql: 'FROM kibana_sample_data_logs | LIMIT 10',
    },
    filters: [],
    datasourceStates: {
      textBased: {
        layers: {
          '74783f97-43c8-4e2d-b07f-2691260f55b3': {
            index: 'e3465e67bdeced2befff9f9dca7ecf9c48504cad68a10efd881f4c7dd5ade28a',
            query: {
              esql: 'FROM kibana_sample_data_logs | LIMIT 10',
            },
            columns: [],
            timeField: '@timestamp',
          },
          '5644872f-3b96-4074-a92d-dd613ceff2a2': {
            index: 'e3465e67bdeced2befff9f9dca7ecf9c48504cad68a10efd881f4c7dd5ade28a',
            query: {
              esql: 'FROM kibana_sample_data_logs | LIMIT 10',
            },
            columns: [
              {
                columnId: 'a5d68e53-9965-482b-b38e-42aa1bcd3e75',
                fieldName: 'geo.dest',
                meta: {
                  type: 'string',
                  esType: 'keyword',
                  sourceParams: {
                    indexPattern: 'kibana_sample_data_logs',
                    sourceField: 'geo.dest',
                  },
                  params: {
                    id: 'string',
                  },
                },
                label: 'geo.dest',
              },
              {
                columnId: 'e71a4f1b-7cc0-4fcc-8223-a5a2d2a28d52',
                fieldName: 'bytes',
                meta: {
                  type: 'number',
                  esType: 'long',
                  sourceParams: {
                    indexPattern: 'kibana_sample_data_logs',
                    sourceField: 'bytes',
                  },
                  params: {
                    id: 'number',
                  },
                },
                label: 'bytes',
              },
            ],
          },
        },
      },
    },
    internalReferences: [
      {
        type: 'index-pattern',
        id: 'e3465e67bdeced2befff9f9dca7ecf9c48504cad68a10efd881f4c7dd5ade28a',
        name: 'textBasedLanguages-datasource-layer-74783f97-43c8-4e2d-b07f-2691260f55b3',
      },
      {
        type: 'index-pattern',
        id: 'e3465e67bdeced2befff9f9dca7ecf9c48504cad68a10efd881f4c7dd5ade28a',
        name: 'textBasedLanguages-datasource-layer-5644872f-3b96-4074-a92d-dd613ceff2a2',
      },
    ],
    adHocDataViews: {
      e3465e67bdeced2befff9f9dca7ecf9c48504cad68a10efd881f4c7dd5ade28a: {
        id: 'e3465e67bdeced2befff9f9dca7ecf9c48504cad68a10efd881f4c7dd5ade28a',
        title: 'kibana_sample_data_logs',
        timeFieldName: '@timestamp',
        sourceFilters: [],
        type: 'esql',
        fieldFormats: {},
        runtimeFieldMap: {},
        allowNoIndex: false,
        name: 'kibana_sample_data_logs',
        allowHidden: false,
        managed: false,
      },
    },
  },
  version: LENS_ITEM_LATEST_VERSION,
  references: [],
} satisfies LensAttributes;

/**
 * ESQL Region map generated from kibana with EMS
 */
export const regionmapESQLAttributesWithEms = {
  title: 'ESQL Region Map with EMS',
  visualizationType: 'lnsChoropleth',
  state: {
    visualization: {
      layerId: '5644872f-3b96-4074-a92d-dd613ceff2a2',
      layerType: 'data',
      regionAccessor: 'a5d68e53-9965-482b-b38e-42aa1bcd3e75',
      valueAccessor: 'e71a4f1b-7cc0-4fcc-8223-a5a2d2a28d52',
      emsLayerId: 'world_countries',
      emsField: 'iso2',
    },
    query: {
      esql: 'FROM kibana_sample_data_logs | LIMIT 10',
    },
    filters: [],
    datasourceStates: {
      textBased: {
        layers: {
          '74783f97-43c8-4e2d-b07f-2691260f55b3': {
            index: 'e3465e67bdeced2befff9f9dca7ecf9c48504cad68a10efd881f4c7dd5ade28a',
            query: {
              esql: 'FROM kibana_sample_data_logs | LIMIT 10',
            },
            columns: [],
            timeField: '@timestamp',
          },
          '5644872f-3b96-4074-a92d-dd613ceff2a2': {
            index: 'e3465e67bdeced2befff9f9dca7ecf9c48504cad68a10efd881f4c7dd5ade28a',
            query: {
              esql: 'FROM kibana_sample_data_logs | LIMIT 10',
            },
            columns: [
              {
                columnId: 'a5d68e53-9965-482b-b38e-42aa1bcd3e75',
                fieldName: 'geo.dest',
                meta: {
                  type: 'string',
                  esType: 'keyword',
                  sourceParams: {
                    indexPattern: 'kibana_sample_data_logs',
                    sourceField: 'geo.dest',
                  },
                  params: {
                    id: 'string',
                  },
                },
                label: 'geo.dest',
              },
              {
                columnId: 'e71a4f1b-7cc0-4fcc-8223-a5a2d2a28d52',
                fieldName: 'bytes',
                meta: {
                  type: 'number',
                  esType: 'long',
                  sourceParams: {
                    indexPattern: 'kibana_sample_data_logs',
                    sourceField: 'bytes',
                  },
                  params: {
                    id: 'number',
                  },
                },
                label: 'bytes',
              },
            ],
          },
        },
      },
    },
    internalReferences: [
      {
        type: 'index-pattern',
        id: 'e3465e67bdeced2befff9f9dca7ecf9c48504cad68a10efd881f4c7dd5ade28a',
        name: 'textBasedLanguages-datasource-layer-74783f97-43c8-4e2d-b07f-2691260f55b3',
      },
      {
        type: 'index-pattern',
        id: 'e3465e67bdeced2befff9f9dca7ecf9c48504cad68a10efd881f4c7dd5ade28a',
        name: 'textBasedLanguages-datasource-layer-5644872f-3b96-4074-a92d-dd613ceff2a2',
      },
    ],
    adHocDataViews: {
      e3465e67bdeced2befff9f9dca7ecf9c48504cad68a10efd881f4c7dd5ade28a: {
        id: 'e3465e67bdeced2befff9f9dca7ecf9c48504cad68a10efd881f4c7dd5ade28a',
        title: 'kibana_sample_data_logs',
        timeFieldName: '@timestamp',
        sourceFilters: [],
        type: 'esql',
        fieldFormats: {},
        runtimeFieldMap: {},
        allowNoIndex: false,
        name: 'kibana_sample_data_logs',
        allowHidden: false,
        managed: false,
      },
    },
  },
  version: LENS_ITEM_LATEST_VERSION,
  references: [],
} satisfies LensAttributes;
