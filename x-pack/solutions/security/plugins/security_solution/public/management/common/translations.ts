/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { OperatingSystem } from '@kbn/securitysolution-utils';

export const ENDPOINTS_TAB = i18n.translate('xpack.securitySolution.endpointsTab', {
  defaultMessage: 'Endpoints',
});

export const POLICIES_TAB = i18n.translate('xpack.securitySolution.policiesTab', {
  defaultMessage: 'Policies',
});

export const ENDPOINT_EXCEPTIONS_TAB = i18n.translate(
  'xpack.securitySolution.endpointExceptionsTab',
  { defaultMessage: 'Endpoint exceptions' }
);

export const TRUSTED_APPS_TAB = i18n.translate('xpack.securitySolution.trustedAppsTab', {
  defaultMessage: 'Trusted applications',
});

export const TRUSTED_DEVICES_TAB = i18n.translate('xpack.securitySolution.trustedDevicesTab', {
  defaultMessage: 'Trusted devices',
});

export const EVENT_FILTERS_TAB = i18n.translate('xpack.securitySolution.eventFiltersTab', {
  defaultMessage: 'Event filters',
});

export const HOST_ISOLATION_EXCEPTIONS_TAB = i18n.translate(
  'xpack.securitySolution.artifacts.tabs.hostIsolationExceptions',
  { defaultMessage: 'Host isolation exceptions' }
);

export const BLOCKLIST_TAB = i18n.translate('xpack.securitySolution.artifacts.tabs.blocklist', {
  defaultMessage: 'Blocklist',
});

export const OS_TITLES: Readonly<{ [K in OperatingSystem]: string }> = {
  [OperatingSystem.WINDOWS]: i18n.translate('xpack.securitySolution.administration.os.windows', {
    defaultMessage: 'Windows',
  }),
  [OperatingSystem.MAC]: i18n.translate('xpack.securitySolution.administration.os.macos', {
    defaultMessage: 'Mac',
  }),
  [OperatingSystem.LINUX]: i18n.translate('xpack.securitySolution.administration.os.linux', {
    defaultMessage: 'Linux',
  }),
};

export const OPERATING_SYSTEM_WINDOWS_AND_MAC = i18n.translate(
  'xpack.securitySolution.administration.os.windowsAndMac',
  {
    defaultMessage: 'Windows and Mac',
  }
);

export const getLoadPoliciesError = (error: Error) => {
  return i18n.translate('xpack.securitySolution.exceptions.failedLoadPolicies', {
    defaultMessage: 'There was an error loading policies: "{error}"',
    values: { error: error.message },
  });
};

export const ERROR_LOADING_CUSTOM_SCRIPTS = i18n.translate(
  'xpack.securitySolution.consoleArgumentSelectors.customScripts.errorLoading',
  {
    defaultMessage: 'Error loading custom scripts',
  }
);

export const ERROR_LOADING_PENDING_ACTIONS = i18n.translate(
  'xpack.securitySolution.consoleArgumentSelectors.pendingActions.errorLoading',
  {
    defaultMessage: 'Error loading pending actions',
  }
);

/** Used by multiple command */
export const ENDPOINT_EXECUTION_TIMEOUT = i18n.translate(
  'xpack.securitySolution.endpointConsoleCommands.executionTimeout',
  {
    defaultMessage:
      'The timeout in units of time (h for hours, m for minutes, s for seconds) for the endpoint to wait for the script to complete. Example: 37m. If not given, it defaults to 4 hours.',
  }
);

export const getGenericErrorMessage = (errorTitlePrefix: string, code: string) => {
  return i18n.translate('xpack.securitySolution.consoleArgumentSelectors.genericError', {
    defaultMessage: '{prefix}Error {code}',
    values: { prefix: errorTitlePrefix ? `${errorTitlePrefix}: ` : '', code },
  });
};

export const getCancelPermissionDeniedMessage = (displayCommand: string) => {
  return i18n.translate('xpack.securitySolution.consoleArgumentSelectors.cancel.permissionDenied', {
    defaultMessage: "You don't have permission to run {displayCommand} action.",
    values: { displayCommand },
  });
};

export const getPendingActionDescription = (
  action: string,
  createdBy: string,
  timeStamp: string
) => {
  return i18n.translate(
    'xpack.securitySolution.consoleArgumentSelectors.pendingAction.description',
    {
      defaultMessage: 'Action id {action} submitted by {createdBy} on {timeStamp}',
      values: { action, createdBy, timeStamp },
    }
  );
};

export const getPermissionVerificationErrorMessage = (displayCommand: string) => {
  return i18n.translate(
    'xpack.securitySolution.consoleArgumentSelectors.cancel.permissionVerificationError',
    {
      defaultMessage: 'Unable to verify permissions for {displayCommand} action cancellation.',
      values: { displayCommand },
    }
  );
};

export const CONSOLE_COMMANDS = {
  isolate: {
    title: i18n.translate('xpack.securitySolution.endpointConsoleCommands.isolate.title', {
      defaultMessage: 'Isolate',
    }),
    about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.isolate.about', {
      defaultMessage: 'Isolate the host',
    }),
    privileges: i18n.translate(
      'xpack.securitySolution.endpointConsoleCommands.isolate.privileges',
      {
        defaultMessage:
          'Insufficient privileges to isolate hosts. Contact your Kibana administrator if you think you should have this permission.',
      }
    ),
  },
  release: {
    about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.release.about', {
      defaultMessage: 'Release the host',
    }),
  },
  killProcess: {
    title: i18n.translate('xpack.securitySolution.endpointConsoleCommands.killProcess.title', {
      defaultMessage: 'Kill process',
    }),
    about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.killProcess.about', {
      defaultMessage: 'Kill/terminate a process',
    }),
    privileges: i18n.translate(
      'xpack.securitySolution.endpointConsoleCommands.killProcess.privileges',
      {
        defaultMessage:
          'Insufficient privileges to kill process. Contact your Kibana administrator if you think you should have this permission.',
      }
    ),
    args: {
      pid: {
        about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.pid.arg.comment', {
          defaultMessage: 'A PID representing the process to kill',
        }),
      },
      entityId: {
        about: i18n.translate(
          'xpack.securitySolution.endpointConsoleCommands.entityId.arg.comment',
          {
            defaultMessage: 'An entity id representing the process to kill',
          }
        ),
      },
      processName: {
        about: i18n.translate(
          'xpack.securitySolution.endpointConsoleCommands.processName.arg.comment',
          { defaultMessage: 'The process name to kill' }
        ),
      },
    },
  },
  suspendProcess: {
    title: i18n.translate('xpack.securitySolution.endpointConsoleCommands.suspendProcess.title', {
      defaultMessage: 'Suspend process',
    }),
    about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.suspendProcess.about', {
      defaultMessage: 'Temporarily suspend a process',
    }),
    privileges: i18n.translate(
      'xpack.securitySolution.endpointConsoleCommands.suspendProcess.privileges',
      {
        defaultMessage:
          'Insufficient privileges to supend process. Contact your Kibana administrator if you think you should have this permission.',
      }
    ),
    args: {
      pid: {
        about: i18n.translate(
          'xpack.securitySolution.endpointConsoleCommands.suspendProcess.pid.arg.comment',
          {
            defaultMessage: 'A PID representing the process to suspend',
          }
        ),
      },
      entityId: {
        about: i18n.translate(
          'xpack.securitySolution.endpointConsoleCommands.suspendProcess.entityId.arg.comment',
          {
            defaultMessage: 'An entity id representing the process to suspend',
          }
        ),
      },
    },
  },
  status: {
    about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.status.about', {
      defaultMessage: 'Show host status information',
    }),
  },
  processes: {
    about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.processes.about', {
      defaultMessage: 'Show all running processes',
    }),
  },
  getFile: {
    about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.getFile.about', {
      defaultMessage: 'Retrieve a file from the host',
    }),
    args: {
      path: {
        about: i18n.translate(
          'xpack.securitySolution.endpointConsoleCommands.getFile.pathArgAbout',
          {
            defaultMessage: 'The full file path to be retrieved',
          }
        ),
      },
    },
  },
  execute: {
    about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.execute.about', {
      defaultMessage: 'Execute a command on the host',
    }),
    args: {
      timeout: {
        about: ENDPOINT_EXECUTION_TIMEOUT,
      },
    },
  },
  upload: {
    about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.upload.about', {
      defaultMessage: 'Upload a file to the host',
    }),
    args: {
      file: {
        about: i18n.translate(
          'xpack.securitySolution.endpointConsoleCommands.upload.args.file.about',
          {
            defaultMessage: 'The file that will be sent to the host',
          }
        ),
      },
      overwrite: {
        about: i18n.translate(
          'xpack.securitySolution.endpointConsoleCommands.upload.args.overwrite.about',
          {
            defaultMessage: 'Overwrite the file on the host if it already exists',
          }
        ),
      },
    },
  },
  scan: {
    about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.scan.about', {
      defaultMessage: 'Scan the host for malware',
    }),
    args: {
      path: {
        about: i18n.translate(
          'xpack.securitySolution.endpointConsoleCommands.scan.args.path.about',
          {
            defaultMessage: 'The absolute path to a file or directory to be scanned',
          }
        ),
      },
    },
  },
  runscript: {
    about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.runscript.about', {
      defaultMessage: 'Run a script on the host',
    }),
    title: i18n.translate('xpack.securitySolution.endpointConsoleCommands.runscript.title', {
      defaultMessage: 'Run script',
    }),
    privileges: i18n.translate(
      'xpack.securitySolution.endpointConsoleCommands.runscript.privileges',
      {
        defaultMessage:
          'Insufficient privileges to create runscript actions. Contact your Kibana administrator if you think you should have this permission.',
      }
    ),
  },
  cancel: {
    about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.cancel.about', {
      defaultMessage: 'Cancel a pending action on the host',
    }),
    forceArgInfo: i18n.translate(
      'xpack.securitySolution.endpointConsoleCommands.cancel.forceArgInfo',
      {
        defaultMessage: 'Forcefully cancel the action, even if it is already in progress',
      }
    ),
  },
  memoryDump: {
    about: i18n.translate('xpack.securitySolution.endpointConsoleCommands.memoryDump.about', {
      defaultMessage: 'Generate a memory dump on the host',
    }),
    argNotSupported: i18n.translate(
      'xpack.securitySolution.translations.memoryDump.argNotSupported',
      {
        defaultMessage: '(NOTE: not currently supported for this host type)',
      }
    ),
    kernelArgAbout: i18n.translate(
      'xpack.securitySolution.translations.memoryDump.kernelArgAbout',
      {
        defaultMessage: 'Generates a kernel memory dump',
      }
    ),
    processArgAbout: i18n.translate(
      'xpack.securitySolution.translations.memoryDump.processArgAbout',
      {
        defaultMessage: 'Generates memory dump for a process',
      }
    ),
    pidArgAbout: i18n.translate('xpack.securitySolution.translations.memoryDump.pidArgAbout', {
      defaultMessage:
        'Process ID to generate a memory dump for. Valid only when "--process" is used',
    }),
    entityIdArgAbout: i18n.translate(
      'xpack.securitySolution.translations.memoryDump.entityIdArgAbout',
      {
        defaultMessage:
          'Process Entity ID to generate a memory dump for. Valid only when "--process" is used',
      }
    ),
    agentResultMissing: i18n.translate(
      'xpack.securitySolution.translations.memoryDump.agentResultMissing',
      { defaultMessage: 'Agent result missing' }
    ),
    resultFileLabel: i18n.translate(
      'xpack.securitySolution.translations.memoryDump.resultFileLabel',
      { defaultMessage: 'File' }
    ),
    resultFileSizeLabel: i18n.translate(
      'xpack.securitySolution.translations.memoryDump.resultFileSizeLabel',
      { defaultMessage: 'Size' }
    ),
    resultRemainingFreeDiskSpaceLabel: i18n.translate(
      'xpack.securitySolution.translations.memoryDump.resultRemainingFreeDiskSpaceLabel',
      { defaultMessage: 'Disk free space' }
    ),
  },
};

export const CROWDSTRIKE_CONSOLE_COMMANDS = {
  runscript: {
    args: {
      raw: {
        about: i18n.translate(
          'xpack.securitySolution.crowdStrikeConsoleCommands.runscript.args.raw.about',
          {
            defaultMessage: 'Raw script content',
          }
        ),
      },
      cloudFile: {
        about: i18n.translate(
          'xpack.securitySolution.crowdStrikeConsoleCommands.runscript.args.cloudFile.about',
          {
            defaultMessage: 'Script name in cloud storage',
          }
        ),
      },
      commandLine: {
        about: i18n.translate(
          'xpack.securitySolution.crowdStrikeConsoleCommands.runscript.args.commandLine.about',
          {
            defaultMessage: 'Command line arguments',
          }
        ),
      },
      hostPath: {
        about: i18n.translate(
          'xpack.securitySolution.crowdStrikeConsoleCommands.runscript.args.hostPath.about',
          {
            defaultMessage: 'Absolute or relative path of script on host machine',
          }
        ),
      },
      timeout: {
        about: i18n.translate(
          'xpack.securitySolution.crowdStrikeConsoleCommands.runscript.args.timeout.about',
          {
            defaultMessage: 'Timeout in seconds',
          }
        ),
      },
    },
    title: i18n.translate('xpack.securitySolution.crowdStrikeConsoleCommands.runscript.title', {
      defaultMessage: 'Run Script',
    }),
    helpExample: i18n.translate(
      'xpack.securitySolution.crowdStrikeConsoleCommands.runscript.about',
      {
        defaultMessage: `Command Examples for Running Scripts:

1. Executes a script saved in the CrowdStrike cloud with the specified command-line arguments.

   runscript --CloudFile="CloudScript1.ps1" --CommandLine="-Verbose true"

2. Executes a script saved in the CrowdStrike cloud with the specified command-line arguments and a 180-second timeout.

   runscript --CloudFile="CloudScript1.ps1" --CommandLine="-Verbose true" -Timeout=180

3. Executes a raw script provided entirely within the "--Raw" flag.

   runscript --Raw=\`\`\`Get-ChildItem.\`\`\`

4. Executes a script located on the remote host at the specified path with the provided command-line arguments.

   runscript --HostPath="C:\\temp\\LocalScript.ps1" --CommandLine="-Verbose true"

`,
      }
    ),
    privileges: i18n.translate(
      'xpack.securitySolution.crowdStrikeConsoleCommands.runscript.privileges',
      {
        defaultMessage:
          'Insufficient privileges to run script. Contact your Kibana administrator if you think you should have this permission.',
      }
    ),
  },
};

export const MS_DEFENDER_ENDPOINT_CONSOLE_COMMANDS = {
  runscript: {
    args: {
      scriptName: {
        about: i18n.translate(
          'xpack.securitySolution.msDefenderEndpointConsoleCommands.runscript.args.scriptName.about',
          {
            defaultMessage: 'Script name in Files Library',
          }
        ),
      },
      args: {
        about: i18n.translate(
          'xpack.securitySolution.msDefenderEndpointConsoleCommands.runscript.args.args.about',
          {
            defaultMessage: 'Command line arguments',
          }
        ),
      },
    },

    helpExample: i18n.translate(
      'xpack.securitySolution.msDefenderEndpointConsoleCommands.runscript.about',
      {
        defaultMessage: `Command Examples for Running Scripts:
   runscript --ScriptName="CloudScript1.ps1" --Args="--Verbose true"
`,
      }
    ),
    privileges: i18n.translate(
      'xpack.securitySolution.msDefenderEndpointConsoleCommands.runscript.privileges',
      {
        defaultMessage:
          'Insufficient privileges to run script. Contact your Kibana administrator if you think you should have this permission.',
      }
    ),
  },
};

export const NO_PRIVILEGE_FOR_MANAGEMENT_OF_GLOBAL_ARTIFACT_MESSAGE = i18n.translate(
  'xpack.securitySolution.translations.noGlobalArtifactManagementAllowedMessage',
  { defaultMessage: 'Management of global artifacts requires additional privilege' }
);

export const ARTIFACT_POLICIES_NOT_ACCESSIBLE_IN_ACTIVE_SPACE_MESSAGE = (count: number): string =>
  i18n.translate('xpack.securitySolution.translations.artifactPoliciesNotAccessibleInActiveSpace', {
    defaultMessage:
      'This artifact is associated with {count} {count, plural, =1 {policy that is} other {policies that are}} not accessible in active space',
    values: { count },
  });

/**
 * Labels for the response action status (as defined in ResponseActionStatus)
 */
export const RESPONSE_ACTION_STATUS = Object.freeze({
  failedMessage: i18n.translate('xpack.securitySolution.responseActionStatus.failed', {
    defaultMessage: 'Action failed',
  }),

  pendingMessage: i18n.translate('xpack.securitySolution.responseActionStatus.pending', {
    defaultMessage: 'Action pending',
  }),

  successMessage: i18n.translate('xpack.securitySolution.responseActionStatus.success', {
    defaultMessage: 'Action successful',
  }),
});
