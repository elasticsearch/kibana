/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * ATTENTION: Mappings for Fleet are defined in the Elasticsearch repo.
 *
 * The following mappings declared here closely mirror them
 * But they are only used to perform validation on the endpoints using ListWithKuery
 * They're needed to perform searches on these mapping trough the KQL searchboxes in the UI.
 * Whenever a field is added on any of these mappings in ES, make sure to add it here as well
 */

export const AGENT_POLICY_MAPPINGS = {
  properties: {
    agent_features: {
      properties: {
        name: { type: 'keyword' },
        enabled: { type: 'boolean' },
      },
    },
    data_output_id: { type: 'keyword' },
    description: { type: 'text' },
    download_source_id: { type: 'keyword' },
    download_source_ids: { type: 'keyword' },
    fleet_server_host_id: { type: 'keyword' },
    inactivity_timeout: { type: 'integer' },
    is_default: { type: 'boolean' },
    is_default_fleet_server: { type: 'boolean' },
    is_managed: { type: 'boolean' },
    is_preconfigured: { type: 'keyword' },
    is_protected: { type: 'boolean' },
    monitoring_enabled: { type: 'keyword', index: false },
    monitoring_output_id: { type: 'keyword' },
    name: { type: 'keyword' },
    namespace: { type: 'keyword' },
    revision: { type: 'integer' },
    schema_version: { type: 'version' },
    status: { type: 'keyword' },
    unenroll_timeout: { type: 'integer' },
    updated_at: { type: 'date' },
    updated_by: { type: 'keyword' },
    supports_agentless: { type: 'boolean' },
  },
} as const;

export const PACKAGE_POLICIES_MAPPINGS = {
  properties: {
    name: { type: 'keyword' },
    description: { type: 'text' },
    namespace: { type: 'keyword' },
    enabled: { type: 'boolean' },
    is_managed: { type: 'boolean' },
    policy_id: { type: 'keyword' },
    policy_ids: { type: 'keyword' },
    output_id: { type: 'keyword' },
    package: {
      properties: {
        name: { type: 'keyword' },
        title: { type: 'keyword' },
        version: { type: 'keyword' },
      },
    },
    elasticsearch: {
      dynamic: false,
      properties: {},
    },
    vars: { type: 'flattened' },
    inputs: {
      dynamic: false,
      properties: {},
    },
    secret_references: { properties: { id: { type: 'keyword' } } },
    supports_agentless: { type: 'boolean' },
    revision: { type: 'integer' },
    updated_at: { type: 'date' },
    updated_by: { type: 'keyword' },
    created_at: { type: 'date' },
    created_by: { type: 'keyword' },
  },
} as const;

export const AGENT_MAPPINGS = {
  properties: {
    access_api_key_id: {
      type: 'keyword',
    },
    action_seq_no: {
      type: 'integer',
    },
    active: {
      type: 'boolean',
    },
    agent: {
      properties: {
        id: {
          type: 'keyword',
        },
        version: {
          type: 'keyword',
        },
        type: {
          type: 'keyword',
        },
      },
    },
    default_api_key_id: {
      type: 'keyword',
    },
    enrollment_id: {
      type: 'keyword',
    },
    enrolled_at: {
      type: 'date',
    },
    last_checkin: {
      type: 'date',
    },
    last_checkin_message: {
      type: 'text',
      properties: {
        keyword: {
          type: 'keyword',
        },
      },
    },
    last_checkin_status: {
      type: 'keyword',
    },
    last_updated: {
      type: 'date',
    },
    local_metadata: {
      properties: {
        elastic: {
          properties: {
            agent: {
              properties: {
                build: {
                  properties: {
                    original: {
                      type: 'text',
                      properties: {
                        keyword: {
                          type: 'keyword',
                        },
                      },
                    },
                  },
                },
                id: {
                  type: 'keyword',
                },
                log_level: {
                  type: 'keyword',
                },
                snapshot: {
                  type: 'boolean',
                },
                upgradeable: {
                  type: 'boolean',
                },
                version: {
                  type: 'text',
                  properties: {
                    keyword: {
                      type: 'keyword',
                    },
                  },
                },
                unprivileged: {
                  type: 'boolean',
                },
              },
            },
          },
        },
        host: {
          properties: {
            architecture: {
              type: 'keyword',
            },
            hostname: {
              type: 'text',
              properties: {
                keyword: {
                  type: 'keyword',
                },
              },
            },
            id: {
              type: 'keyword',
            },
            ip: {
              type: 'text',
              properties: {
                keyword: {
                  type: 'keyword',
                },
              },
            },
            mac: {
              type: 'text',
              properties: {
                keyword: {
                  type: 'keyword',
                },
              },
            },
            name: {
              type: 'text',
              properties: {
                keyword: {
                  type: 'keyword',
                },
              },
            },
          },
        },
        os: {
          properties: {
            family: {
              type: 'keyword',
            },
            full: {
              type: 'text',
              properties: {
                keyword: {
                  type: 'keyword',
                },
              },
            },
            kernel: {
              type: 'text',
              properties: {
                keyword: {
                  type: 'keyword',
                },
              },
            },
            name: {
              type: 'text',
              properties: {
                keyword: {
                  type: 'keyword',
                },
              },
            },
            platform: {
              type: 'keyword',
            },
            version: {
              type: 'text',
              properties: {
                keyword: {
                  type: 'keyword',
                },
              },
            },
          },
        },
      },
    },
    namespaces: {
      type: 'keyword',
    },
    packages: {
      type: 'keyword',
    },
    policy_output_permissions_hash: {
      type: 'keyword',
    },
    policy_coordinator_idx: {
      type: 'integer',
    },
    policy_id: {
      type: 'keyword',
    },
    policy_base_id: {
      type: 'keyword',
    },
    policy_revision_idx: {
      type: 'integer',
    },
    type: {
      type: 'keyword',
    },
    tags: {
      type: 'keyword',
    },
    unenrolled_at: {
      type: 'date',
    },
    unenrollment_started_at: {
      type: 'date',
    },
    unenrolled_reason: {
      type: 'keyword',
    },
    unhealthy_reason: {
      type: 'keyword',
    },
    updated_at: {
      type: 'date',
    },
    upgrade_started_at: {
      type: 'date',
    },
    upgraded_at: {
      type: 'date',
    },
    upgrade_status: {
      type: 'keyword',
    },
    upgrade_details: {
      properties: {
        target_version: {
          type: 'text',
          fields: {
            keyword: {
              type: 'keyword',
            },
          },
        },
        action_id: {
          type: 'keyword',
        },
        state: {
          type: 'keyword',
        },
        metadata: {
          properties: {
            scheduled_at: {
              type: 'date',
            },
            download_percent: {
              type: 'double',
            },
            download_rate: {
              type: 'double',
            },
            failed_state: {
              type: 'keyword',
            },
            error_msg: {
              type: 'text',
              fields: {
                keyword: {
                  type: 'keyword',
                },
              },
            },
            retry_error_msg: {
              type: 'text',
              fields: {
                keyword: {
                  type: 'keyword',
                },
              },
            },
            retry_until: {
              type: 'date',
            },
          },
        },
      },
    },
    upgrade_attempts: {
      type: 'date',
    },
    // added to allow validation on status field
    status: {
      type: 'keyword',
    },
    sequence_num: {
      type: 'integer',
    },
    capabilities: {
      type: 'keyword',
    },
    identifying_attributes: {
      properties: {
        service: {
          properties: {
            name: {
              type: 'keyword',
            },
            version: {
              type: 'keyword',
            },
            instance: {
              properties: {
                id: {
                  type: 'keyword',
                },
              },
            },
          },
        },
      },
    },
    service: {
      properties: {
        name: {
          type: 'keyword',
        },
        version: {
          type: 'keyword',
        },
        instance: {
          properties: {
            id: {
              type: 'keyword',
            },
          },
        },
      },
    },
    non_identifying_attributes: {
      properties: {
        host: {
          properties: {
            arch: {
              type: 'keyword',
            },
            name: {
              type: 'keyword',
            },
          },
        },
        os: {
          properties: {
            type: {
              type: 'keyword',
            },
            description: {
              type: 'keyword',
            },
          },
        },
        elastic: {
          properties: {
            display: {
              properties: {
                name: {
                  type: 'keyword',
                },
              },
            },
            collector: {
              properties: {
                group: {
                  type: 'keyword',
                },
                group_name: {
                  type: 'keyword',
                },
              },
            },
          },
        },
        config: {
          properties: {
            description: {
              type: 'keyword',
            },
            name: {
              type: 'keyword',
            },
          },
        },
        deployment: {
          properties: {
            environment: {
              properties: {
                name: {
                  type: 'keyword',
                },
              },
            },
          },
        },
      },
    },
    host: {
      properties: {
        arch: {
          type: 'keyword',
        },
        name: {
          type: 'keyword',
        },
      },
    },
    os: {
      properties: {
        type: {
          type: 'keyword',
        },
        description: {
          type: 'keyword',
        },
      },
    },
    elastic: {
      properties: {
        display: {
          properties: {
            name: {
              type: 'keyword',
            },
          },
        },
        collector: {
          properties: {
            group: {
              type: 'keyword',
            },
            group_name: {
              type: 'keyword',
            },
          },
        },
      },
    },
    config: {
      properties: {
        description: {
          type: 'keyword',
        },
        name: {
          type: 'keyword',
        },
      },
    },
    deployment: {
      properties: {
        environment: {
          properties: {
            name: {
              type: 'keyword',
            },
          },
        },
      },
    },
  },
} as const;

export const ENROLLMENT_API_KEY_MAPPINGS = {
  properties: {
    active: {
      type: 'boolean',
    },
    api_key: {
      type: 'keyword',
    },
    api_key_id: {
      type: 'keyword',
    },
    created_at: {
      type: 'date',
    },
    expire_at: {
      type: 'date',
    },
    name: {
      type: 'keyword',
    },
    policy_id: {
      type: 'keyword',
    },
    updated_at: {
      type: 'date',
    },
    hidden: {
      type: 'boolean',
    },
  },
} as const;
