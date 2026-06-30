/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { alertFieldMap, legacyAlertFieldMap, type FieldMap } from '@kbn/alerts-as-data-utils';
import { mappingFromFieldMap } from './mapping_from_field_map';

export const testFieldMap: FieldMap = {
  date_field: {
    type: 'date',
    array: false,
    required: true,
  },
  keyword_field: {
    type: 'keyword',
    array: false,
    required: false,
    ignore_above: 1024,
  },
  long_field: {
    type: 'long',
    array: false,
    required: false,
  },
  multifield_field: {
    type: 'keyword',
    array: false,
    required: false,
    ignore_above: 1024,
    multi_fields: [
      {
        flat_name: 'multifield_field.text',
        name: 'text',
        type: 'match_only_text',
      },
    ],
  },
  geopoint_field: {
    type: 'geo_point',
    array: false,
    required: false,
  },
  ip_field: {
    type: 'ip',
    array: false,
    required: false,
  },
  array_field: {
    type: 'keyword',
    array: true,
    required: false,
    ignore_above: 1024,
  },
  nested_array_field: {
    type: 'nested',
    array: false,
    required: false,
  },
  'nested_array_field.field1': {
    type: 'keyword',
    array: false,
    required: false,
    ignore_above: 1024,
  },
  'nested_array_field.field2': {
    type: 'keyword',
    array: false,
    required: false,
    ignore_above: 1024,
  },
  scaled_float_field: {
    type: 'scaled_float',
    array: false,
    required: false,
    scaling_factor: 1000,
  },
  constant_keyword_field: {
    type: 'constant_keyword',
    array: false,
    required: false,
  },
  'parent_field.child1': {
    type: 'keyword',
    array: false,
    required: false,
    ignore_above: 1024,
  },
  'parent_field.child2': {
    type: 'keyword',
    array: false,
    required: false,
    ignore_above: 1024,
  },
  unmapped_object: {
    type: 'object',
    required: false,
    enabled: false,
  },
  formatted_field: {
    type: 'date_range',
    required: false,
    format: 'epoch_millis||strict_date_optional_time',
  },
  // this field should be skipped in the mapping
  unmapped_field: {
    type: 'unmapped',
    required: false,
  },
};
export const expectedTestMapping = {
  properties: {
    array_field: {
      ignore_above: 1024,
      type: 'keyword',
    },
    constant_keyword_field: {
      type: 'constant_keyword',
    },
    date_field: {
      type: 'date',
    },
    multifield_field: {
      fields: {
        text: {
          type: 'match_only_text',
        },
      },
      ignore_above: 1024,
      type: 'keyword',
    },
    geopoint_field: {
      type: 'geo_point',
    },
    ip_field: {
      type: 'ip',
    },
    keyword_field: {
      ignore_above: 1024,
      type: 'keyword',
    },
    long_field: {
      type: 'long',
    },
    nested_array_field: {
      properties: {
        field1: {
          ignore_above: 1024,
          type: 'keyword',
        },
        field2: {
          ignore_above: 1024,
          type: 'keyword',
        },
      },
      type: 'nested',
    },
    parent_field: {
      properties: {
        child1: {
          ignore_above: 1024,
          type: 'keyword',
        },
        child2: {
          ignore_above: 1024,
          type: 'keyword',
        },
      },
    },
    scaled_float_field: {
      scaling_factor: 1000,
      type: 'scaled_float',
    },
    unmapped_object: {
      enabled: false,
      type: 'object',
    },
    formatted_field: {
      type: 'date_range',
      format: 'epoch_millis||strict_date_optional_time',
    },
  },
};

describe('mappingFromFieldMap', () => {
  it('correctly creates mapping from field map', () => {
    expect(mappingFromFieldMap(testFieldMap)).toEqual({
      dynamic: 'strict',
      ...expectedTestMapping,
    });
    expect(mappingFromFieldMap(alertFieldMap)).toEqual({
      dynamic: 'strict',
      properties: {
        '@timestamp': {
          ignore_malformed: false,
          type: 'date',
        },
        event: {
          properties: {
            action: {
              type: 'keyword',
              ignore_above: 1024,
            },
            kind: {
              type: 'keyword',
              ignore_above: 1024,
            },
            original: {
              type: 'keyword',
              ignore_above: 32766,
            },
          },
        },
        data_stream: {
          properties: {
            type: {
              type: 'keyword',
            },
            dataset: {
              type: 'keyword',
            },
            namespace: {
              type: 'keyword',
            },
          },
        },
        kibana: {
          properties: {
            alert: {
              properties: {
                action_group: {
                  type: 'keyword',
                },
                case_ids: {
                  type: 'keyword',
                },
                consecutive_matches: {
                  type: 'long',
                },
                duration: {
                  properties: {
                    us: {
                      type: 'long',
                    },
                  },
                },
                end: {
                  type: 'date',
                },
                flapping: {
                  type: 'boolean',
                },
                flapping_history: {
                  type: 'boolean',
                },
                index_pattern: {
                  type: 'keyword',
                },
                maintenance_window_ids: {
                  type: 'keyword',
                },
                maintenance_window_names: {
                  type: 'keyword',
                },
                instance: {
                  properties: {
                    id: {
                      type: 'keyword',
                    },
                  },
                },
                last_detected: {
                  type: 'date',
                },
                muted: {
                  type: 'boolean',
                },
                pending_recovered_count: {
                  type: 'long',
                },
                previous_action_group: {
                  type: 'keyword',
                },
                reason: {
                  type: 'keyword',
                  fields: {
                    text: {
                      type: 'match_only_text',
                    },
                  },
                },
                intended_timestamp: {
                  type: 'date',
                },
                rule: {
                  properties: {
                    category: {
                      type: 'keyword',
                    },
                    consumer: {
                      type: 'keyword',
                    },
                    execution: {
                      properties: {
                        timestamp: {
                          type: 'date',
                        },
                        type: {
                          type: 'keyword',
                        },
                        uuid: {
                          type: 'keyword',
                        },
                      },
                    },
                    name: {
                      type: 'keyword',
                    },
                    parameters: {
                      type: 'flattened',
                      ignore_above: 4096,
                    },
                    producer: {
                      type: 'keyword',
                    },
                    revision: {
                      type: 'long',
                    },
                    rule_type_id: {
                      type: 'keyword',
                    },
                    tags: {
                      type: 'keyword',
                    },
                    uuid: {
                      type: 'keyword',
                    },
                  },
                },
                scheduled_action: {
                  properties: {
                    date: {
                      type: 'keyword',
                    },
                    group: {
                      type: 'keyword',
                    },
                  },
                },
                severity: {
                  type: 'keyword',
                },
                severity_improving: {
                  type: 'boolean',
                },
                snoozed: {
                  type: 'boolean',
                },
                start: {
                  type: 'date',
                },
                status: {
                  type: 'keyword',
                },
                time_range: {
                  type: 'date_range',
                  format: 'epoch_millis||strict_date_optional_time',
                },
                updated_at: {
                  type: 'date',
                },
                updated_by: {
                  properties: {
                    user: {
                      properties: {
                        id: {
                          type: 'keyword',
                        },
                        name: {
                          type: 'keyword',
                        },
                      },
                    },
                  },
                },
                url: {
                  ignore_above: 2048,
                  index: false,
                  type: 'keyword',
                },
                uuid: {
                  type: 'keyword',
                },
                workflow_status: {
                  type: 'keyword',
                },
                workflow_tags: {
                  type: 'keyword',
                },
                workflow_assignee_ids: {
                  type: 'keyword',
                },
              },
            },
            cps_scope: {
              properties: {
                expression: {
                  type: 'keyword',
                },
                linked_projects: {
                  type: 'flattened',
                },
              },
            },
            space_ids: {
              type: 'keyword',
            },
            version: {
              type: 'version',
            },
          },
        },
        tags: {
          type: 'keyword',
          ignore_above: 1024,
        },
      },
    });
    expect(mappingFromFieldMap(legacyAlertFieldMap)).toEqual({
      dynamic: 'strict',
      properties: {
        kibana: {
          properties: {
            alert: {
              properties: {
                risk_score: { type: 'float' },
                rule: {
                  properties: {
                    author: { type: 'keyword' },
                    created_at: { type: 'date' },
                    created_by: { type: 'keyword' },
                    description: { type: 'keyword' },
                    enabled: { type: 'keyword' },
                    from: { type: 'keyword' },
                    interval: { type: 'keyword' },
                    license: { type: 'keyword' },
                    note: { type: 'keyword' },
                    references: { type: 'keyword' },
                    rule_id: { type: 'keyword' },
                    rule_name_override: { type: 'keyword' },
                    to: { type: 'keyword' },
                    type: { type: 'keyword' },
                    updated_at: { type: 'date' },
                    updated_by: { type: 'keyword' },
                    version: { type: 'keyword' },
                  },
                },
                severity: { type: 'keyword' },
                suppression: {
                  properties: {
                    docs_count: { type: 'long' },
                    end: { type: 'date' },
                    terms: {
                      properties: { field: { type: 'keyword' }, value: { type: 'keyword' } },
                    },
                    start: { type: 'date' },
                  },
                },
                system_status: { type: 'keyword' },
                workflow_reason: { type: 'keyword' },
                workflow_status_updated_at: { type: 'date' },
                workflow_user: { type: 'keyword' },
              },
            },
          },
        },
        ecs: { properties: { version: { type: 'keyword', ignore_above: 1024 } } },
      },
    });
  });

  it('uses dynamic setting if specified', () => {
    expect(mappingFromFieldMap(testFieldMap, true)).toEqual({
      dynamic: true,
      ...expectedTestMapping,
    });
  });
});
