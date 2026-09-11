/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { configSchema, CLAIM_STRATEGY_MGET } from './config';

describe('config validation', () => {
  test('task manager defaults', () => {
    const config: Record<string, unknown> = {};
    expect(configSchema.validate(config)).toMatchInlineSnapshot(`
      Object {
        "allow_reading_invalid_state": true,
        "api_key_type": "es",
        "auto_calculate_default_ech_capacity": false,
        "claim_nudge": Object {
          "enabled": true,
        },
        "claim_strategy": "mget",
        "discovery": Object {
          "active_nodes_lookback": "30s",
          "interval": 10000,
        },
        "event_loop_delay": Object {
          "monitor": true,
          "warn_threshold": 5000,
        },
        "execution_control": Object {
          "poll_interval": 5000,
        },
        "grant_uiam_api_keys": false,
        "invalidate_api_key_task": Object {
          "interval": "5m",
          "removalDelay": "1h",
        },
        "kibanas_per_partition": 2,
        "max_attempts": 3,
        "metrics_reset_interval": 30000,
        "monitored_aggregated_stats_refresh_rate": 60000,
        "monitored_stats_health_verbose_log": Object {
          "enabled": false,
          "level": "debug",
          "warn_delayed_task_start_in_seconds": 60,
        },
        "monitored_stats_required_freshness": 1500,
        "monitored_stats_running_average_window": 50,
        "monitored_task_execution_thresholds": Object {
          "custom": Object {},
          "default": Object {
            "error_threshold": 90,
            "warn_threshold": 80,
          },
        },
        "poll_interval": 500,
        "request_capacity": 1000,
        "request_timeouts": Object {
          "update_by_query": 30000,
        },
        "unsafe": Object {
          "authenticate_background_task_utilization": true,
          "exclude_task_types": Array [],
        },
        "version_conflict_threshold": 80,
      }
    `);
  });

  test('the required freshness of the monitored stats config must always be less-than-equal to the poll interval', () => {
    const config: Record<string, unknown> = {
      monitored_stats_required_freshness: 100,
    };
    expect(() => {
      configSchema.validate(config);
    }).toThrowErrorMatchingInlineSnapshot(
      `"The specified monitored_stats_required_freshness (100) is invalid, as it is below the poll_interval (500)"`
    );
  });

  test('the default required freshness of the monitored stats is poll interval with a slight buffer', () => {
    const config: Record<string, unknown> = {};
    expect(configSchema.validate(config)).toMatchInlineSnapshot(`
      Object {
        "allow_reading_invalid_state": true,
        "api_key_type": "es",
        "auto_calculate_default_ech_capacity": false,
        "claim_nudge": Object {
          "enabled": true,
        },
        "claim_strategy": "mget",
        "discovery": Object {
          "active_nodes_lookback": "30s",
          "interval": 10000,
        },
        "event_loop_delay": Object {
          "monitor": true,
          "warn_threshold": 5000,
        },
        "execution_control": Object {
          "poll_interval": 5000,
        },
        "grant_uiam_api_keys": false,
        "invalidate_api_key_task": Object {
          "interval": "5m",
          "removalDelay": "1h",
        },
        "kibanas_per_partition": 2,
        "max_attempts": 3,
        "metrics_reset_interval": 30000,
        "monitored_aggregated_stats_refresh_rate": 60000,
        "monitored_stats_health_verbose_log": Object {
          "enabled": false,
          "level": "debug",
          "warn_delayed_task_start_in_seconds": 60,
        },
        "monitored_stats_required_freshness": 1500,
        "monitored_stats_running_average_window": 50,
        "monitored_task_execution_thresholds": Object {
          "custom": Object {},
          "default": Object {
            "error_threshold": 90,
            "warn_threshold": 80,
          },
        },
        "poll_interval": 500,
        "request_capacity": 1000,
        "request_timeouts": Object {
          "update_by_query": 30000,
        },
        "unsafe": Object {
          "authenticate_background_task_utilization": true,
          "exclude_task_types": Array [],
        },
        "version_conflict_threshold": 80,
      }
    `);
  });

  test('the custom monitored_task_execution_thresholds can be configured at task type', () => {
    const config: Record<string, unknown> = {
      monitored_task_execution_thresholds: {
        custom: {
          'alerting:always-fires': {
            error_threshold: 50,
            warn_threshold: 30,
          },
        },
      },
    };
    expect(configSchema.validate(config)).toMatchInlineSnapshot(`
      Object {
        "allow_reading_invalid_state": true,
        "api_key_type": "es",
        "auto_calculate_default_ech_capacity": false,
        "claim_nudge": Object {
          "enabled": true,
        },
        "claim_strategy": "mget",
        "discovery": Object {
          "active_nodes_lookback": "30s",
          "interval": 10000,
        },
        "event_loop_delay": Object {
          "monitor": true,
          "warn_threshold": 5000,
        },
        "execution_control": Object {
          "poll_interval": 5000,
        },
        "grant_uiam_api_keys": false,
        "invalidate_api_key_task": Object {
          "interval": "5m",
          "removalDelay": "1h",
        },
        "kibanas_per_partition": 2,
        "max_attempts": 3,
        "metrics_reset_interval": 30000,
        "monitored_aggregated_stats_refresh_rate": 60000,
        "monitored_stats_health_verbose_log": Object {
          "enabled": false,
          "level": "debug",
          "warn_delayed_task_start_in_seconds": 60,
        },
        "monitored_stats_required_freshness": 1500,
        "monitored_stats_running_average_window": 50,
        "monitored_task_execution_thresholds": Object {
          "custom": Object {
            "alerting:always-fires": Object {
              "error_threshold": 50,
              "warn_threshold": 30,
            },
          },
          "default": Object {
            "error_threshold": 90,
            "warn_threshold": 80,
          },
        },
        "poll_interval": 500,
        "request_capacity": 1000,
        "request_timeouts": Object {
          "update_by_query": 30000,
        },
        "unsafe": Object {
          "authenticate_background_task_utilization": true,
          "exclude_task_types": Array [],
        },
        "version_conflict_threshold": 80,
      }
    `);
  });

  test('the monitored_task_execution_thresholds ensures that the default warn_threshold is lt the default error_threshold', () => {
    const config: Record<string, unknown> = {
      monitored_task_execution_thresholds: {
        default: {
          warn_threshold: 80,
          error_threshold: 70,
        },
      },
    };
    expect(() => {
      configSchema.validate(config);
    }).toThrowErrorMatchingInlineSnapshot(
      `"[monitored_task_execution_thresholds.default]: warn_threshold (80) must be less than, or equal to, error_threshold (70)"`
    );
  });

  test('the monitored_task_execution_thresholds allows the default warn_threshold to equal the default error_threshold', () => {
    const config: Record<string, unknown> = {
      monitored_task_execution_thresholds: {
        default: {
          warn_threshold: 70,
          error_threshold: 70,
        },
      },
    };
    expect(() => {
      configSchema.validate(config);
    }).not.toThrow();
  });

  test('the monitored_task_execution_thresholds ensures that the warn_threshold is lte error_threshold on custom thresholds', () => {
    const config: Record<string, unknown> = {
      monitored_task_execution_thresholds: {
        custom: {
          'alerting:always-fires': {
            error_threshold: 80,
            warn_threshold: 90,
          },
        },
      },
    };
    expect(() => {
      configSchema.validate(config);
    }).toThrowErrorMatchingInlineSnapshot(
      `"[monitored_task_execution_thresholds.custom.alerting:always-fires]: warn_threshold (90) must be less than, or equal to, error_threshold (80)"`
    );
  });

  test('the monitored_task_execution_thresholds allows a custom error_threshold which is lower than the default warn_threshold', () => {
    const config: Record<string, unknown> = {
      monitored_task_execution_thresholds: {
        default: {
          warn_threshold: 80,
          error_threshold: 90,
        },
        custom: {
          'alerting:always-fires': {
            error_threshold: 60,
            warn_threshold: 50,
          },
        },
      },
    };
    expect(() => {
      configSchema.validate(config);
    }).not.toThrow();
  });

  test('any claim strategy is valid and poll interval uses default value', () => {
    const result = configSchema.validate({ claim_strategy: 'anything!' });
    expect(result.poll_interval).toEqual(500);
  });

  test('mget claim strategy defaults poll interval to 500ms', () => {
    const result = configSchema.validate({ claim_strategy: CLAIM_STRATEGY_MGET });
    expect(result.poll_interval).toEqual(500);
  });

  test('discovery active_nodes_lookback must be a valid duration', () => {
    const config: Record<string, unknown> = {
      discovery: {
        active_nodes_lookback: 'foo',
      },
    };
    expect(() => {
      configSchema.validate(config);
    }).toThrowErrorMatchingInlineSnapshot(
      `"[discovery.active_nodes_lookback]: active node lookback duration must be a valid duration string"`
    );
  });

  test('discovery active_nodes_lookback must be less than 5m', () => {
    const config: Record<string, unknown> = {
      discovery: {
        active_nodes_lookback: '301s',
      },
    };
    expect(() => {
      configSchema.validate(config);
    }).toThrowErrorMatchingInlineSnapshot(
      `"[discovery.active_nodes_lookback]: active node lookback duration cannot exceed five minutes"`
    );
  });

  test('claim_nudge.enabled defaults to true', () => {
    const result = configSchema.validate({});
    expect(result.claim_nudge.enabled).toEqual(true);
  });

  test('claim_nudge.enabled can be disabled', () => {
    const result = configSchema.validate({ claim_nudge: { enabled: false } });
    expect(result.claim_nudge.enabled).toEqual(false);
  });

  test('should not throw if ephemeral_tasks is defined', () => {
    const config: Record<string, unknown> = {
      ephemeral_tasks: {
        enabled: true,
        request_capacity: 20,
      },
    };

    expect(() => configSchema.validate(config)).not.toThrow();
  });
});
