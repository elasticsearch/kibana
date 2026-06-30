/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * These are mappings of custom properties that are not part of ECS.
 * Must not interfere with standard ECS fields and field sets.
 */
exports.EcsCustomPropertyMappings = {
  kibana: {
    properties: {
      // kibana server uuid
      server_uuid: {
        type: 'keyword',
        ignore_above: 1024,
      },
      // task specific fields
      task: {
        properties: {
          id: {
            type: 'keyword',
          },
          type: {
            type: 'keyword',
            ignore_above: 1024,
          },
          scheduled: {
            type: 'date',
          },
          schedule_delay: {
            type: 'long',
          },
          execution: {
            properties: {
              uuid: {
                type: 'keyword',
                ignore_above: 1024,
              },
            },
          },
        },
      },
      // alerting specific fields
      alerting: {
        properties: {
          instance_id: {
            type: 'keyword',
            ignore_above: 1024,
          },
          action_group_id: {
            type: 'keyword',
            ignore_above: 1024,
          },
          action_subgroup: {
            type: 'keyword',
            ignore_above: 1024,
          },
          status: {
            type: 'keyword',
            ignore_above: 1024,
          },
          outcome: {
            type: 'keyword',
            ignore_above: 1024,
          },
          summary: {
            properties: {
              new: {
                properties: {
                  count: {
                    type: 'long',
                  },
                },
              },
              ongoing: {
                properties: {
                  count: {
                    type: 'long',
                  },
                },
              },
              recovered: {
                properties: {
                  count: {
                    type: 'long',
                  },
                },
              },
            },
          },
        },
      },
      alert: {
        properties: {
          flapping: {
            type: 'boolean',
          },
          maintenance_window_ids: {
            type: 'keyword',
            ignore_above: 1024,
          },
          uuid: {
            type: 'keyword',
            ignore_above: 1024,
          },
          deletion: {
            properties: {
              num_deleted: {
                type: 'long',
              },
            },
          },
          rule: {
            properties: {
              consumer: {
                type: 'keyword',
                ignore_above: 1024,
              },
              gap: {
                properties: {
                  status: {
                    type: 'keyword',
                    ignore_above: 1024,
                  },
                  range: {
                    type: 'date_range',
                    format: 'strict_date_optional_time||epoch_millis',
                  },
                  filled_intervals: {
                    type: 'date_range',
                    format: 'strict_date_optional_time||epoch_millis',
                  },
                  unfilled_intervals: {
                    format: 'strict_date_optional_time||epoch_millis',
                    type: 'date_range',
                  },
                  in_progress_intervals: {
                    format: 'strict_date_optional_time||epoch_millis',
                    type: 'date_range',
                  },
                  total_gap_duration_ms: {
                    type: 'long',
                  },
                  filled_duration_ms: {
                    type: 'long',
                  },
                  unfilled_duration_ms: {
                    type: 'long',
                  },
                  in_progress_duration_ms: {
                    type: 'long',
                  },
                  deleted: {
                    type: 'boolean',
                  },
                  updated_at: {
                    type: 'date',
                  },
                  failed_auto_fill_attempts: {
                    type: 'long',
                  },
                  reason: {
                    properties: {
                      type: {
                        type: 'keyword',
                        ignore_above: 1024,
                      },
                    },
                  },
                },
              },
              execution: {
                properties: {
                  uuid: {
                    type: 'keyword',
                    ignore_above: 1024,
                  },
                  status: {
                    type: 'keyword',
                    ignore_above: 1024,
                  },
                  status_order: {
                    type: 'long',
                  },
                  backfill: {
                    properties: {
                      id: {
                        type: 'keyword',
                        ignore_above: 1024,
                      },
                      start: {
                        type: 'date',
                      },
                      interval: {
                        type: 'keyword',
                        ignore_above: 1024,
                      },
                    },
                  },
                  metrics: {
                    properties: {
                      number_of_triggered_actions: {
                        type: 'long',
                      },
                      number_of_generated_actions: {
                        type: 'long',
                      },
                      alert_counts: {
                        properties: {
                          active: {
                            type: 'long',
                          },
                          new: {
                            type: 'long',
                          },
                          recovered: {
                            type: 'long',
                          },
                        },
                      },
                      number_of_delayed_alerts: {
                        type: 'long',
                      },
                      number_of_searches: {
                        type: 'long',
                      },
                      total_indexing_duration_ms: {
                        type: 'long',
                      },
                      es_search_duration_ms: {
                        type: 'long',
                      },
                      total_search_duration_ms: {
                        type: 'long',
                      },
                      execution_gap_duration_s: {
                        type: 'long',
                      },
                      gap_range: {
                        type: 'date_range',
                        format: 'strict_date_optional_time||epoch_millis',
                      },
                      gap_reason: {
                        properties: {
                          type: {
                            type: 'keyword',
                            ignore_above: 1024,
                          },
                        },
                      },
                      matched_indices_count: {
                        type: 'long',
                      },
                      frozen_indices_queried_count: {
                        type: 'long',
                      },
                      rule_type_run_duration_ms: {
                        type: 'long',
                      },
                      process_alerts_duration_ms: {
                        type: 'long',
                      },
                      trigger_actions_duration_ms: {
                        type: 'long',
                      },
                      process_rule_duration_ms: {
                        type: 'long',
                      },
                      claim_to_start_duration_ms: {
                        type: 'long',
                      },
                      persist_alerts_duration_ms: {
                        type: 'long',
                      },
                      prepare_rule_duration_ms: {
                        type: 'long',
                      },
                      total_run_duration_ms: {
                        type: 'long',
                      },
                      total_enrichment_duration_ms: {
                        type: 'long',
                      },
                      update_alerts_duration_ms: {
                        type: 'long',
                      },
                      alerts_candidate_count: {
                        type: 'long',
                      },
                      alerts_suppressed_count: {
                        type: 'long',
                      },
                    },
                  },
                },
              },
              revision: {
                type: 'long',
              },
              rule_type_id: {
                type: 'keyword',
                ignore_above: 1024,
              },
            },
          },
        },
      },
      // array of saved object references, for "linking" via search
      saved_objects: {
        type: 'nested',
        properties: {
          // relation; currently only supports "primary" or not set
          rel: {
            type: 'keyword',
            ignore_above: 1024,
          },
          // relevant kibana space
          namespace: {
            type: 'keyword',
            ignore_above: 1024,
          },
          id: {
            type: 'keyword',
            ignore_above: 1024,
          },
          type: {
            type: 'keyword',
            ignore_above: 1024,
          },
          type_id: {
            type: 'keyword',
            ignore_above: 1024,
          },
          space_agnostic: {
            type: 'boolean',
          },
        },
      },
      cps_scope_expression: {
        type: 'keyword',
        ignore_above: 1024,
      },
      cps_scope_linked_projects: {
        type: 'flattened',
      },
      space_ids: {
        type: 'keyword',
        ignore_above: 1024,
      },
      version: {
        type: 'version',
      },
      action: {
        properties: {
          name: {
            ignore_above: 1024,
            type: 'keyword',
          },
          id: {
            type: 'keyword',
            ignore_above: 1024,
          },
          type_id: {
            type: 'keyword',
            ignore_above: 1024,
          },
          execution: {
            properties: {
              source: {
                ignore_above: 1024,
                type: 'keyword',
              },
              uuid: {
                ignore_above: 1024,
                type: 'keyword',
              },
              gen_ai: {
                properties: {
                  usage: {
                    properties: {
                      prompt_tokens: {
                        type: 'long',
                      },
                      completion_tokens: {
                        type: 'long',
                      },
                      total_tokens: {
                        type: 'long',
                      },
                    },
                  },
                },
              },
              usage: {
                properties: {
                  request_body_bytes: {
                    type: 'long',
                  },
                },
              },
            },
          },
        },
      },
      user_api_key: {
        properties: {
          id: {
            type: 'keyword',
          },
          name: {
            type: 'keyword',
          },
        },
      },
      gap_auto_fill: {
        properties: {
          execution: {
            properties: {
              status: {
                type: 'keyword',
              },
              start: {
                type: 'date',
              },
              end: {
                type: 'date',
              },
              duration_ms: {
                type: 'long',
              },
              rule_ids: {
                type: 'keyword',
              },
              task_params: {
                properties: {
                  name: {
                    type: 'keyword',
                  },
                  num_retries: {
                    type: 'long',
                  },
                  gap_fill_range: {
                    type: 'keyword',
                  },
                  interval: {
                    type: 'keyword',
                  },
                  max_backfills: {
                    type: 'long',
                  },
                },
              },
              results: {
                type: 'nested',
                properties: {
                  rule_id: {
                    type: 'keyword',
                  },
                  processed_gaps: {
                    type: 'long',
                  },
                  status: {
                    type: 'keyword',
                  },
                  error: {
                    type: 'keyword',
                  },
                },
              },
            },
          },
        },
      },
      alerting_v2: {
        properties: {
          dispatcher: {
            properties: {
              episode_count: {
                type: 'long',
              },
              episode_ids: {
                type: 'keyword',
                ignore_above: 1024,
              },
              rule_count: {
                type: 'long',
              },
              rule_ids: {
                type: 'keyword',
                ignore_above: 1024,
              },
              action_group_count: {
                type: 'long',
              },
              action_group_ids: {
                type: 'keyword',
                ignore_above: 1024,
              },
              workflow_ids: {
                type: 'keyword',
                ignore_above: 1024,
              },
              workflow_execution_ids: {
                type: 'keyword',
                ignore_above: 1024,
              },
              execution: {
                properties: {
                  uuid: {
                    type: 'keyword',
                    ignore_above: 1024,
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

/**
 * These properties will be added to the generated event schema.
 * Here you can specify single fields (log.level) and whole field sets (event).
 */
exports.EcsPropertiesToGenerate = [
  '@timestamp',
  'message',
  'tags',
  'ecs',
  'error',
  'event',
  'log.level',
  'log.logger',
  'rule',
  'user.name',
  'user.id',
  'kibana',
];

/**
 * These properties can have multiple values (are arrays in the generated event schema).
 */
exports.EcsEventLogMultiValuedProperties = [
  'tags',
  'event.category',
  'event.type',
  'rule.author',
  'kibana.space_ids',
  'kibana.alert.maintenance_window_ids',
  'kibana.alert.rule.gap.in_progress_intervals',
  'kibana.alert.rule.gap.filled_intervals',
  'kibana.alert.rule.gap.unfilled_intervals',
  'kibana.gap_auto_fill.execution.rule_ids',
  'kibana.alerting_v2.dispatcher.episode_ids',
  'kibana.alerting_v2.dispatcher.rule_ids',
  'kibana.alerting_v2.dispatcher.action_group_ids',
  'kibana.alerting_v2.dispatcher.workflow_ids',
  'kibana.alerting_v2.dispatcher.workflow_execution_ids',
];
