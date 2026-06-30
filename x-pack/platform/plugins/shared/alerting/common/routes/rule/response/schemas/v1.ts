/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { ruleParamsSchemaV1 } from '@kbn/response-ops-rule-params';
import { rRuleResponseSchemaV1 } from '../../../r_rule';
import { alertsFilterQuerySchemaV1 } from '../../../alerts_filter_query';
import {
  MAX_SNOOZED_INSTANCE_CONDITIONS,
  MAX_SNOOZED_ALERT_INSTANCES,
  MAX_SNOOZED_INSTANCE_ID_LENGTH,
  MAX_SNOOZED_CONDITION_FIELD_LENGTH,
  MAX_SNOOZE_EXPIRES_AT_LENGTH,
  MAX_SNOOZED_BY_LENGTH,
} from '../../../../max_alert_limit';
import {
  ruleNotifyWhen as ruleNotifyWhenV1,
  ruleExecutionStatusValues as ruleExecutionStatusValuesV1,
  ruleExecutionStatusErrorReason as ruleExecutionStatusErrorReasonV1,
  ruleExecutionStatusWarningReason as ruleExecutionStatusWarningReasonV1,
  ruleLastRunOutcomeValues as ruleLastRunOutcomeValuesV1,
} from '../../common/constants/v1';
import { validateNotifyWhenV1 } from '../../validation';
import { flappingSchemaV2 } from '../../common';

export const actionParamsSchema = schema.recordOf(schema.string(), schema.maybe(schema.any()), {
  meta: {
    description:
      'The parameters for the action, which are sent to the connector. The `params` are handled as Mustache templates and passed a default set of context.',
  },
});
export const mappedParamsSchema = schema.recordOf(
  schema.string({ meta: { description: 'The mapped parameters for the rule.' } }),
  schema.maybe(schema.any())
);

export const notifyWhenSchema = schema.oneOf(
  [
    schema.literal(ruleNotifyWhenV1.CHANGE),
    schema.literal(ruleNotifyWhenV1.ACTIVE),
    schema.literal(ruleNotifyWhenV1.THROTTLE),
  ],
  {
    validate: validateNotifyWhenV1,
    meta: {
      description:
        'Indicates how frequently rule actions are triggered. Valid values include: `onActionGroupChange`: Actions run when the alert status changes; `onActiveAlert`: Actions run when the alert becomes active and at each check interval while the rule conditions are met; `onThrottleInterval`: Actions run when the alert becomes active and at the interval specified in the throttle property while the rule conditions are met. You cannot specify `notify_when` at both the rule and action level. The recommended approach is to set it for each action individually. If you set `notify_when` at the rule level and then edit the rule, it will automatically be converted to action-specific values.',
    },
  }
);

const intervalScheduleSchema = schema.object({
  interval: schema.string({
    meta: { description: 'The interval is specified in seconds, minutes, hours, or days.' },
  }),
});

const actionFrequencySchema = schema.object({
  summary: schema.boolean({ meta: { description: 'Indicates whether the action is a summary.' } }),
  notify_when: notifyWhenSchema,
  throttle: schema.nullable(
    schema.string({
      meta: {
        description: `The throttle interval defines how frequently rule actions are triggered. It is specified in seconds, minutes, hours, or days and only applies when 'notify_when' is set to 'onThrottleInterval'. You cannot set the throttle interval at both the rule and action level. The recommended approach is to set it for each action individually. If you set the throttle interval at the rule level and then edit the rule, it will automatically be converted to action-specific values.`,
      },
    })
  ),
});

const actionAlertsFilterSchema = schema.object(
  {
    query: schema.maybe(alertsFilterQuerySchemaV1),
    timeframe: schema.maybe(
      schema.object({
        days: schema.arrayOf(
          schema.oneOf([
            schema.literal(1),
            schema.literal(2),
            schema.literal(3),
            schema.literal(4),
            schema.literal(5),
            schema.literal(6),
            schema.literal(7),
          ]),
          {
            meta: {
              description:
                'Defines the days of the week that the action can run, represented as an array of numbers. For example, `1` represents Monday. An empty array is equivalent to specifying all the days of the week.',
            },
          }
        ),
        hours: schema.object({
          start: schema.string({
            meta: {
              description: 'The start of the time frame, in 24-hour notation (`hh:mm`).',
            },
          }),
          end: schema.string({
            meta: {
              description: 'The end of the time frame, in 24-hour notation (`hh:mm`).',
            },
          }),
        }),
        timezone: schema.string({
          meta: {
            description:
              'The ISO time zone for the `hours` values. Values such as `UTC` and `UTC+1` also work but lack built-in support for daylight savings time and are not recommended.',
          },
        }),
      })
    ),
  },
  {
    meta: {
      description: 'Defines a period that limits whether the action runs.',
    },
  }
);

const actionSchema = schema.object({
  uuid: schema.maybe(
    schema.string({
      meta: { description: 'A universally unique identifier (UUID) for the action.' },
    })
  ),
  group: schema.maybe(
    schema.string({
      meta: {
        description:
          "The group name, which affects when the action runs (for example, when the threshold is met or when the alert is recovered). Each rule type has a list of valid action group names. If you don't need to group actions, set to `default`.",
      },
    })
  ),
  id: schema.string({
    meta: { description: 'The identifier for the connector saved object.' },
  }),
  connector_type_id: schema.string({
    meta: {
      description:
        'The type of connector. This property appears in responses but cannot be set in requests.',
    },
  }),
  params: actionParamsSchema,
  frequency: schema.maybe(actionFrequencySchema),
  alerts_filter: schema.maybe(actionAlertsFilterSchema),
  use_alert_data_for_template: schema.maybe(
    schema.boolean({
      meta: { description: 'Indicates whether to use alert data as a template.' },
    })
  ),
});

export const ruleExecutionStatusSchema = schema.object({
  status: schema.oneOf(
    [
      schema.literal(ruleExecutionStatusValuesV1.OK),
      schema.literal(ruleExecutionStatusValuesV1.ACTIVE),
      schema.literal(ruleExecutionStatusValuesV1.ERROR),
      schema.literal(ruleExecutionStatusValuesV1.WARNING),
      schema.literal(ruleExecutionStatusValuesV1.PENDING),
      schema.literal(ruleExecutionStatusValuesV1.UNKNOWN),
    ],
    {
      meta: {
        description: 'Status of rule execution.',
      },
    }
  ),
  last_execution_date: schema.string({
    meta: {
      description: 'The date and time of the last rule execution.',
    },
  }),
  last_duration: schema.maybe(
    schema.number({
      meta: {
        description: 'Duration of last rule execution.',
      },
    })
  ),
  error: schema.maybe(
    schema.object({
      reason: schema.oneOf(
        [
          schema.literal(ruleExecutionStatusErrorReasonV1.READ),
          schema.literal(ruleExecutionStatusErrorReasonV1.DECRYPT),
          schema.literal(ruleExecutionStatusErrorReasonV1.EXECUTE),
          schema.literal(ruleExecutionStatusErrorReasonV1.UNKNOWN),
          schema.literal(ruleExecutionStatusErrorReasonV1.LICENSE),
          schema.literal(ruleExecutionStatusErrorReasonV1.TIMEOUT),
          schema.literal(ruleExecutionStatusErrorReasonV1.DISABLED),
          schema.literal(ruleExecutionStatusErrorReasonV1.VALIDATE),
        ],
        {
          meta: {
            description: 'Reason for error.',
          },
        }
      ),
      message: schema.string({
        meta: {
          description: 'Error message.',
        },
      }),
    })
  ),
  warning: schema.maybe(
    schema.object({
      reason: schema.oneOf(
        [
          schema.literal(ruleExecutionStatusWarningReasonV1.MAX_EXECUTABLE_ACTIONS),
          schema.literal(ruleExecutionStatusWarningReasonV1.MAX_ALERTS),
          schema.literal(ruleExecutionStatusWarningReasonV1.MAX_QUEUED_ACTIONS),
          schema.literal(ruleExecutionStatusWarningReasonV1.EXECUTION),
        ],
        {
          meta: {
            description: 'Reason for warning.',
          },
        }
      ),
      message: schema.string({
        meta: {
          description: 'Warning message.',
        },
      }),
    })
  ),
});

export const outcome = schema.oneOf(
  [
    schema.literal(ruleLastRunOutcomeValuesV1.SUCCEEDED),
    schema.literal(ruleLastRunOutcomeValuesV1.WARNING),
    schema.literal(ruleLastRunOutcomeValuesV1.FAILED),
  ],
  {
    meta: {
      description: 'Outcome of the last rule run. Value can be succeeded, warning, or failed.',
    },
  }
);

export const ruleLastRunSchema = schema.object({
  outcome,
  outcome_order: schema.maybe(
    schema.number({
      meta: {
        description: 'Order of the outcome.',
      },
    })
  ),
  warning: schema.maybe(
    schema.nullable(
      schema.oneOf(
        [
          schema.literal(ruleExecutionStatusErrorReasonV1.READ),
          schema.literal(ruleExecutionStatusErrorReasonV1.DECRYPT),
          schema.literal(ruleExecutionStatusErrorReasonV1.EXECUTE),
          schema.literal(ruleExecutionStatusErrorReasonV1.UNKNOWN),
          schema.literal(ruleExecutionStatusErrorReasonV1.LICENSE),
          schema.literal(ruleExecutionStatusErrorReasonV1.TIMEOUT),
          schema.literal(ruleExecutionStatusErrorReasonV1.DISABLED),
          schema.literal(ruleExecutionStatusErrorReasonV1.VALIDATE),
          schema.literal(ruleExecutionStatusWarningReasonV1.MAX_EXECUTABLE_ACTIONS),
          schema.literal(ruleExecutionStatusWarningReasonV1.MAX_ALERTS),
          schema.literal(ruleExecutionStatusWarningReasonV1.MAX_QUEUED_ACTIONS),
          schema.literal(ruleExecutionStatusWarningReasonV1.EXECUTION),
        ],
        {
          meta: {
            description: 'Warning of last rule execution.',
          },
        }
      )
    )
  ),
  outcome_msg: schema.maybe(
    schema.nullable(
      schema.arrayOf(
        schema.string({
          meta: {
            description: 'Outcome message generated during last rule run.',
          },
        })
      )
    )
  ),
  alerts_count: schema.object({
    active: schema.maybe(
      schema.nullable(
        schema.number({
          meta: {
            description: 'Number of active alerts during last run.',
          },
        })
      )
    ),
    new: schema.maybe(
      schema.nullable(
        schema.number({
          meta: {
            description: 'Number of new alerts during last run.',
          },
        })
      )
    ),
    recovered: schema.maybe(
      schema.nullable(
        schema.number({
          meta: {
            description: 'Number of recovered alerts during last run.',
          },
        })
      )
    ),
    ignored: schema.maybe(
      schema.nullable(
        schema.number({
          meta: {
            description: 'Number of ignored alerts during last run.',
          },
        })
      )
    ),
  }),
});

export const monitoringSchema = schema.object(
  {
    run: schema.object(
      {
        history: schema.arrayOf(
          schema.object({
            success: schema.boolean({
              meta: { description: 'Indicates whether the rule run was successful.' },
            }),
            timestamp: schema.number({ meta: { description: 'Time of rule run.' } }),
            duration: schema.maybe(
              schema.number({ meta: { description: 'Duration of the rule run.' } })
            ),
            outcome: schema.maybe(outcome),
          }),
          { meta: { description: 'History of the rule run.' } }
        ),
        calculated_metrics: schema.object(
          {
            p50: schema.maybe(schema.number()),
            p95: schema.maybe(schema.number()),
            p99: schema.maybe(schema.number()),
            success_ratio: schema.number(),
          },
          {
            meta: {
              description: 'Calculation of different percentiles and success ratio.',
            },
          }
        ),
        last_run: schema.object({
          timestamp: schema.string({
            meta: { description: 'Time of the most recent rule run.' },
          }),
          metrics: schema.object({
            duration: schema.maybe(
              schema.number({
                meta: { description: 'Duration of most recent rule run.' },
              })
            ),
            total_search_duration_ms: schema.maybe(
              schema.nullable(
                schema.number({
                  meta: {
                    description:
                      'Total time spent performing Elasticsearch searches as measured by Kibana; includes network latency and time spent serializing or deserializing the request and response.',
                  },
                })
              )
            ),
            total_indexing_duration_ms: schema.maybe(
              schema.nullable(
                schema.number({
                  meta: {
                    description:
                      'Total time spent indexing documents during last rule run in milliseconds.',
                  },
                })
              )
            ),
            total_alerts_detected: schema.maybe(
              schema.nullable(
                schema.number({
                  meta: { description: 'Total number of alerts detected during last rule run.' },
                })
              )
            ),
            total_alerts_created: schema.maybe(
              schema.nullable(
                schema.number({
                  meta: {
                    description: 'Total number of alerts created during last rule run.',
                  },
                })
              )
            ),
            gap_duration_s: schema.maybe(
              schema.nullable(
                schema.number({
                  meta: {
                    description: 'Duration in seconds of rule run gap.',
                  },
                })
              )
            ),
            gap_range: schema.maybe(
              schema.nullable(
                schema.object({
                  lte: schema.string({
                    meta: { description: 'Start of the gap range.' },
                  }),
                  gte: schema.string({
                    meta: { description: 'End of the gap range.' },
                  }),
                })
              )
            ),
          }),
        }),
      },
      {
        meta: {
          description: 'Rule run details.',
        },
      }
    ),
  },
  {
    meta: {
      description: 'Monitoring details of the rule.',
    },
  }
);

export const ruleSnoozeScheduleSchema = schema.object({
  id: schema.maybe(
    schema.string({
      meta: {
        description: 'Identifier of the rule snooze schedule.',
      },
    })
  ),
  duration: schema.number({
    meta: {
      description: 'Duration of the rule snooze schedule.',
    },
  }),
  rRule: rRuleResponseSchemaV1,
  skipRecurrences: schema.maybe(
    schema.arrayOf(
      schema.string({
        meta: {
          description: 'Skips recurrence of rule on this date.',
        },
      })
    )
  ),
});

export const alertDelaySchema = schema.object(
  {
    active: schema.number({
      meta: { description: 'The number of consecutive runs that must meet the rule conditions.' },
    }),
  },
  {
    meta: {
      description:
        'Indicates that an alert occurs only when the specified number of consecutive runs met the rule conditions.',
    },
  }
);

export const dashboardsSchema = schema.arrayOf(schema.object({ id: schema.string() }));

export const investigationGuideSchema = schema.object({
  blob: schema.string({
    meta: {
      description: 'User-created content that describes alert causes and remediation.',
    },
  }),
});

export const artifactsSchema = schema.object({
  dashboards: schema.maybe(dashboardsSchema),
  investigation_guide: schema.maybe(investigationGuideSchema),
});

const snoozedAlertConditionSchema = schema.oneOf([
  schema.object({
    type: schema.literal('field_change'),
    field: schema.string({ maxLength: MAX_SNOOZED_CONDITION_FIELD_LENGTH }),
  }),
  schema.object({ type: schema.literal('severity_change') }),
  schema.object({
    type: schema.literal('severity_equals'),
    value: schema.oneOf([
      schema.literal('critical'),
      schema.literal('high'),
      schema.literal('medium'),
      schema.literal('low'),
      schema.literal('info'),
    ]),
  }),
]);

export const snoozedAlertInstanceSchema = schema.object({
  instance_id: schema.string({
    maxLength: MAX_SNOOZED_INSTANCE_ID_LENGTH,
    meta: { description: 'The identifier of the snoozed alert instance.' },
  }),
  expires_at: schema.maybe(
    schema.string({
      maxLength: MAX_SNOOZE_EXPIRES_AT_LENGTH,
      meta: {
        description: 'The datetime at which the per-alert snooze expires, in ISO 8601 format.',
      },
    })
  ),
  conditions: schema.maybe(
    schema.arrayOf(snoozedAlertConditionSchema, {
      maxSize: MAX_SNOOZED_INSTANCE_CONDITIONS,
      meta: { description: 'Conditions that automatically expire the snooze when met.' },
    })
  ),
  condition_operator: schema.maybe(
    schema.oneOf([schema.literal('any'), schema.literal('all')], {
      meta: { description: 'Logical operator applied to the conditions array.' },
    })
  ),
  snoozed_at: schema.string({
    maxLength: MAX_SNOOZE_EXPIRES_AT_LENGTH,
    meta: { description: 'The datetime at which the alert was snoozed, in ISO 8601 format.' },
  }),
  snoozed_by: schema.string({
    maxLength: MAX_SNOOZED_BY_LENGTH,
    meta: { description: 'The identifier of the user who snoozed the alert.' },
  }),
});

/**
 * This is a public schema that is used to generate the OpenAPI schema for all of our public APIs that return a rule response.
 */
export const ruleResponseSchema = schema.object(
  {
    id: schema.string({
      meta: {
        description: 'The identifier for the rule.',
      },
    }),
    enabled: schema.boolean({
      meta: {
        description:
          'Indicates whether you want the rule to run on an interval basis after it is created.',
      },
    }),
    name: schema.string({
      meta: {
        description: ' The name of the rule.',
      },
    }),
    tags: schema.arrayOf(
      schema.string({
        meta: { description: 'The tags for the rule.' },
      })
    ),
    rule_type_id: schema.string({
      meta: { description: 'The rule type identifier.' },
    }),
    consumer: schema.string({
      meta: {
        description:
          'The name of the application or feature that owns the rule. For example: `alerts`, `apm`, `discover`, `infrastructure`, `logs`, `metrics`, `ml`, `monitoring`, `securitySolution`, `siem`, `stackAlerts`, or `uptime`.',
      },
    }),
    schedule: intervalScheduleSchema,
    actions: schema.arrayOf(actionSchema),
    params: ruleParamsSchemaV1,
    mapped_params: schema.maybe(mappedParamsSchema),
    scheduled_task_id: schema.maybe(
      schema.string({
        meta: {
          description: 'Identifier of the scheduled task.',
        },
      })
    ),
    created_by: schema.nullable(
      schema.string({
        meta: {
          description: 'The identifier for the user that created the rule.',
        },
      })
    ),
    updated_by: schema.nullable(
      schema.string({
        meta: {
          description: 'The identifier for the user who was the last to update the rule.',
        },
      })
    ),
    created_at: schema.string({
      meta: {
        description: 'The date and time that the rule was created.',
      },
    }),
    updated_at: schema.string({
      meta: {
        description: 'The date and time of the latest updates to the rule.',
      },
    }),
    api_key_owner: schema.nullable(
      schema.string({
        meta: {
          description:
            'The owner of the API key that is associated with the rule and used to run background tasks.',
        },
      })
    ),
    api_key_created_by_user: schema.maybe(
      schema.nullable(
        schema.boolean({
          meta: {
            description:
              'Indicates whether the API key that is associated with the rule was created by the user.',
          },
        })
      )
    ),
    throttle: schema.maybe(
      schema.nullable(
        schema.string({
          meta: {
            description:
              'Deprecated in 8.13.0. Use the `throttle` property in the action `frequency` object instead. The throttle interval, which defines how frequently rule actions are triggered. You cannot specify the throttle interval at both the rule and action level. If you set the throttle interval at the rule level and then edit the rule, it will automatically be converted to action-specific values.',
            deprecated: true,
          },
        })
      )
    ),
    mute_all: schema.boolean({
      meta: {
        description: 'Indicates whether all alerts are muted.',
      },
    }),
    notify_when: schema.maybe(schema.nullable(notifyWhenSchema)),
    muted_alert_ids: schema.arrayOf(
      schema.string({
        meta: {
          description: 'List of identifiers of muted alerts. ',
        },
      })
    ),
    execution_status: ruleExecutionStatusSchema,
    last_run: schema.maybe(schema.nullable(ruleLastRunSchema)),
    next_run: schema.maybe(
      schema.nullable(
        schema.string({
          meta: {
            description: 'Date and time of the next rule run.',
          },
        })
      )
    ),
    revision: schema.number({
      meta: {
        description: 'The rule revision number.',
      },
    }),
    running: schema.maybe(
      schema.nullable(
        schema.boolean({
          meta: {
            description: 'Indicates whether the rule is running.',
          },
        })
      )
    ),
    alert_delay: schema.maybe(alertDelaySchema),
    flapping: schema.maybe(schema.nullable(flappingSchemaV2)),
    artifacts: schema.maybe(artifactsSchema),
  },
  { meta: { id: 'rule_response' } }
);

/**
 * This is an internal schema that is used for all of our internal APIs that return a rule response.
 */
export const ruleResponseInternalSchema = schema.object(
  {
    id: schema.string({
      meta: {
        description: 'The identifier for the rule.',
      },
    }),
    enabled: schema.boolean({
      meta: {
        description:
          'Indicates whether you want the rule to run on an interval basis after it is created.',
      },
    }),
    name: schema.string({
      meta: {
        description: ' The name of the rule.',
      },
    }),
    tags: schema.arrayOf(
      schema.string({
        meta: { description: 'The tags for the rule.' },
      })
    ),
    rule_type_id: schema.string({
      meta: { description: 'The rule type identifier.' },
    }),
    consumer: schema.string({
      meta: {
        description:
          'The name of the application or feature that owns the rule. For example: `alerts`, `apm`, `discover`, `infrastructure`, `logs`, `metrics`, `ml`, `monitoring`, `securitySolution`, `siem`, `stackAlerts`, or `uptime`.',
      },
    }),
    schedule: intervalScheduleSchema,
    actions: schema.arrayOf(actionSchema),
    params: ruleParamsSchemaV1,
    mapped_params: schema.maybe(mappedParamsSchema),
    scheduled_task_id: schema.maybe(
      schema.string({
        meta: {
          description: 'Identifier of the scheduled task.',
        },
      })
    ),
    created_by: schema.nullable(
      schema.string({
        meta: {
          description: 'The identifier for the user that created the rule.',
        },
      })
    ),
    updated_by: schema.nullable(
      schema.string({
        meta: {
          description: 'The identifier for the user who was the last to update the rule.',
        },
      })
    ),
    created_at: schema.string({
      meta: {
        description: 'The date and time that the rule was created.',
      },
    }),
    updated_at: schema.string({
      meta: {
        description: 'The date and time of the latest updates to the rule.',
      },
    }),
    api_key_owner: schema.nullable(
      schema.string({
        meta: {
          description:
            'The owner of the API key that is associated with the rule and used to run background tasks.',
        },
      })
    ),
    api_key_created_by_user: schema.maybe(
      schema.nullable(
        schema.boolean({
          meta: {
            description:
              'Indicates whether the API key that is associated with the rule was created by the user.',
          },
        })
      )
    ),
    throttle: schema.maybe(
      schema.nullable(
        schema.string({
          meta: {
            description:
              'Deprecated in 8.13.0. Use the `throttle` property in the action `frequency` object instead. The throttle interval, which defines how frequently rule actions are triggered. You cannot specify the throttle interval at both the rule and action level. If you set the throttle interval at the rule level and then edit the rule, it will automatically be converted to action-specific values.',
            deprecated: true,
          },
        })
      )
    ),
    mute_all: schema.boolean({
      meta: {
        description: 'Indicates whether all alerts are muted.',
      },
    }),
    notify_when: schema.maybe(schema.nullable(notifyWhenSchema)),
    muted_alert_ids: schema.arrayOf(
      schema.string({
        meta: {
          description: 'List of identifiers of muted alerts. ',
        },
      })
    ),
    execution_status: ruleExecutionStatusSchema,
    monitoring: schema.maybe(monitoringSchema),
    snooze_schedule: schema.maybe(schema.arrayOf(ruleSnoozeScheduleSchema)),
    active_snoozes: schema.maybe(
      schema.arrayOf(
        schema.string({
          meta: {
            description: `List of active snoozes for the rule.`,
          },
        })
      )
    ),
    snoozed_alert_instances: schema.maybe(
      schema.arrayOf(snoozedAlertInstanceSchema, {
        maxSize: MAX_SNOOZED_ALERT_INSTANCES,
        meta: { description: 'List of per-alert snooze entries for this rule.' },
      })
    ),
    is_snoozed_until: schema.maybe(
      schema.nullable(
        schema.string({
          meta: {
            description: 'The date when the rule will no longer be snoozed.',
          },
        })
      )
    ),
    last_run: schema.maybe(schema.nullable(ruleLastRunSchema)),
    next_run: schema.maybe(
      schema.nullable(
        schema.string({
          meta: {
            description: 'Date and time of the next rule run.',
          },
        })
      )
    ),
    revision: schema.number({
      meta: {
        description: 'The rule revision number.',
      },
    }),
    running: schema.maybe(
      schema.nullable(
        schema.boolean({
          meta: {
            description: 'Indicates whether the rule is running.',
          },
        })
      )
    ),
    view_in_app_relative_url: schema.maybe(
      schema.nullable(
        schema.string({
          meta: {
            description: 'Relative URL to view rule in the app.',
          },
        })
      )
    ),
    alert_delay: schema.maybe(alertDelaySchema),
    flapping: schema.maybe(schema.nullable(flappingSchemaV2)),
    artifacts: schema.maybe(artifactsSchema),
  },
  { meta: { id: 'rule_response_internal' } }
);

export const scheduleIdsSchema = schema.maybe(schema.arrayOf(schema.string()));
