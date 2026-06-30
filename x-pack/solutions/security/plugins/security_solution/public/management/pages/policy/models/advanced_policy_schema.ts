/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

interface AdvancedPolicySchemaType {
  key: string;
  first_supported_version: string;
  last_supported_version?: string;
  documentation: string;
  license?: string;
}

export const AdvancedPolicySchema: AdvancedPolicySchemaType[] = [
  {
    key: 'linux.advanced.agent.connection_delay',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.agent.connection_delay',
      {
        defaultMessage:
          'How long to wait for agent connectivity before sending first policy reply, in seconds. Default: 60.',
      }
    ),
  },
  {
    key: 'linux.advanced.artifacts.global.base_url',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.artifacts.global.base_url',
      {
        defaultMessage:
          'Modify the base URL from which to download protection artifact updates. Default: https://artifacts.security.elastic.co.',
      }
    ),
  },
  {
    key: 'linux.advanced.artifacts.global.manifest_relative_url',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.artifacts.global.manifest_relative_url',
      {
        defaultMessage:
          'Modify the relative URL from which to download protection artifact manifests. Default: /downloads/endpoint/manifest/artifacts-<version>.zip.',
        ignoreTag: true,
      }
    ),
  },
  {
    key: 'linux.advanced.artifacts.global.public_key',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.artifacts.global.public_key',
      {
        defaultMessage:
          'Override the PEM-encoded public key used to verify the protection artifact manifest signature. Default: none.',
      }
    ),
  },
  {
    key: 'linux.advanced.artifacts.global.interval',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.artifacts.global.interval',
      {
        defaultMessage:
          'Specify the period between protection artifact update attempts, in seconds. Default: 3600.',
      }
    ),
  },
  {
    key: 'linux.advanced.artifacts.global.channel',
    first_supported_version: '8.18',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.artifacts.global.channel',
      {
        defaultMessage:
          "Modify the release channel for protection artifact updates. The 'default' is staged rollout, 'rapid' receives candidate artifacts as soon as available, and 'stable' only receives artifact updates after staged rollout has finished. Default: default.",
      }
    ),
  },
  {
    key: 'linux.advanced.artifacts.user.public_key',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.artifacts.user.public_key',
      {
        defaultMessage:
          'Deprecated, do not use. PEM-encoded public key used to verify the user artifact manifest signature.',
      }
    ),
  },
  {
    key: 'linux.advanced.allow_cloud_features',
    first_supported_version: '8.18',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.allow_cloud_features',
      {
        defaultMessage:
          "Explicitly define which cloud services are permitted. Valid services are 'sample-collection', 'reputation-lookup', 'malware-lookup', 'artifacts-update', 'staged-artifacts-rollout'. If any comma-separated values are provided, all other services are disabled. To disallow all, use the keyword 'none'. Warning: this may reduce protection efficacy and increase false positive rates. Default: all services are permitted.",
      }
    ),
  },
  {
    key: 'linux.advanced.elasticsearch.delay',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.elasticsearch.delay',
      {
        defaultMessage:
          'Specify the delay between sending documents to Elasticsearch, in seconds. Default: 120.',
      }
    ),
  },
  {
    key: 'linux.advanced.elasticsearch.tls.verify_peer',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.elasticsearch.tls.verify_peer',
      {
        defaultMessage:
          'Verify certificates for the Elasticsearch SSL/TLS connection. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.elasticsearch.tls.verify_hostname',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.elasticsearch.tls.verify_hostname',
      {
        defaultMessage:
          'Verify the hostname for the Elasticsearch SSL/TLS connection. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.elasticsearch.tls.ca_cert',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.elasticsearch.tls.ca_cert',
      {
        defaultMessage:
          'Provide an additional PEM-encoded certificate for Elasticsearch certificate authority. Default: none.',
      }
    ),
  },
  {
    key: 'linux.advanced.logging.file',
    first_supported_version: '7.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.logging.file',
      {
        defaultMessage:
          "Override the log level configured for logs that are saved to disk and streamed to Elasticsearch. Elastic recommends using Fleet to change this logging setting in most circumstances. Allowed values are 'error', 'warning', 'info', 'debug', and 'trace'. Default: Fleet configuration is used.",
      }
    ),
  },
  {
    key: 'linux.advanced.logging.syslog',
    first_supported_version: '7.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.logging.syslog',
      {
        defaultMessage:
          "Write logs to syslog. Allowed values are 'error', 'warning', 'info', 'debug', and 'trace'. Default: none.",
      }
    ),
  },
  {
    key: 'linux.advanced.tty_io.max_kilobytes_per_process',
    first_supported_version: '8.5',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.tty_io.max_kilobytes_per_process',
      {
        defaultMessage:
          'The maximum kilobytes of terminal output to record for a single process. Default: 512.',
      }
    ),
  },
  {
    key: 'linux.advanced.tty_io.max_kilobytes_per_event',
    first_supported_version: '8.5',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.tty_io.max_kilobytes_per_event',
      {
        defaultMessage:
          'The maximum kilobytes of terminal output to record in a single event. Default: 512.',
      }
    ),
  },
  {
    key: 'linux.advanced.capture_env_vars',
    first_supported_version: '8.6',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.capture_env_vars',
      {
        defaultMessage:
          'Provide a comma-separated list of up to five environment variables to capture in process creation events. Default: none.',
      }
    ),
  },
  {
    key: 'linux.advanced.tty_io.max_event_interval_seconds',
    first_supported_version: '8.5',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.tty_io.max_event_interval_seconds',
      {
        defaultMessage:
          'The maximum amount of time (seconds) to batch terminal output in a single event. Default: 30.',
      }
    ),
  },
  {
    key: 'linux.advanced.network_events_exclude_local',
    first_supported_version: '8.10.1',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.network_events_exclude_local',
      {
        defaultMessage: 'Exclude local connections from network events. Default: false.',
      }
    ),
  },
  {
    key: 'mac.advanced.network_events_exclude_local',
    first_supported_version: '8.10.1',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.network_events_exclude_local',
      {
        defaultMessage: 'Exclude local connections from network events. Default: false.',
      }
    ),
  },
  {
    key: 'linux.advanced.capture_command_line',
    first_supported_version: '8.14',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.capture_command_line',
      {
        defaultMessage:
          'Include the command line as part of the collected process information for all event types. Default: false.',
      }
    ),
  },
  {
    key: 'mac.advanced.capture_command_line',
    first_supported_version: '8.14',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.capture_command_line',
      {
        defaultMessage:
          'Include the command line as part of the collected process information for all event types. Default: false.',
      }
    ),
  },
  {
    key: 'mac.advanced.agent.connection_delay',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.agent.connection_delay',
      {
        defaultMessage:
          'How long to wait for agent connectivity before sending first policy reply, in seconds. Default: 60.',
      }
    ),
  },
  {
    key: 'mac.advanced.artifacts.global.base_url',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.artifacts.global.base_url',
      {
        defaultMessage:
          'Modify the base URL from which to download protection artifact updates. Default: https://artifacts.security.elastic.co.',
      }
    ),
  },
  {
    key: 'mac.advanced.artifacts.global.manifest_relative_url',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.artifacts.global.manifest_relative_url',
      {
        defaultMessage:
          'Modify the relative URL from which to download protection artifact manifests. Default: /downloads/endpoint/manifest/artifacts-<version>.zip.',
        ignoreTag: true,
      }
    ),
  },
  {
    key: 'mac.advanced.artifacts.global.public_key',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.artifacts.global.public_key',
      {
        defaultMessage:
          'Override the PEM-encoded public key used to verify the protection artifact manifest signature. Default: none.',
      }
    ),
  },
  {
    key: 'mac.advanced.artifacts.global.interval',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.artifacts.global.interval',
      {
        defaultMessage:
          'Specify the period between protection artifact update attempts, in seconds. Default: 3600.',
      }
    ),
  },
  {
    key: 'mac.advanced.artifacts.global.channel',
    first_supported_version: '8.18',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.artifacts.global.channel',
      {
        defaultMessage:
          "Modify the release channel for protection artifact updates. The 'default' is staged rollout, 'rapid' receives candidate artifacts as soon as available, and 'stable' only receives artifact updates after staged rollout has finished. Default: default.",
      }
    ),
  },
  {
    key: 'mac.advanced.artifacts.user.public_key',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.artifacts.user.public_key',
      {
        defaultMessage:
          'Deprecated, do not use. PEM-encoded public key used to verify the user artifact manifest signature.',
      }
    ),
  },
  {
    key: 'mac.advanced.allow_cloud_features',
    first_supported_version: '8.18',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.allow_cloud_features',
      {
        defaultMessage:
          "Explicitly define which cloud services are permitted. Valid services are 'sample-collection', 'reputation-lookup', 'malware-lookup', 'artifacts-update', 'staged-artifacts-rollout'. If any comma-separated values are provided, all other services are disabled. To disallow all, use the keyword 'none'. Warning: this may reduce protection efficacy and increase false positive rates. Default: all services are permitted.",
      }
    ),
  },
  {
    key: 'mac.advanced.elasticsearch.delay',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.elasticsearch.delay',
      {
        defaultMessage:
          'Specify the delay between sending documents to Elasticsearch, in seconds. Default: 120.',
      }
    ),
  },
  {
    key: 'mac.advanced.elasticsearch.tls.verify_peer',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.elasticsearch.tls.verify_peer',
      {
        defaultMessage:
          'Verify certificates for the Elasticsearch SSL/TLS connection. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.elasticsearch.tls.verify_hostname',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.elasticsearch.tls.verify_hostname',
      {
        defaultMessage:
          'Verify the hostname for the Elasticsearch SSL/TLS connection. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.elasticsearch.tls.ca_cert',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.elasticsearch.tls.ca_cert',
      {
        defaultMessage:
          'Provide an additional PEM-encoded certificate for Elasticsearch certificate authority. Default: none.',
      }
    ),
  },
  {
    key: 'mac.advanced.logging.file',
    first_supported_version: '7.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.logging.file',
      {
        defaultMessage:
          "Override the log level configured for logs that are saved to disk and streamed to Elasticsearch. Elastic recommends using Fleet to change this logging setting in most circumstances. Allowed values are 'error', 'warning', 'info', 'debug', and 'trace'. Default: Fleet configuration is used.",
      }
    ),
  },
  {
    key: 'mac.advanced.logging.syslog',
    first_supported_version: '7.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.logging.syslog',
      {
        defaultMessage:
          "Write logs to syslog. Allowed values are 'error', 'warning', 'info', 'debug', and 'trace'. Default: none.",
      }
    ),
  },
  {
    key: 'mac.advanced.malware.quarantine',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.malware.quarantine',
      {
        defaultMessage:
          'Enable quarantining files when malware prevention is enabled. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.malware.threshold',
    first_supported_version: '7.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.malware.threshold',
      {
        defaultMessage:
          "Control the threshold that should be used for evaluating malware. Allowed values are 'normal', 'conservative', and 'aggressive'. Default: normal.",
      }
    ),
  },
  {
    key: 'mac.advanced.malware.max_file_size_bytes',
    first_supported_version: '8.16.4',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.malware.max_file_size_bytes',
      {
        defaultMessage:
          'Control the maximum file size in bytes that should be evaluated for malware. Default: 78643200.',
      }
    ),
  },
  {
    key: 'mac.advanced.ransomware.diagnostic',
    first_supported_version: '9.2',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.ransomware.diagnostic',
      {
        defaultMessage: 'Enable diagnostic ransomware protection. Default: true.',
      }
    ),
  },
  {
    key: 'mac.ransomware.mode',
    first_supported_version: '9.4',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.ransomware.mode',
      {
        defaultMessage:
          "Enable ransomware protection for macOS. Accepted values are 'off', 'detect', and 'prevent'. Default: off.",
      }
    ),
    license: 'platinum',
  },
  {
    key: 'linux.advanced.ransomware.diagnostic',
    first_supported_version: '9.4',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.ransomware.diagnostic',
      {
        defaultMessage: 'Enable diagnostic ransomware protection. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.device_control.filter_images',
    first_supported_version: '9.2',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.device_control.filter_images',
      {
        defaultMessage:
          'Filter out file backed images and CD-ROM volumes from consideration by device control. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.events.populate_file_data',
    first_supported_version: '9.2',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.populate_file_data',
      {
        defaultMessage:
          'Enable collection of entropy and header bytes in file events. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.events.populate_file_data',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.events.populate_file_data',
      {
        defaultMessage:
          'Enable collection of entropy and header bytes on file events. Default: false.',
      }
    ),
  },
  {
    key: 'mac.advanced.kernel.connect',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.kernel.connect',
      {
        defaultMessage:
          'Control whether to connect to the kernel driver. Warning: disabling this will break most features. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.kernel.process',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.kernel.process',
      {
        defaultMessage:
          "Enable kernel process events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'mac.advanced.kernel.filewrite',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.kernel.filewrite',
      {
        defaultMessage:
          "Enable kernel file write events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'mac.advanced.kernel.network',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.kernel.network',
      {
        defaultMessage:
          "Enable kernel network events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'mac.advanced.harden.self_protect',
    first_supported_version: '7.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.harden.self_protect',
      {
        defaultMessage: 'Enable self-protection hardening on macOS. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.network_events_exclude_local',
    first_supported_version: '8.10.1',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.network_events_exclude_local',
      {
        defaultMessage: 'Exclude local connections from network events. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.capture_command_line',
    first_supported_version: '8.14',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.capture_command_line',
      {
        defaultMessage:
          'Include the command line as part of the collected process information for all event types. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.agent.connection_delay',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.agent.connection_delay',
      {
        defaultMessage:
          'How long to wait for agent connectivity before sending first policy reply, in seconds. Default: 60.',
      }
    ),
  },
  {
    key: 'windows.advanced.artifacts.global.base_url',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.artifacts.global.base_url',
      {
        defaultMessage:
          'Modify the base URL from which to download protection artifact updates. Default: https://artifacts.security.elastic.co.',
      }
    ),
  },
  {
    key: 'windows.advanced.artifacts.global.manifest_relative_url',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.artifacts.global.manifest_relative_url',
      {
        defaultMessage:
          'Modify the relative URL from which to download protection artifact manifests. Default: /downloads/endpoint/manifest/artifacts-<version>.zip.',
        ignoreTag: true,
      }
    ),
  },
  {
    key: 'windows.advanced.artifacts.global.public_key',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.artifacts.global.public_key',
      {
        defaultMessage:
          'Override the PEM-encoded public key used to verify the protection artifact manifest signature. Default: none.',
      }
    ),
  },
  {
    key: 'windows.advanced.artifacts.global.interval',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.artifacts.global.interval',
      {
        defaultMessage:
          'Specify the period between protection artifact update attempts, in seconds. Default: 3600.',
      }
    ),
  },
  {
    key: 'windows.advanced.artifacts.global.channel',
    first_supported_version: '8.18',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.artifacts.global.channel',
      {
        defaultMessage:
          "Modify the release channel for protection artifact updates. The 'default' is staged rollout, 'rapid' receives candidate artifacts as soon as available, and 'stable' only receives artifact updates after staged rollout has finished. Default: 'default'.",
      }
    ),
  },
  {
    key: 'windows.advanced.artifacts.user.public_key',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.artifacts.user.public_key',
      {
        defaultMessage:
          'Deprecated, do not use. PEM-encoded public key used to verify the user artifact manifest signature.',
      }
    ),
  },
  {
    key: 'windows.advanced.allow_cloud_features',
    first_supported_version: '8.18',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.allow_cloud_features',
      {
        defaultMessage:
          "Explicitly define which cloud services are permitted. Valid services are 'sample-collection', 'reputation-lookup', 'malware-lookup', 'artifacts-update', 'staged-artifacts-rollout'. If any comma-separated values are provided, all other services are disabled. To disallow all, use the keyword 'none'. Warning: this may reduce protection efficacy and increase false positive rates. Default: all services are permitted.",
      }
    ),
  },
  {
    key: 'windows.advanced.elasticsearch.delay',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.elasticsearch.delay',
      {
        defaultMessage:
          'Specify the delay between sending documents to Elasticsearch, in seconds. Default: 120.',
      }
    ),
  },
  {
    key: 'windows.advanced.elasticsearch.tls.verify_peer',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.elasticsearch.tls.verify_peer',
      {
        defaultMessage:
          'Verify certificates for the Elasticsearch SSL/TLS connection. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.elasticsearch.tls.verify_hostname',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.elasticsearch.tls.verify_hostname',
      {
        defaultMessage:
          'Verify the hostname for the Elasticsearch SSL/TLS connection. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.elasticsearch.tls.ca_cert',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.elasticsearch.tls.ca_cert',
      {
        defaultMessage:
          'Provide an additional PEM-encoded certificate for Elasticsearch certificate authority. Default: none.',
      }
    ),
  },
  {
    key: 'windows.advanced.logging.file',
    first_supported_version: '7.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.logging.file',
      {
        defaultMessage:
          "Override the log level configured for logs that are saved to disk and streamed to Elasticsearch. Elastic recommends using Fleet to change this logging setting in most circumstances. Allowed values are 'error', 'warning', 'info', 'debug', and 'trace'. Default: Fleet configuration is used.",
      }
    ),
  },
  {
    key: 'windows.advanced.logging.debugview',
    first_supported_version: '7.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.logging.debugview',
      {
        defaultMessage:
          "Write logs to the DebugView Sysinternals tool. Allowed values are 'error', 'warning', 'info', 'debug', and 'trace'. Default: none.",
      }
    ),
  },
  {
    key: 'windows.advanced.malware.quarantine',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.malware.quarantine',
      {
        defaultMessage:
          'Enable quarantining files when malware prevention is enabled. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.malware.threshold',
    first_supported_version: '7.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.malware.threshold',
      {
        defaultMessage:
          "Control the threshold that should be used for evaluating malware. Allowed values are 'normal', 'conservative', and 'aggressive'. Default: 'normal'.",
      }
    ),
  },
  {
    key: 'windows.advanced.malware.max_file_size_bytes',
    first_supported_version: '8.16.4',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.malware.max_file_size_bytes',
      {
        defaultMessage:
          'Control the maximum file size in bytes that should be evaluated for malware. Default: 78643200.',
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.connect',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.connect',
      {
        defaultMessage:
          'Control whether to connect to the kernel driver. Warning: disabling this will break most features. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.process',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.process',
      {
        defaultMessage:
          "Enable kernel process events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.filewrite',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.filewrite',
      {
        defaultMessage:
          "Enable kernel file write events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.filewrite_sync',
    first_supported_version: '8.14',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.filewrite_sync',
      {
        defaultMessage:
          'Process file write notifications synchronously when possible. This may improve file write and malware-on-write enrichment reliability at the cost of system responsiveness. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.network',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.network',
      {
        defaultMessage:
          "Enable kernel network events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.network_report_loopback',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.network_report_loopback',
      {
        defaultMessage: 'Report loopback network events. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.fileopen',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.fileopen',
      {
        defaultMessage:
          "Enable kernel file open events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.asyncimageload',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.asyncimageload',
      {
        defaultMessage:
          "Enable kernel asynchronous image load events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.syncimageload',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.syncimageload',
      {
        defaultMessage:
          "Enable kernel sync image load events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.registry',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.registry',
      {
        defaultMessage:
          "Enable kernel registry events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.fileaccess',
    first_supported_version: '7.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.fileaccess',
      {
        defaultMessage:
          "Enable kernel file access events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.registryaccess',
    first_supported_version: '7.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.registryaccess',
      {
        defaultMessage:
          'Report limited registry access (queryvalue, savekey) events. Additional paths can be monitored via windows.advanced.events.event_on_access.registry_paths. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.process_handle',
    first_supported_version: '8.1',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.process_handle',
      {
        defaultMessage:
          "Enable process and thread handle events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.diagnostic.enabled',
    first_supported_version: '7.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.diagnostic.enabled',
      {
        defaultMessage: 'Enable diagnostic features. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.diagnostic.enabled',
    first_supported_version: '7.12',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.diagnostic.enabled',
      {
        defaultMessage: 'Enable diagnostic features. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.diagnostic.enabled',
    first_supported_version: '7.12',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.diagnostic.enabled',
      {
        defaultMessage: 'Enable diagnostic features. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.alerts.cloud_lookup',
    first_supported_version: '7.12',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.alerts.cloud_lookup',
      {
        defaultMessage:
          'Check a cloud service for known false positives before generating malware alerts. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.alerts.cloud_lookup',
    first_supported_version: '7.12',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.alerts.cloud_lookup',
      {
        defaultMessage:
          'Check a cloud service for known false positives before generating malware alerts. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.ransomware.mbr',
    first_supported_version: '7.12',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.ransomware.mbr',
      {
        defaultMessage: 'Enable ransomware MBR protection. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.ransomware.canary',
    first_supported_version: '7.14',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.ransomware.canary',
      {
        defaultMessage: 'Enable ransomware canary protection. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.device_control.filter_images',
    first_supported_version: '9.2',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.device_control.filter_images',
      {
        defaultMessage:
          'Filter out file backed images and CD-ROM volumes from consideration by device control. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.ransomware.dump_process',
    first_supported_version: '8.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.ransomware.dump_process',
      {
        defaultMessage:
          'Enable the generation of a memory dump of the ransomware process. This is ignored if the canary protection is off. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.memory_protection.shellcode',
    first_supported_version: '7.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.memory_protection.shellcode',
      {
        defaultMessage:
          'Enable shellcode injection detection as a part of memory protection. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.memory_protection.memory_scan',
    first_supported_version: '7.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.memory_protection.memory_scan',
      {
        defaultMessage:
          'Enable scanning for malicious memory regions as a part of memory protection. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.malware.quarantine',
    first_supported_version: '7.14',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.malware.quarantine',
      {
        defaultMessage:
          'Enable quarantining files when malware prevention is enabled. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.malware.max_file_size_bytes',
    first_supported_version: '8.16.4',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.malware.max_file_size_bytes',
      {
        defaultMessage:
          'Control the maximum file size in bytes that should be evaluated for malware. Default: 78643200.',
      }
    ),
  },
  {
    key: 'linux.advanced.memory_protection.enable_fork_scan',
    first_supported_version: '8.14',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.memory_protection.enable_fork_scan',
      {
        defaultMessage:
          'Enable memory scanning on process fork events. This will have the effect of more memory regions being scanned. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.memory_protection.enable_shared_dirty_scan',
    first_supported_version: '8.14',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.memory_protection.enable_shared_dirty_scan',
      {
        defaultMessage:
          "Instead of ignoring memory regions with just no 'Private_Dirty' bytes, ignore regions with the combination of no 'Private_Dirty' bytes, no 'Shared_Dirty' bytes and is file-backed. This has the effect of scanning more memory regions because of the loosened restrictions. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.memory_protection.shellcode_collect_sample',
    first_supported_version: '7.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.memory_protection.shellcode_collect_sample',
      {
        defaultMessage:
          'Collect 4MB of memory surrounding detected shellcode regions. Warning: enabling this value may significantly increase the amount of data stored in Elasticsearch. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.memory_protection.memory_scan_collect_sample',
    first_supported_version: '7.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.memory_protection.memory_scan_collect_sample',
      {
        defaultMessage:
          'Collect 4MB of memory surrounding detected malicious memory regions. Warning: enabling this value may significantly increase the amount of data stored in Elasticsearch. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.memory_protection.shellcode_enhanced_pe_parsing',
    first_supported_version: '7.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.memory_protection.shellcode_enhanced_pe_parsing',
      {
        defaultMessage:
          'Attempt to identify and extract PE metadata from injected shellcode, including Authenticode signatures and version resource information. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.memory_protection.memory_scan_collect_sample',
    first_supported_version: '7.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.memory_protection.memory_scan_collect_sample',
      {
        defaultMessage:
          'Collect 4MB of memory surrounding detected malicious memory regions. Warning: enabling this value may significantly increase the amount of data stored in Elasticsearch. Default: false.',
      }
    ),
  },
  {
    key: 'mac.advanced.memory_protection.memory_scan',
    first_supported_version: '7.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.memory_protection.memory_scan',
      {
        defaultMessage:
          'Enable scanning for malicious memory regions as a part of memory protection. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.memory_protection.memory_scan_collect_sample',
    first_supported_version: '7.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.memory_protection.memory_scan_collect_sample',
      {
        defaultMessage:
          'Collect 4MB of memory surrounding detected malicious memory regions. Warning: enabling this value may significantly increase the amount of data stored in Elasticsearch. Default: false.',
      }
    ),
  },
  {
    key: 'linux.advanced.memory_protection.memory_scan',
    first_supported_version: '7.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.memory_protection.memory_scan',
      {
        defaultMessage:
          'Enable scanning for malicious memory regions as a part of memory protection. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.artifacts.user.ca_cert',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.artifacts.user.ca_cert',
      {
        defaultMessage:
          'Provide an additional PEM-encoded certificate for Fleet Server SSL/TLS verification. Default: none.',
      }
    ),
  },
  {
    key: 'windows.advanced.artifacts.user.ca_cert',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.artifacts.user.ca_cert',
      {
        defaultMessage:
          'Provide an additional PEM-encoded certificate for Fleet Server SSL/TLS verification. Default: none.',
      }
    ),
  },
  {
    key: 'mac.advanced.artifacts.user.ca_cert',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.artifacts.user.ca_cert',
      {
        defaultMessage:
          'Provide an additional PEM-encoded certificate for Fleet Server SSL/TLS verification. Default: none.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.etw',
    first_supported_version: '8.1',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.etw',
      {
        defaultMessage: 'Deprecated, do not use.',
      }
    ),
  },
  {
    key: 'windows.advanced.diagnostic.rollback_telemetry_enabled',
    first_supported_version: '8.1',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.diagnostic.rollback_telemetry_enabled',
      {
        defaultMessage:
          'Enable diagnostic self-healing features without affecting other diagnostic features. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.kernel.network_extension.enable_content_filtering',
    first_supported_version: '8.1',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.kernel.network_extension.enable_content_filtering',
      {
        defaultMessage:
          'Enable the network content filter, which will enable network eventing. Warning: host isolation will fail if this is disabled. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.kernel.network_extension.enable_packet_filtering',
    first_supported_version: '8.1',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.kernel.network_extension.enable_packet_filtering',
      {
        defaultMessage:
          'Enable the network packet filter. Warning: host isolation will fail if this is disabled. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.memory_protection.shellcode_trampoline_detection',
    first_supported_version: '8.1',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.memory_protection.shellcode_trampoline_detection',
      {
        defaultMessage:
          'Enable trampoline-based shellcode injection detection as a part of memory protection. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.kernel.capture_mode',
    first_supported_version: '8.2',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.kernel.capture_mode',
      {
        defaultMessage:
          "Control whether kprobes, eBPF or Quark is used to gather data. Options are 'kprobe', 'ebpf', 'quark' or 'auto'. 'auto uses quark if possible (and supported), then tries legacy ebpf, and otherwise it uses kprobe. Quark is supported by Elastic Defend versions 9.3 and newer. Default: auto.",
      }
    ),
  },
  {
    key: 'linux.advanced.event_filter.default',
    first_supported_version: '8.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.event_filter.default',
      {
        defaultMessage: 'Download and use default event filter rules from Elastic. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.event_filter.default',
    first_supported_version: '8.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.event_filter.default',
      {
        defaultMessage: 'Download and use default event filter rules from Elastic. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.event_filter.default',
    first_supported_version: '8.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.event_filter.default',
      {
        defaultMessage: 'Download and use default event filter rules from Elastic. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.utilization_limits.cpu',
    first_supported_version: '8.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.utilization_limits.cpu',
      {
        defaultMessage:
          'Restrict Endpoint CPU usage to a percentage of the total system CPU. The range is 20-100%. Values under 20 are ignored and trigger a policy warning. Default: 50.',
      }
    ),
  },
  {
    key: 'linux.advanced.utilization_limits.cpu',
    first_supported_version: '8.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.utilization_limits.cpu',
      {
        defaultMessage:
          'Restrict Endpoint CPU usage to a percentage of the total system CPU. The range is 20-100%. Values under 20 are ignored and trigger a policy warning. Default: 50.',
      }
    ),
  },
  {
    key: 'windows.advanced.alerts.rollback.self_healing.enabled',
    first_supported_version: '8.4',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.alerts.rollback.self_healing.enabled',
      {
        defaultMessage:
          'Enable self-healing by erasing attack artifacts when prevention alerts are triggered. Warning: data loss can occur. Default: false.',
      }
    ),
    license: 'platinum',
  },
  {
    key: 'windows.advanced.alerts.rollback.self_healing.process_enabled',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.alerts.rollback.self_healing.process_enabled',
      {
        defaultMessage:
          'Enable automatic removal of malware processes when a related prevention alert fires, including processes which were not directly involved in the alert. Requires rollback.self_healing.enabled to also be enabled. Default: true.',
      }
    ),
    license: 'platinum',
  },
  {
    key: 'linux.advanced.fanotify.ignore_unknown_filesystems',
    first_supported_version: '8.4',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.fanotify.ignore_unknown_filesystems',
      {
        defaultMessage:
          'Control if the fanotify subsystem should ignore unknown filesystems. By default only Elastic-tested filesystems are monitored. If set to false, all filesystems, excluding certain known-benign filesystems, will be monitored. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.fanotify.monitored_filesystems',
    first_supported_version: '8.4',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.fanotify.monitored_filesystems',
      {
        defaultMessage:
          "Provide a comma-separated list of additional filesystems for fanotify subsystem to monitor. Names should be as they appear in '/proc/filesystems', for example 'jfs,ufs,ramfs'. When linux.advanced.fanotify.ignore_unknown_filesystems is false, this option is ignored. Warning: it's recommended to avoid network backed filesystems. Default: none.",
      }
    ),
  },
  {
    key: 'linux.advanced.fanotify.ignored_filesystems',
    first_supported_version: '8.4',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.fanotify.ignored_filesystems',
      {
        defaultMessage:
          "Provide a comma-separated list of additional filesystems for the fanotify subsystem to ignore. Names should be as they appear in '/proc/filesystems', for example 'ext4,tmpfs'. Default: none.",
      }
    ),
  },
  {
    key: 'linux.advanced.fanotify.seccomp_restricted',
    first_supported_version: '8.13.1',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.fanotify.seccomp_restricted',
      {
        defaultMessage:
          "Prevent permission checking from using the 'open'/'openat' syscalls when running on kernels which require 'FAN_OPEN_PERM' (older than 5.0). This will avoid potential deadlocks with other antivirus products at the cost of racy hash-based trusted application entries. Ignored when running on newer kernels. Default: false.",
      }
    ),
  },
  {
    key: 'linux.advanced.fanotify.enable_ns_jumping',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.fanotify.enable_ns_jumping',
      {
        defaultMessage:
          'Enter the mount namespace of processes when they generate fanotify events. For 9.2 and earlier, default: false. For 9.3 and later, default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.memory_protection.context_manipulation_detection',
    first_supported_version: '8.4',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.memory_protection.context_manipulation_detection',
      {
        defaultMessage:
          "Detect injection based on thread context manipulation (for example, 'SetThreadContext') as a part of memory protection. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.image_and_process_file_timestamp',
    first_supported_version: '8.4',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.image_and_process_file_timestamp',
      {
        defaultMessage:
          'Collect executable/dll timestamps for process and asynchronous image load events. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.host_isolation.allowed',
    first_supported_version: '8.6.1',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.host_isolation.allowed',
      {
        defaultMessage:
          'Force disable host isolation. If a host is currently not isolated, it will refuse to isolate, and likewise, a host will refuse to release if it is currently isolated. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.capture_env_vars',
    first_supported_version: '8.7',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.capture_env_vars',
      {
        defaultMessage:
          'Provide a comma-separated list of up to five environment variables to capture in process creation events. Default: none.',
      }
    ),
  },
  {
    key: 'linux.advanced.events.disable_fd_kprobes',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.events.disable_fd_kprobes',
      {
        defaultMessage:
          'Disable file descriptor tracking kprobes to reduce Endpoint processing at the expense of missing fchdir-based working directory changes. If eBPF is used for system monitoring, this option is ignored. If file events are enabled, this option is ineffective. Default: false.',
      }
    ),
  },
  {
    key: 'linux.advanced.events.enable_caps',
    first_supported_version: '8.14',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.events.enable_caps',
      {
        defaultMessage:
          'Include Linux process capabilities in process events written to Elasticsearch. Capabilities must be enabled for some SIEM detection rules. Warning: enabling this will increase data volume. For 8.13 and earlier, default: true. For 8.14 and later, default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.callstacks.emit_in_events',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.callstacks.emit_in_events',
      {
        defaultMessage:
          'Include callstacks in regular events whenever possible. When disabled (false), they are only included in events that trigger behavioral protection rules. Warning: event filtering is recommended if enabled. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.callstacks.process',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.callstacks.process',
      {
        defaultMessage: 'Collect callstacks during process events. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.callstacks.image_load',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.callstacks.image_load',
      {
        defaultMessage: 'Collect callstacks during image/library load events. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.callstacks.file',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.callstacks.file',
      {
        defaultMessage: 'Collect callstacks during file events. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.callstacks.registry',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.callstacks.registry',
      {
        defaultMessage: 'Collect callstacks during registry events. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.callstacks.timeout_microseconds',
    first_supported_version: '8.12',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.callstacks.timeout_microseconds',
      {
        defaultMessage:
          'Alter the maximum runtime of inline callstack collection/enrichment, in microseconds. Default: 100000.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.callstacks.use_hardware',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.callstacks.use_hardware',
      {
        defaultMessage:
          'Use hardware callstacks (for example, Intel CET) if supported by the OS and CPU. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.callstacks.exclude_hotpatch_extension_pages',
    first_supported_version: '8.15.2',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.callstacks.exclude_hotpatch_extension_pages',
      {
        defaultMessage:
          'Exclude Windows 11 24H2 hotpatch extension pages, which resemble injected code, from callstack module stomp scanning. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.process_ancestry_length',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.process_ancestry_length',
      {
        defaultMessage:
          'Maximum number of process ancestry entries to include in process events. For 8.14 and earlier, default: 20. For 8.15 and later, default: 5.',
      }
    ),
  },
  {
    key: 'mac.advanced.events.process_ancestry_length',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.process_ancestry_length',
      {
        defaultMessage:
          'Maximum number of process ancestry entries to include in process events. For 8.14 and earlier, default: 20. For 8.15 and later, default: 5.',
      }
    ),
  },
  {
    key: 'linux.advanced.events.process_ancestry_length',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.events.process_ancestry_length',
      {
        defaultMessage:
          'Maximum number of process ancestry entries to include in process events. For 8.14 and earlier, default: 20. For 8.15 and later, default: 5.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.ancestry_in_all_events',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.ancestry_in_all_events',
      {
        defaultMessage:
          'Include ancestor process entity IDs in all event types; by default they are only included in alerts and process events. Default: false.',
      }
    ),
  },
  {
    key: 'mac.advanced.events.ancestry_in_all_events',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.ancestry_in_all_events',
      {
        defaultMessage:
          'Include ancestor process entity IDs in all event types; by default they are only included in alerts and process events. Default: false.',
      }
    ),
  },
  {
    key: 'linux.advanced.events.ancestry_in_all_events',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.events.ancestry_in_all_events',
      {
        defaultMessage:
          'Include ancestor process entity IDs in all event types; by default they are only included in alerts and process events. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.artifacts.global.proxy_url',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.artifacts.global.proxy_url',
      {
        defaultMessage:
          'Override all other proxy settings for use when downloading protection artifact updates. Default: none.',
      }
    ),
  },
  {
    key: 'windows.advanced.artifacts.global.proxy_disable',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.artifacts.global.proxy_disable',
      {
        defaultMessage:
          'Disable the use of a proxy when downloading protection artifact updates. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.artifacts.user.proxy_url',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.artifacts.user.proxy_url',
      {
        defaultMessage:
          'Override all other proxy settings for use when downloading user artifact updates from Fleet Server. Default: none.',
      }
    ),
  },
  {
    key: 'windows.advanced.artifacts.user.proxy_disable',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.artifacts.user.proxy_disable',
      {
        defaultMessage:
          'Disable the use of a proxy when downloading user artifact updates. Default: false.',
      }
    ),
  },
  {
    key: 'mac.advanced.artifacts.global.proxy_url',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.artifacts.global.proxy_url',
      {
        defaultMessage:
          'Override all other proxy settings for use when downloading protection artifact updates. Default: none.',
      }
    ),
  },
  {
    key: 'mac.advanced.artifacts.global.proxy_disable',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.artifacts.global.proxy_disable',
      {
        defaultMessage:
          'Disable the use of a proxy when downloading protection artifact updates. Default: false.',
      }
    ),
  },
  {
    key: 'mac.advanced.artifacts.user.proxy_url',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.artifacts.user.proxy_url',
      {
        defaultMessage:
          'Override all other proxy settings for use when downloading user artifact updates from Fleet Server. Default: none.',
      }
    ),
  },
  {
    key: 'mac.advanced.artifacts.user.proxy_disable',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.artifacts.user.proxy_disable',
      {
        defaultMessage:
          'Disable the use of a proxy when downloading user artifact updates. Default: false.',
      }
    ),
  },
  {
    key: 'linux.advanced.artifacts.global.proxy_url',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.artifacts.global.proxy_url',
      {
        defaultMessage:
          'Override all other proxy settings for use when downloading protection artifact updates. Default: none.',
      }
    ),
  },
  {
    key: 'linux.advanced.artifacts.global.proxy_disable',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.artifacts.global.proxy_disable',
      {
        defaultMessage:
          'Disable the use of a proxy when downloading protection artifact updates. Default: false.',
      }
    ),
  },
  {
    key: 'linux.advanced.artifacts.user.proxy_url',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.artifacts.user.proxy_url',
      {
        defaultMessage:
          'Override all other proxy settings for use when downloading user artifact updates from Fleet Server. Default: none.',
      }
    ),
  },
  {
    key: 'linux.advanced.artifacts.user.proxy_disable',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.artifacts.user.proxy_disable',
      {
        defaultMessage:
          'Disable the use of a proxy when downloading user artifact updates. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.api',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.api',
      {
        defaultMessage:
          "Enable ETW API events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.events.api_disabled',
    first_supported_version: '8.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.api_disabled',
      {
        defaultMessage:
          'Provide a comma-separated list of API names to selectively disable. Default: none.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.api_verbose',
    first_supported_version: '8.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.api_verbose',
      {
        defaultMessage:
          'Send high-volume API events to Elasticsearch. Warning: event filtering is recommended if enabled. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.alerts.rollback.self_healing.registry_enabled',
    first_supported_version: '8.8',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.alerts.rollback.self_healing.registry_enabled',
      {
        defaultMessage:
          'Enable self-healing of registry based malware artifacts when prevention alerts are triggered. Requires windows.advanced.alerts.rollback.self_healing.enabled to also be enabled. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.callstacks.include_network_images',
    first_supported_version: '8.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.callstacks.include_network_images',
      {
        defaultMessage:
          'Parse executables and DLLs on network shares for callstack symbols. Disable this if Endpoint hangs because of a network file system. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.ppl.harden_images',
    first_supported_version: '8.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.ppl.harden_images',
      {
        defaultMessage:
          'Mitigate attacks like PPLFault by preventing Protected Process Light (PPL) processes from loading DLLs over the network. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.ppl.harden_am_images',
    first_supported_version: '8.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.ppl.harden_am_images',
      {
        defaultMessage:
          "Apply the windows.advanced.kernel.ppl.harden_images mitigation to Anti-Malware PPL as well. Disable this if third-party Anti-Malware is blocked from loading DLLs over the network. If this happens, there will be Event ID 8 events in the 'Microsoft-Windows-Security-Mitigations/Kernel Mode' event log. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.kernel.dev_drives.harden',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.kernel.dev_drives.harden',
      {
        defaultMessage: 'Apply malware protection to dev drives. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.malware.networkshare',
    first_supported_version: '8.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.malware.networkshare',
      {
        defaultMessage: 'Apply malware protection to network drives. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.check_debug_registers',
    first_supported_version: '8.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.check_debug_registers',
      {
        defaultMessage:
          'Check debug registers inline to detect the use of hardware breakpoints. Malware may use hardware breakpoints to forge benign-looking call stacks. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.kernel.fileaccess',
    first_supported_version: '8.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.kernel.fileaccess',
      {
        defaultMessage:
          "Enable kernel file access events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.events.image_load.origin_info_collection',
    first_supported_version: '8.19',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.image_load.origin_info_collection',
      {
        defaultMessage:
          "Include 'dll.origin_url', 'dll.origin_referrer_url', and 'dll.Ext.windows.zone_identifier' in image load events. These fields normally show where the loaded DLL was downloaded from, using information taken from the file's Mark of the Web. For 9.1 and earlier, default: false. For 9.2 and later, default: true.",
      }
    ),
  },
  {
    key: 'mac.advanced.events.image_load',
    first_supported_version: '8.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.image_load',
      {
        defaultMessage:
          "Enable kernel image load events. 'false' disables them even if they are needed by other features. Default: true.",
      }
    ),
  },
  {
    key: 'mac.advanced.image_load.capture',
    first_supported_version: '8.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.image_load.collect',
      {
        defaultMessage:
          'Collect and send image load events to Elasticsearch. Warning: this can lead to very high data volumes; use of event filters to drop unwanted events is strongly recommended. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.document_enrichment.fields',
    first_supported_version: '8.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.document_enrichment.fields',
      {
        defaultMessage:
          "Provide a comma-delimited set of key=value pairs of values to add into all documents. Each key must begin with 'Custom'. An example is 'Custom.key=value1,Custom.key2=value2'. Default: none.",
      }
    ),
  },
  {
    key: 'mac.advanced.document_enrichment.fields',
    first_supported_version: '8.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.document_enrichment.fields',
      {
        defaultMessage:
          "Provide a comma-delimited set of key=value pairs of values to add into all documents. Each key must begin with 'Custom'. An example is 'Custom.key=value1,Custom.key2=value2'. Default: none.",
      }
    ),
  },
  {
    key: 'linux.advanced.document_enrichment.fields',
    first_supported_version: '8.11',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.document_enrichment.fields',
      {
        defaultMessage:
          "Provide a comma-delimited set of key=value pairs of values to add into all documents. Each key must begin with 'Custom'. An example is 'Custom.key=value1,Custom.key2=value2'. Default: none.",
      }
    ),
  },
  {
    key: 'linux.advanced.file_cache.file_object_cache_size',
    first_supported_version: '8.12',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.file_cache.file_object_cache_size',
      {
        defaultMessage:
          'Control the number of file metadata cache entries stored in memory. Larger values can improve performance but increase memory usage. Default: 5000.',
      }
    ),
  },
  {
    key: 'mac.advanced.file_cache.file_object_cache_size',
    first_supported_version: '8.12',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.file_cache.file_object_cache_size',
      {
        defaultMessage:
          'Control the number of file metadata cache entries stored in memory. Larger values can improve performance but increase memory usage. Default: 5000.',
      }
    ),
  },
  {
    key: 'windows.advanced.file_cache.file_object_cache_size',
    first_supported_version: '8.12',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.file_cache.file_object_cache_size',
      {
        defaultMessage:
          'Control the number of file metadata cache entries stored in memory. Larger values can improve performance but increase memory usage. Default: 5000.',
      }
    ),
  },
  {
    key: 'windows.advanced.utilization_limits.resident_memory_target_mb',
    first_supported_version: '8.12',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.utilization_limits.resident_memory_target_mb',
      {
        defaultMessage:
          'Control how much memory (in MB) should be kept resident in RAM. This setting affects Private Working Set but does not affect the amount of virtual memory requested from the OS (Private Bytes or Commit Charge). If plenty of unused RAM is available, Windows may give elastic-endpoint.exe more RAM than requested to reduce unnecessary paging and improve performance. If the current Elastic Defend configuration requires regularly touching more than the requested amount of memory, then the Private Working Set will be higher than requested here. The minimum value is 50. Default: 200.',
      }
    ),
  },
  {
    key: 'windows.advanced.alerts.sample_collection',
    first_supported_version: '8.13',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.alerts.sample_collection',
      {
        defaultMessage: 'Allow Elastic to collect samples of unknown malware files. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.alerts.sample_collection',
    first_supported_version: '8.13',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.alerts.sample_collection',
      {
        defaultMessage: 'Allow Elastic to collect samples of unknown malware files. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.alerts.sample_collection',
    first_supported_version: '8.13',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.alerts.sample_collection',
      {
        defaultMessage: 'Allow Elastic to collect samples of unknown malware files. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.disable_image_load_suppression_cache',
    first_supported_version: '8.12.1',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.disable_image_load_suppression_cache',
      {
        defaultMessage:
          'Disable the cache system used to improve image (DLL) load performance. Only disable this if image load events are not being generated as expected. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.disable_registry_write_suppression',
    first_supported_version: '8.12.1',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.disable_registry_write_suppression',
      {
        defaultMessage:
          'Ignore uninteresting registry events for performance. Only modify this to troubleshoot if registry events are not functioning as expected. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.process.creation_flags',
    first_supported_version: '8.13',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.process.creation_flags',
      {
        defaultMessage:
          'Enrich process events with process creation flags. Only use this setting to troubleshoot if process events are not functioning as expected. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.process.origin_info_collection',
    first_supported_version: '8.19',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.process.origin_info_collection',
      {
        defaultMessage:
          "Include 'process.origin_url', 'process.origin_referrer_url', and 'process.Ext.windows.zone_identifier' in process events. These fields normally show where the process's executable file was downloaded from, using information taken from the file's Mark of the Web. For 9.1 and earlier, default: false. For 9.2 and later, default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.events.memory_scan',
    first_supported_version: '8.14',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.memory_scan',
      {
        defaultMessage:
          'Enable an additional scan of suspicious memory regions against well-known malware signatures when malicious behavior alerts are triggered. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.flags',
    first_supported_version: '8.13',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.flags',
      {
        defaultMessage:
          'Provide a comma-separated list of feature flags. Currently no feature flags are supported.',
      }
    ),
  },
  {
    key: 'mac.advanced.flags',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.flags',
      {
        defaultMessage:
          'Provide a comma-separated list of feature flags. Currently no feature flags are supported.',
      }
    ),
  },
  {
    key: 'linux.advanced.flags',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.flags',
      {
        defaultMessage:
          'Provide a comma-separated list of feature flags. Currently no feature flags are supported.',
      }
    ),
  },
  {
    key: 'windows.advanced.artifacts.global.ca_cert',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.artifacts.global.ca_cert',
      {
        defaultMessage:
          'Provide an additional PEM-encoded certificate to validate the protection artifact update SSL/TLS server. Default: none.',
      }
    ),
  },
  {
    key: 'mac.advanced.artifacts.global.ca_cert',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.artifacts.global.ca_cert',
      {
        defaultMessage:
          'Provide an additional PEM-encoded certificate to validate the protection artifact update SSL/TLS server. Default: none.',
      }
    ),
  },
  {
    key: 'linux.advanced.artifacts.global.ca_cert',
    first_supported_version: '7.9',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.artifacts.global.ca_cert',
      {
        defaultMessage:
          'Provide an additional PEM-encoded certificate to validate the protection artifact update SSL/TLS server. Default: none.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.event_on_access.file_paths',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.event_on_access.file_paths',
      {
        defaultMessage:
          "Provide a comma-separated list of additional wildcard patterns that will be monitored for read access. At most one match per pattern per process will be reported. If possible, drive letters will be converted to NT paths (for example, '\\Device\\HarddiskVolume4'), but conversion will fail for per-user drives, such as network drives. Put only commas (no spaces) between entries. Wildcard matching is case-insensitive. Check Microsoft FsRtlIsNameInExpression documentation for wildcard matching rules. Default: none.",
      }
    ),
  },
  {
    key: 'windows.advanced.events.event_on_access.registry_paths',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.event_on_access.registry_paths',
      {
        defaultMessage:
          'Provide a comma-separated list of registry paths that will be monitored for read access. These must be NT paths (for example, \\REGISTRY\\MACHINE\\SOFTWARE\\Microsoft\\...). At most one match per pattern per process will be reported. Only commas (no spaces) should be used between entries. Wildcard matching is case-insensitive. See Microsoft FsRtlIsNameInExpression documentation for wildcard matching rules. Default: none.',
      }
    ),
  },
  {
    key: 'mac.advanced.events.event_on_access.file_paths',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.event_on_access.file_paths',
      {
        defaultMessage:
          'Provide a comma-separated list of additional wildcard patterns that will be monitored for read access. Put only commas (no spaces) between entries. Wildcard matching is case-insensitive. Default: none.',
      }
    ),
  },
  {
    key: 'mac.advanced.events.deduplicate_network_events',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.deduplicate_network_events',
      {
        defaultMessage:
          'Deduplicate network events based on repeated Src-IP/Dst-IP/Dst-Port/PID tuple grouping. For 8.14 and earlier, default: false. For 8.15 and later, default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.deduplicate_network_events',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.deduplicate_network_events',
      {
        defaultMessage:
          'Deduplicate network events based on repeated Src-IP/Dst-IP/Dst-Port/PID tuple grouping. For 8.14 and earlier, default: false. For 8.15 and later, default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.events.deduplicate_network_events',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.events.deduplicate_network_events',
      {
        defaultMessage:
          'Deduplicate network events based on repeated Src-IP/Dst-IP/Dst-Port/PID tuple grouping. For 8.14 and earlier, default: false. For 8.15 and later, default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.events.deduplicate_network_events_below_bytes',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.deduplicate_network_events_below_bytes',
      {
        defaultMessage:
          'Specify a network event deduplication transfer threshold, in bytes. Events for connections exceeding the threshold will always be emitted. A value 0 disables this feature. Default: 1048576 (1MB).',
      }
    ),
  },
  {
    key: 'windows.advanced.events.deduplicate_network_events_below_bytes',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.deduplicate_network_events_below_bytes',
      {
        defaultMessage:
          'Specify a network event deduplication transfer threshold, in bytes. Events for connections exceeding the threshold will always be emitted. A value 0 disables this feature. Default: 1048576 (1MB).',
      }
    ),
  },
  {
    key: 'linux.advanced.events.deduplicate_network_events_below_bytes',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.events.deduplicate_network_events_below_bytes',
      {
        defaultMessage:
          'Specify a network event deduplication transfer threshold, in bytes. Events for connections exceeding the threshold will always be emitted. A value 0 disables this feature. Default: 1048576 (1MB).',
      }
    ),
  },
  {
    key: 'windows.advanced.events.enforce_registry_filters',
    first_supported_version: '8.15',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.enforce_registry_filters',
      {
        defaultMessage:
          'Reduce data volume by filtering out registry events which are not relevant to behavioral protections. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.file.origin_info_collection',
    first_supported_version: '8.19',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.file.origin_info_collection',
      {
        defaultMessage:
          "Include 'file.origin_url', 'file.origin_referrer_url', and 'file.Ext.windows.zone_identifier' in file events. These fields show the details of file's Mark of the Web. Default: true.",
      }
    ),
  },
  {
    key: 'windows.advanced.events.file.max_hash_size_mb',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.file.max_hash_size_mb',
      {
        defaultMessage:
          "Attempt to include 'file.hash.sha256' in file events. Hashing is asynchronous, best-effort, and not guaranteed to succeed, especially on network drives. Warning: file hashing will increase Endpoint's CPU and I/O, and may adversely affect system responsiveness. Warning: Event processing will be delayed due to the time spent hashing, which will interfere with malicious behavior and ransomware protections and potentially allow threats to inflict additional damage. Set to 'off' to disable this feature. Set to '0' to hash all files up to 1 GiB. Otherwise, this sets the maximum to-be-hashed file size in MiB. Default: 'off'.",
      }
    ),
  },
  {
    key: 'linux.advanced.events.file.max_hash_size_mb',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.events.file.max_hash_size_mb',
      {
        defaultMessage:
          "Attempt to include 'file.hash.sha256' in file events. Hashing is asynchronous, best-effort, and not guaranteed to succeed, especially on network drives. Warning: file hashing will increase Endpoint's CPU and I/O, and may adversely affect system responsiveness. Warning: Event processing will be delayed due to the time spent hashing, which will interfere with malicious behavior and ransomware protections and potentially allow threats to inflict additional damage. Set to 'off' to disable this feature. Set to '0' to hash all files up to 1 GiB. Otherwise, this sets the maximum to-be-hashed file size in MiB. Default: off.",
      }
    ),
  },
  {
    key: 'mac.advanced.events.file.max_hash_size_mb',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.file.max_hash_size_mb',
      {
        defaultMessage:
          "Attempt to include 'file.hash.sha256' in file events. Hashing is asynchronous, best-effort, and not guaranteed to succeed, especially on network drives. Warning: file hashing will increase Endpoint's CPU and I/O, and may adversely affect system responsiveness. Warning: Event processing will be delayed due to the time spent hashing, which will interfere with malicious behavior and ransomware protections and potentially allow threats to inflict additional damage. Set to 'off' to disable this feature. Set to '0' to hash all files up to 1 GiB. Otherwise, this sets the maximum to-be-hashed file size in MiB. Default: off.",
      }
    ),
  },
  {
    key: 'windows.advanced.events.aggregate_process',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.aggregate_process',
      {
        defaultMessage:
          'Reduce event volume by merging related process events into fewer aggregate events. For 8.17 and earlier, default: false. For 8.18 and later, default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.events.aggregate_process',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.events.aggregate_process',
      {
        defaultMessage:
          'Reduce event volume by merging related process events into fewer aggregate events. For 8.17 and earlier, default: false. For 8.18 and later, default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.events.aggregate_process',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.aggregate_process',
      {
        defaultMessage:
          'Reduce event volume by merging related process events into fewer aggregate events. For 8.17 and earlier, default: false. For 8.18 and later, default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.aggregate_network',
    first_supported_version: '8.18',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.aggregate_network',
      {
        defaultMessage:
          'Reduce event volume by merging related network events into fewer aggregate events. For 8.17 and earlier, default: false. For 8.18 and later, default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.events.aggregate_network',
    first_supported_version: '8.18',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.events.aggregate_network',
      {
        defaultMessage:
          'Reduce event volume by merging related network events into fewer aggregate events. For 8.17 and earlier, default: false. For 8.18 and later, default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.events.aggregate_network',
    first_supported_version: '8.18',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.aggregate_network',
      {
        defaultMessage:
          'Reduce event volume by merging related network events into fewer aggregate events. For 8.17 and earlier, default: false. For 8.18 and later, default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.alerts.hash.md5',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.alerts.hash.md5',
      {
        defaultMessage:
          'Include MD5 hashes in alerts. Even if set to false, MD5 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.alerts.hash.sha1',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.alerts.hash.sha1',
      {
        defaultMessage:
          "Include SHA-1 hashes in alerts. Even if set to 'false', SHA-1 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'windows.advanced.events.hash.md5',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.hash.md5',
      {
        defaultMessage:
          "Include MD5 hashes in processes and libraries in events. Even if set to 'false', MD5 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'windows.advanced.events.hash.sha1',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.hash.sha1',
      {
        defaultMessage:
          "Include SHA-1 hashes in processes and libraries in events. Even if set to 'false', SHA-1 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'windows.advanced.events.hash.sha256',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.hash.sha256',
      {
        defaultMessage:
          "Include SHA-256 hashes in processes and libraries in events. Even if set to 'false', SHA-256 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'windows.advanced.events.security.provider_etw',
    first_supported_version: '8.19',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.security.provider_etw',
      {
        defaultMessage:
          'Enable the Microsoft-Windows-Security-Auditing ETW provider for security events collection. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.security.event_disabled',
    first_supported_version: '9.2',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.security.event_disabled',
      {
        defaultMessage:
          "Provide a comma-separated list of security event IDs to selectively disable. An example is '4624,4800,4801'. Default: none.",
      }
    ),
  },
  {
    key: 'windows.advanced.firewall_anti_tamper',
    first_supported_version: '9.2',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.firewall_anti_tamper',
      {
        defaultMessage:
          "Enable firewall anti tamper prevention or detection. Tamper protetion must also be enabled. Allowed values are 'prevent', 'detect', and 'off'. Default: prevent`.",
      }
    ),
  },
  {
    key: 'linux.advanced.alerts.hash.md5',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.alerts.hash.md5',
      {
        defaultMessage:
          'Include MD5 hashes in alerts. Even if set to false, MD5 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.',
      }
    ),
  },
  {
    key: 'linux.advanced.alerts.hash.sha1',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.alerts.hash.sha1',
      {
        defaultMessage:
          "Include SHA-1 hashes in alerts. Even if set to 'false', SHA-1 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'linux.advanced.events.hash.md5',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.events.hash.md5',
      {
        defaultMessage:
          "Include MD5 hashes in processes and libraries in events. Even if set to 'false', MD5 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'linux.advanced.events.hash.sha1',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.events.hash.sha1',
      {
        defaultMessage:
          "Include SHA-1 hashes in processes and libraries in events. Even if set to 'false', SHA-1 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'linux.advanced.events.hash.sha256',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.events.hash.sha256',
      {
        defaultMessage:
          "Include SHA-256 hashes in processes and libraries in events. Even if set to 'false', SHA-256 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'mac.advanced.alerts.hash.md5',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.alerts.hash.md5',
      {
        defaultMessage:
          'Include MD5 hashes in alerts. Even if set to false, MD5 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.',
      }
    ),
  },
  {
    key: 'mac.advanced.alerts.hash.sha1',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.alerts.hash.sha1',
      {
        defaultMessage:
          "Include SHA-1 hashes in alerts. Even if set to 'false', SHA-1 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'mac.advanced.events.hash.md5',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.hash.md5',
      {
        defaultMessage:
          "Include MD5 hashes in processes and libraries in events. Even if set to 'false', MD5 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'mac.advanced.events.hash.sha1',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.hash.sha1',
      {
        defaultMessage:
          "Include SHA-1 hashes in processes and libraries in events. Even if set to 'false', SHA-1 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'mac.advanced.events.hash.sha256',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.hash.sha256',
      {
        defaultMessage:
          "Include SHA-256 hashes in processes and libraries in events. Even if set to 'false', SHA-256 hashes will still be included if alert exceptions, trusted apps, or blocklisting require them. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'windows.advanced.set_extended_host_information',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.set_extended_host_information',
      {
        defaultMessage:
          "Include full 'host.*' fieldset information in events. When 'false', only 'id', 'name', and 'os' are included. Warning: 'true' will increase event size. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'mac.advanced.set_extended_host_information',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.set_extended_host_information',
      {
        defaultMessage:
          "Include full 'host.*' fieldset information in events. When 'false', only 'id', 'name', and 'os' are included. Warning: 'true' will increase event size. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'linux.advanced.set_extended_host_information',
    first_supported_version: '8.16',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.set_extended_host_information',
      {
        defaultMessage:
          "Include full 'host.*' fieldset information in events. When 'false', only 'id', 'name', and 'os' are included. Warning: 'true' will increase event size. For 8.17 and earlier, default: true. For 8.18 and later, default: false.",
      }
    ),
  },
  {
    key: 'linux.advanced.memory_protection.scan_on_network_event',
    first_supported_version: '8.17.6',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.memory_protection.scan_on_network_event',
      {
        defaultMessage: 'Scan for memory threats in response to network activity. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.memory_protection.scan_on_network_event',
    first_supported_version: '8.17.6',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.memory_protection.scan_on_network_event',
      {
        defaultMessage: 'Scan for memory threats in response to network activity. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.memory_protection.scan_on_network_event',
    first_supported_version: '8.17.6',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.memory_protection.scan_on_network_event',
      {
        defaultMessage: 'Scan for memory threats in response to network activity. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.memory_protection.scan_on_api_event',
    first_supported_version: '8.17.6',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.memory_protection.scan_on_api_event',
      {
        defaultMessage: 'Scan for memory threats in response to API events. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.memory_protection.scan_on_image_load_event',
    first_supported_version: '8.17.6',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.memory_protection.scan_on_image_load_event',
      {
        defaultMessage: 'Scan for memory threats in response to image loads. Default: true.',
      }
    ),
  },
  {
    key: 'windows.advanced.mitigations.policies.redirection_guard',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.mitigations.policies.redirection_guard',
      {
        defaultMessage:
          'Enable Windows Redirection Guard on Win10/Win11 21H2 and later. Default: true.',
      }
    ),
  },
  {
    key: 'linux.advanced.agent.orphaned_remediation',
    first_supported_version: '9.2',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.agent.orphaned_remediation',
      {
        defaultMessage:
          'Attempt to start Elastic Agent service when Elastic Defend becomes orphaned. Default: false.',
      }
    ),
  },
  {
    key: 'mac.advanced.agent.orphaned_remediation',
    first_supported_version: '9.2',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.agent.orphaned_remediation',
      {
        defaultMessage:
          'Attempt to start Elastic Agent service when Elastic Defend becomes orphaned. Default: false.',
      }
    ),
  },
  {
    key: 'windows.advanced.agent.orphaned_remediation',
    first_supported_version: '9.2',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.agent.orphaned_remediation',
      {
        defaultMessage:
          'Attempt to start Elastic Agent service when Elastic Defend becomes orphaned. Default: false.',
      }
    ),
  },
  {
    key: 'linux.advanced.utilization_limits.free_disk_space_gb',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.utilization_limits.free_disk_space_gb',
      {
        defaultMessage:
          'Keep at least the specified number of gigabytes of free space on the volume where Endpoint is installed. If free space falls below this threshold, certain features, such as response actions that require additional storage space, will no longer function. Default: no limit.',
      }
    ),
  },
  {
    key: 'mac.advanced.utilization_limits.free_disk_space_gb',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.utilization_limits.free_disk_space_gb',
      {
        defaultMessage:
          'Keep at least the specified number of gigabytes of free space on the volume where Endpoint is installed. If free space falls below this threshold, certain features, such as response actions that require additional storage space, will no longer function. Default: no limit.',
      }
    ),
  },
  {
    key: 'windows.advanced.utilization_limits.free_disk_space_gb',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.utilization_limits.free_disk_space_gb',
      {
        defaultMessage:
          'Keep at least the specified number of gigabytes of free space on the volume where Endpoint is installed. If free space falls below this threshold, certain features, such as response actions that require additional storage space, will no longer function. Default: no limit.',
      }
    ),
  },
  {
    key: 'linux.advanced.utilization_limits.free_disk_space_percent',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.utilization_limits.free_disk_space_percent',
      {
        defaultMessage:
          'Maintain a minimum percentage of free space on the volume where Endpoint is installed. If free space falls below this threshold, certain features, such as response actions that require additional space, will no longer function. Default: no limit.',
      }
    ),
  },
  {
    key: 'mac.advanced.utilization_limits.free_disk_space_percent',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.utilization_limits.free_disk_space_percent',
      {
        defaultMessage:
          'Maintain a minimum percentage of free space on the volume where Endpoint is installed. If free space falls below this threshold, certain features, such as response actions that require additional space, will no longer function. Default: no limit.',
      }
    ),
  },
  {
    key: 'windows.advanced.utilization_limits.free_disk_space_percent',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.utilization_limits.free_disk_space_percent',
      {
        defaultMessage:
          'Maintain a minimum percentage of free space on the volume where Endpoint is installed. If free space falls below this threshold, certain features, such as response actions that require additional space, will no longer function. Default: no limit.',
      }
    ),
  },
  {
    key: 'linux.advanced.response_actions.get_file.max_parallel_uploads',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.response_actions.get_file.max_parallel_uploads',
      {
        defaultMessage:
          'Maximum number of parallel uploads for get-file response action. Default: 1.',
      }
    ),
  },
  {
    key: 'mac.advanced.response_actions.get_file.max_parallel_uploads',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.response_actions.get_file.max_parallel_uploads',
      {
        defaultMessage:
          'Maximum number of parallel uploads for get-file response action. Default: 1.',
      }
    ),
  },
  {
    key: 'windows.advanced.response_actions.get_file.max_parallel_uploads',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.response_actions.get_file.max_parallel_uploads',
      {
        defaultMessage:
          'Maximum number of parallel uploads for get-file response action. Default: 1.',
      }
    ),
  },
  {
    key: 'linux.advanced.response_actions.get_file.upload_streams_count',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.linux.advanced.response_actions.get_file.upload_streams_count',
      {
        defaultMessage:
          'Maximum number of upload streams for get-file response action. Default: 1.',
      }
    ),
  },
  {
    key: 'mac.advanced.response_actions.get_file.upload_streams_count',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.response_actions.get_file.upload_streams_count',
      {
        defaultMessage:
          'Maximum number of upload streams for get-file response action. Default: 1.',
      }
    ),
  },
  {
    key: 'windows.advanced.response_actions.get_file.upload_streams_count',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.response_actions.get_file.upload_streams_count',
      {
        defaultMessage:
          'Maximum number of upload streams for get-file response action. Default: 1.',
      }
    ),
  },
  {
    key: 'windows.advanced.events.image_load.dll_hijack_detection',
    first_supported_version: '9.5',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.windows.advanced.events.image_load.dll_hijack_detection',
      {
        defaultMessage: 'Enable DLL search order hijacking detection. Default: true.',
      }
    ),
  },
  {
    key: 'mac.advanced.events.script_capture',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.script_capture',
      {
        defaultMessage: 'Capture script content for process create events. Default: false.',
      }
    ),
  },
  {
    key: 'mac.advanced.events.script_max_size',
    first_supported_version: '9.3',
    documentation: i18n.translate(
      'xpack.securitySolution.endpoint.policy.advanced.mac.advanced.events.script_max_size',
      {
        defaultMessage:
          'Maximum size of scripts captured by mac.advanced.events.script_capturein bytes. Default 1024.',
      }
    ),
  },
];
