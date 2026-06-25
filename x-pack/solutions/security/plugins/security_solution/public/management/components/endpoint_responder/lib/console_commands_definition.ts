/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { getMemoryDumpHelpUsage } from './get_memory_dump_help_usage';
import { MemoryDumpActionResult } from '../command_render_components/memory_dump_action';
import { CancelActionResult } from '../command_render_components/cancel_action';
import { isActionSupportedByAgentType } from '../../../../../common/endpoint/service/response_actions/is_response_action_supported';
import { isCancelFeatureAvailable } from '../../../../../common/endpoint/service/authz/cancel_authz_utils';
import type { SupportedHostOsType } from '../../../../../common/endpoint/constants';
import type { EndpointCommandDefinitionMeta } from '../types';
import type { CustomScriptSelectorState } from '../../console_argument_selectors/custom_scripts_selector/custom_script_selector';
import { CustomScriptSelector } from '../../console_argument_selectors/custom_scripts_selector/custom_script_selector';
import { CancelablePendingActionsSelector } from '../../console_argument_selectors/cancelable_pending_actions_selector/cancelable_pending_actions_selector';
import type {
  EndpointRunScriptActionParameters,
  SentinelOneRunScriptActionParameters,
} from '../command_render_components/run_script_action';
import { RunScriptActionResult } from '../command_render_components/run_script_action';
import type { CommandArgDefinition } from '../../console/types';
import { isAgentTypeAndActionSupported } from '../../../../common/lib/endpoint';
import { getRbacControl } from '../../../../../common/endpoint/service/response_actions/utils';
import { UploadActionResult } from '../command_render_components/upload_action';
import {
  ArgumentFileSelector,
  CrowdstrikeScriptInputParams,
  EndpointScriptInputParams,
  MicrosoftScriptInputParams,
} from '../../console_argument_selectors';
import type { ParsedArgData } from '../../console/service/types';
import { ExperimentalFeaturesService } from '../../../../common/experimental_features_service';
import type {
  ConsoleResponseActionCommands,
  EndpointCapabilities,
  ResponseActionAgentType,
} from '../../../../../common/endpoint/service/response_actions/constants';
import {
  RESPONSE_CONSOLE_ACTION_COMMANDS_TO_ENDPOINT_CAPABILITY,
  RESPONSE_CONSOLE_COMMAND_TO_API_COMMAND_MAP,
} from '../../../../../common/endpoint/service/response_actions/constants';
import { GetFileActionResult } from '../command_render_components/get_file_action';
import type { Command, CommandDefinition } from '../../console';
import { IsolateActionResult } from '../command_render_components/isolate_action';
import { ReleaseActionResult } from '../command_render_components/release_action';
import { KillProcessActionResult } from '../command_render_components/kill_process_action';
import { SuspendProcessActionResult } from '../command_render_components/suspend_process_action';
import { EndpointStatusActionResult } from '../command_render_components/status_action';
import { GetProcessesActionResult } from '../command_render_components/get_processes_action';
import {
  ExecuteActionResult,
  getExecuteCommandArgAboutInfo,
} from '../command_render_components/execute_action';
import type {
  EndpointPrivileges,
  EndpointScript,
  ImmutableArray,
  SentinelOneScript,
} from '../../../../../common/endpoint/types';
import {
  INSUFFICIENT_PRIVILEGES_FOR_COMMAND,
  UPGRADE_AGENT_FOR_RESPONDER,
} from '../../../../common/translations';
import { getCommandAboutInfo } from './get_command_about_info';

import { validateUnitOfTime } from './utils';
import {
  CONSOLE_COMMANDS,
  CROWDSTRIKE_CONSOLE_COMMANDS,
  ENDPOINT_EXECUTION_TIMEOUT,
  MS_DEFENDER_ENDPOINT_CONSOLE_COMMANDS,
} from '../../../common/translations';
import { ScanActionResult } from '../command_render_components/scan_action';
import { SentinelOneScriptInputParams } from '../../console_argument_selectors/script_input_params_selector';

const emptyArgumentValidator = (argData: ParsedArgData): true | string => {
  if (argData?.length > 0 && typeof argData[0] === 'string' && argData[0]?.trim().length > 0) {
    return true;
  } else {
    return i18n.translate('xpack.securitySolution.endpointConsoleCommands.emptyArgumentMessage', {
      defaultMessage: 'Argument cannot be empty',
    });
  }
};

const pidValidator = (argData: ParsedArgData): true | string => {
  const emptyResult = emptyArgumentValidator(argData);
  if (emptyResult !== true) {
    return emptyResult;
  } else if (Number.isSafeInteger(Number(argData)) && Number(argData) > 0) {
    return true;
  } else {
    return i18n.translate('xpack.securitySolution.endpointConsoleCommands.invalidPidMessage', {
      defaultMessage: 'Argument must be a positive number representing the PID of a process',
    });
  }
};

const executeTimeoutValidator = (argData: ParsedArgData): true | string => {
  if (String(argData).trim().length && validateUnitOfTime(String(argData).trim())) {
    return true;
  } else {
    return i18n.translate('xpack.securitySolution.endpointConsoleCommands.invalidExecuteTimeout', {
      defaultMessage:
        'Argument must be a string with a positive integer value followed by a unit of time (h for hours, m for minutes, s for seconds). Example: 37m.',
    });
  }
};

const capabilitiesAndPrivilegesValidator = (
  agentType: ResponseActionAgentType
): ((command: Command) => string | true) => {
  return (command: Command) => {
    const privileges = command.commandDefinition.meta.privileges;
    const agentCapabilities: EndpointCapabilities[] = command.commandDefinition.meta.capabilities;
    const commandName = command.commandDefinition.name as ConsoleResponseActionCommands;
    const responderCapabilities =
      RESPONSE_CONSOLE_ACTION_COMMANDS_TO_ENDPOINT_CAPABILITY[commandName] ?? [];
    let errorMessage = '';

    // We only validate Agent capabilities for the command for Endpoint agents
    if (agentType === 'endpoint') {
      if (!responderCapabilities.length) {
        errorMessage = errorMessage.concat(UPGRADE_AGENT_FOR_RESPONDER(agentType, commandName));
      } else if (
        !responderCapabilities.some((capability) => agentCapabilities.includes(capability))
      ) {
        errorMessage = errorMessage.concat(UPGRADE_AGENT_FOR_RESPONDER(agentType, commandName));
      }
    }

    if (!getRbacControl({ commandName, privileges })) {
      errorMessage = errorMessage.concat(INSUFFICIENT_PRIVILEGES_FOR_COMMAND);
    }

    if (errorMessage.length) {
      return errorMessage;
    }

    return true;
  };
};

export const HELP_GROUPS = Object.freeze({
  responseActions: {
    position: 0,
    label: i18n.translate('xpack.securitySolution.endpointConsoleCommands.groups.responseActions', {
      defaultMessage: 'Response actions',
    }),
  },
});

const ENTER_PID_OR_ENTITY_ID_INSTRUCTION = i18n.translate(
  'xpack.securitySolution.endpointResponseActionsConsoleCommands.enterPidOrEntityId',
  { defaultMessage: 'Enter a pid or an entity id to execute' }
);

const ENTER_OR_ADD_COMMENT_ARG_INSTRUCTION = i18n.translate(
  'xpack.securitySolution.endpointResponseActionsConsoleCommands.enterOrAddOptionalComment',
  { defaultMessage: 'Hit enter to execute or add an optional comment' }
);

const COMMENT_ARG_ABOUT = i18n.translate(
  'xpack.securitySolution.endpointConsoleCommands.suspendProcess.commandArgAbout',
  { defaultMessage: 'A comment to go along with the action' }
);

const commandCommentArgument = (): { comment: CommandArgDefinition } => {
  return {
    comment: {
      required: false,
      allowMultiples: false,
      about: COMMENT_ARG_ABOUT,
    },
  };
};

export interface GetEndpointConsoleCommandsOptions {
  endpointAgentId: string;
  agentType: ResponseActionAgentType;
  /** Applicable only for Endpoint Agents */
  endpointCapabilities: ImmutableArray<string>;
  endpointPrivileges: EndpointPrivileges;
  /** Host's platform: windows, linux, macos */
  platform: SupportedHostOsType;
}

export const getEndpointConsoleCommands = ({
  endpointAgentId,
  agentType,
  endpointCapabilities,
  endpointPrivileges,
  platform,
}: GetEndpointConsoleCommandsOptions): CommandDefinition[] => {
  const featureFlags = ExperimentalFeaturesService.get();
  const {
    crowdstrikeRunScriptEnabled,
    microsoftDefenderEndpointRunScriptEnabled,
    microsoftDefenderEndpointCancelEnabled,
    responseActionsEndpointCancel,
    responseActionsEndpointMemoryDump,
    responseActionsEndpointRunScript,
  } = featureFlags;
  const commandMeta: EndpointCommandDefinitionMeta = {
    agentType,
    platform,
    endpointId: endpointAgentId,
    capabilities: endpointCapabilities,
    privileges: endpointPrivileges,
  };

  const doesEndpointSupportCommand = (commandName: ConsoleResponseActionCommands) => {
    // Agent capabilities are only validated for Endpoint agent types
    if (agentType !== 'endpoint') {
      return true;
    }

    const responderCapability: EndpointCapabilities[] = [
      ...(RESPONSE_CONSOLE_ACTION_COMMANDS_TO_ENDPOINT_CAPABILITY[commandName] ?? []),
    ];

    if (responderCapability.length) {
      return responderCapability.some((capability) => endpointCapabilities.includes(capability));
    }

    return false;
  };

  const canCancelForCurrentContext = () => {
    return isCancelFeatureAvailable(endpointPrivileges, featureFlags, agentType);
  };

  let consoleCommands: CommandDefinition[] = [
    {
      name: 'isolate',
      about: getCommandAboutInfo({
        aboutInfo: CONSOLE_COMMANDS.isolate.about,
        isSupported: doesEndpointSupportCommand('isolate'),
      }),
      RenderComponent: IsolateActionResult,
      meta: commandMeta,
      exampleUsage: 'isolate --comment "isolate this host"',
      exampleInstruction: ENTER_OR_ADD_COMMENT_ARG_INSTRUCTION,
      validate: capabilitiesAndPrivilegesValidator(agentType),
      args: {
        ...commandCommentArgument(),
      },
      helpGroupLabel: HELP_GROUPS.responseActions.label,
      helpGroupPosition: HELP_GROUPS.responseActions.position,
      helpCommandPosition: 0,
      helpDisabled: doesEndpointSupportCommand('isolate') === false,
      helpHidden: !getRbacControl({ commandName: 'isolate', privileges: endpointPrivileges }),
    },
    {
      name: 'release',
      about: getCommandAboutInfo({
        aboutInfo: CONSOLE_COMMANDS.release.about,

        isSupported: doesEndpointSupportCommand('release'),
      }),
      RenderComponent: ReleaseActionResult,
      meta: commandMeta,
      exampleUsage: 'release --comment "release this host"',
      exampleInstruction: ENTER_OR_ADD_COMMENT_ARG_INSTRUCTION,
      validate: capabilitiesAndPrivilegesValidator(agentType),
      args: {
        ...commandCommentArgument(),
      },
      helpGroupLabel: HELP_GROUPS.responseActions.label,
      helpGroupPosition: HELP_GROUPS.responseActions.position,
      helpCommandPosition: 1,
      helpDisabled: doesEndpointSupportCommand('release') === false,
      helpHidden: !getRbacControl({ commandName: 'release', privileges: endpointPrivileges }),
    },
    {
      name: 'kill-process',
      about: getCommandAboutInfo({
        aboutInfo: CONSOLE_COMMANDS.killProcess.about,
        isSupported: doesEndpointSupportCommand('kill-process'),
      }),
      RenderComponent: KillProcessActionResult,
      meta: commandMeta,
      exampleUsage: 'kill-process --pid 123 --comment "kill this process"',
      exampleInstruction: ENTER_PID_OR_ENTITY_ID_INSTRUCTION,
      validate: capabilitiesAndPrivilegesValidator(agentType),
      mustHaveArgs: true,
      args: {
        ...commandCommentArgument(),
        entityId: {
          required: false,
          allowMultiples: false,
          exclusiveOr: true,
          about: CONSOLE_COMMANDS.killProcess.args.entityId.about,
          validate: emptyArgumentValidator,
        },
        pid: {
          required: false,
          allowMultiples: false,
          exclusiveOr: true,
          about: CONSOLE_COMMANDS.killProcess.args.pid.about,
          validate: pidValidator,
        },
      },
      helpGroupLabel: HELP_GROUPS.responseActions.label,
      helpGroupPosition: HELP_GROUPS.responseActions.position,
      helpCommandPosition: 4,
      helpDisabled: doesEndpointSupportCommand('kill-process') === false,
      helpHidden: !getRbacControl({ commandName: 'kill-process', privileges: endpointPrivileges }),
    },
    {
      name: 'suspend-process',
      about: getCommandAboutInfo({
        aboutInfo: CONSOLE_COMMANDS.suspendProcess.about,
        isSupported: doesEndpointSupportCommand('suspend-process'),
      }),
      RenderComponent: SuspendProcessActionResult,
      meta: commandMeta,
      exampleUsage: 'suspend-process --pid 123 --comment "suspend this process"',
      exampleInstruction: ENTER_PID_OR_ENTITY_ID_INSTRUCTION,
      validate: capabilitiesAndPrivilegesValidator(agentType),
      mustHaveArgs: true,
      args: {
        ...commandCommentArgument(),
        entityId: {
          required: false,
          allowMultiples: false,
          exclusiveOr: true,
          about: CONSOLE_COMMANDS.suspendProcess.args.entityId.about,
          validate: emptyArgumentValidator,
        },
        pid: {
          required: false,
          allowMultiples: false,
          exclusiveOr: true,
          about: CONSOLE_COMMANDS.suspendProcess.args.pid.about,
          validate: pidValidator,
        },
      },
      helpGroupLabel: HELP_GROUPS.responseActions.label,
      helpGroupPosition: HELP_GROUPS.responseActions.position,
      helpCommandPosition: 5,
      helpDisabled: doesEndpointSupportCommand('suspend-process') === false,
      helpHidden: !getRbacControl({
        commandName: 'suspend-process',
        privileges: endpointPrivileges,
      }),
    },
    {
      name: 'status',
      about: CONSOLE_COMMANDS.status.about,
      RenderComponent: EndpointStatusActionResult,
      meta: commandMeta,
      helpGroupLabel: HELP_GROUPS.responseActions.label,
      helpGroupPosition: HELP_GROUPS.responseActions.position,
      helpCommandPosition: 2,
    },
    {
      name: 'processes',
      about: getCommandAboutInfo({
        aboutInfo: CONSOLE_COMMANDS.processes.about,
        isSupported: doesEndpointSupportCommand('processes'),
      }),
      RenderComponent: GetProcessesActionResult,
      meta: commandMeta,
      exampleUsage: 'processes --comment "get the processes"',
      exampleInstruction: ENTER_OR_ADD_COMMENT_ARG_INSTRUCTION,
      validate: capabilitiesAndPrivilegesValidator(agentType),
      args: {
        ...commandCommentArgument(),
      },
      helpGroupLabel: HELP_GROUPS.responseActions.label,
      helpGroupPosition: HELP_GROUPS.responseActions.position,
      helpCommandPosition: 3,
      helpDisabled: doesEndpointSupportCommand('processes') === false,
      helpHidden: !getRbacControl({ commandName: 'processes', privileges: endpointPrivileges }),
    },
    {
      name: 'get-file',
      about: getCommandAboutInfo({
        aboutInfo: CONSOLE_COMMANDS.getFile.about,
        isSupported: doesEndpointSupportCommand('get-file'),
      }),
      RenderComponent: GetFileActionResult,
      meta: commandMeta,
      exampleUsage: 'get-file --path "/full/path/to/file.txt" --comment "Possible malware"',
      exampleInstruction: ENTER_OR_ADD_COMMENT_ARG_INSTRUCTION,
      validate: capabilitiesAndPrivilegesValidator(agentType),
      mustHaveArgs: true,
      args: {
        path: {
          required: true,
          allowMultiples: false,
          about: CONSOLE_COMMANDS.getFile.args.path.about,
          validate: (argData) => {
            return emptyArgumentValidator(argData);
          },
        },
        ...commandCommentArgument(),
      },
      helpGroupLabel: HELP_GROUPS.responseActions.label,
      helpGroupPosition: HELP_GROUPS.responseActions.position,
      helpCommandPosition: 6,
      helpDisabled: !doesEndpointSupportCommand('get-file'),
      helpHidden: !getRbacControl({
        commandName: 'get-file',
        privileges: endpointPrivileges,
      }),
    },
    {
      name: 'execute',
      about: getCommandAboutInfo({
        aboutInfo: CONSOLE_COMMANDS.execute.about,
        isSupported: doesEndpointSupportCommand('execute'),
      }),
      RenderComponent: ExecuteActionResult,
      meta: commandMeta,
      exampleUsage: 'execute --command "ls -al" --timeout 2s --comment "Get list of all files"',
      exampleInstruction: ENTER_OR_ADD_COMMENT_ARG_INSTRUCTION,
      validate: capabilitiesAndPrivilegesValidator(agentType),
      mustHaveArgs: true,
      args: {
        command: {
          required: true,
          allowMultiples: false,
          about: getExecuteCommandArgAboutInfo(),
          mustHaveValue: 'non-empty-string',
        },
        timeout: {
          required: false,
          allowMultiples: false,
          about: CONSOLE_COMMANDS.execute.args.timeout.about,
          mustHaveValue: 'non-empty-string',
          validate: executeTimeoutValidator,
        },
        ...commandCommentArgument(),
      },
      helpGroupLabel: HELP_GROUPS.responseActions.label,
      helpGroupPosition: HELP_GROUPS.responseActions.position,
      helpCommandPosition: 6,
      helpDisabled: !doesEndpointSupportCommand('execute'),
      helpHidden: !getRbacControl({
        commandName: 'execute',
        privileges: endpointPrivileges,
      }),
    },

    {
      name: 'scan',
      about: getCommandAboutInfo({
        aboutInfo: CONSOLE_COMMANDS.scan.about,
        isSupported: doesEndpointSupportCommand('scan'),
      }),
      RenderComponent: ScanActionResult,
      meta: commandMeta,
      exampleUsage: 'scan --path "/full/path/to/folder" --comment "Scan folder for malware"',
      exampleInstruction: ENTER_OR_ADD_COMMENT_ARG_INSTRUCTION,
      validate: capabilitiesAndPrivilegesValidator(agentType),
      mustHaveArgs: true,
      args: {
        path: {
          required: true,
          allowMultiples: false,
          mustHaveValue: 'non-empty-string',
          about: CONSOLE_COMMANDS.scan.args.path.about,
        },
        ...commandCommentArgument(),
      },
      helpGroupLabel: HELP_GROUPS.responseActions.label,
      helpGroupPosition: HELP_GROUPS.responseActions.position,
      helpCommandPosition: 8,
      helpDisabled: !doesEndpointSupportCommand('scan'),
      helpHidden: !getRbacControl({
        commandName: 'scan',
        privileges: endpointPrivileges,
      }),
    },

    {
      name: 'runscript',
      about: getCommandAboutInfo({
        aboutInfo: CONSOLE_COMMANDS.runscript.about,
        isSupported: doesEndpointSupportCommand('runscript'),
      }),
      RenderComponent: RunScriptActionResult,
      meta: commandMeta,
      exampleInstruction: CONSOLE_COMMANDS.runscript.about,
      validate: capabilitiesAndPrivilegesValidator(agentType),
      mustHaveArgs: false,
      helpGroupLabel: HELP_GROUPS.responseActions.label,
      helpGroupPosition: HELP_GROUPS.responseActions.position,
      helpCommandPosition: 9,
      helpDisabled: !isActionSupportedByAgentType(agentType, 'runscript', 'manual'),
      helpHidden: !getRbacControl({ commandName: 'runscript', privileges: endpointPrivileges }),
    },
  ];

  // Adjust `runscript` for use with Endpoint
  if (agentType === 'endpoint' && !responseActionsEndpointRunScript) {
    consoleCommands = consoleCommands.filter((command) => command.name !== 'runscript');
  } else if (agentType === 'endpoint') {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const runscriptCommand = consoleCommands.find((command) => command.name === 'runscript')!;

    runscriptCommand.helpDisabled = !doesEndpointSupportCommand('runscript');
    runscriptCommand.mustHaveArgs = true;
    runscriptCommand.exampleUsage = (
      enteredCommand?: Command<
        CommandDefinition,
        EndpointRunScriptActionParameters,
        { script: CustomScriptSelectorState<EndpointScript> }
      >
    ) => {
      let exampleUsageText = `runscript --script="copy.sh" --inputParams="~/logs/log.txt /tmp/log.backup.txt"`;

      if (enteredCommand) {
        const scriptArgState = enteredCommand?.argState?.script?.at(0);
        const selectedScript = scriptArgState?.store?.selectedOption;

        if (selectedScript?.meta?.example) {
          exampleUsageText = i18n.translate(
            'xpack.securitySolution.consoleCommandsDefinition.runscript.endpoint.scriptInputExample',
            {
              defaultMessage: '{scriptName} script input: {example}',
              values: {
                scriptName: scriptArgState?.valueText,
                example: selectedScript?.meta?.example,
              },
            }
          );
        }
      }

      return exampleUsageText;
    };
    runscriptCommand.args = {
      script: {
        required: true,
        allowMultiples: false,
        about: i18n.translate(
          'xpack.securitySolution.consoleCommandsDefinition.runscript.endpoint.scriptArg',
          { defaultMessage: 'The script to run (selected from popup list)' }
        ),
        mustHaveValue: 'non-empty-string',
        SelectorComponent: CustomScriptSelector,
      },
      inputParams: {
        required: false,
        allowMultiples: false,
        about: i18n.translate(
          'xpack.securitySolution.consoleCommandsDefinition.runscript.endpoint.inputParamsArg',
          { defaultMessage: 'Input arguments for the selected script' }
        ),
        mustHaveValue: 'non-empty-string',
        SelectorComponent: EndpointScriptInputParams,
      },
      timeout: {
        required: false,
        allowMultiples: false,
        about: ENDPOINT_EXECUTION_TIMEOUT,
        mustHaveValue: 'non-empty-string',
        validate: executeTimeoutValidator,
      },
      ...commandCommentArgument(),
    };

    const priorValidateFn = runscriptCommand.validate;

    runscriptCommand.validate = (
      enteredCommand: Command<CommandDefinition, SentinelOneRunScriptActionParameters>
    ) => {
      // First do the base validation - like authz checks
      const baseValidation = priorValidateFn ? priorValidateFn(enteredCommand) : true;

      if (baseValidation !== true) {
        return baseValidation;
      }

      const { argState, args } = enteredCommand;

      // No need to validate display of command help `help`
      if (args.hasArg('help')) {
        return true;
      }

      // Validate the script that was selected
      const scriptInfo = (argState?.script?.[0]?.store as CustomScriptSelectorState<EndpointScript>)
        ?.selectedOption;
      const script = args.args.script[0];
      const inputParams = args.args?.inputParams?.[0];

      if (!script) {
        return i18n.translate(
          'xpack.securitySolution.consoleCommandsDefinition.runscript.endpoint.scriptArgValueMissing',
          { defaultMessage: 'A script selection is required' }
        );
      }

      if (scriptInfo?.meta?.requiresInput && !inputParams) {
        return i18n.translate(
          'xpack.securitySolution.consoleCommandsDefinition.runscript.endpoint.scriptInputParamsMissing',
          {
            defaultMessage:
              'Script "{name}" requires input parameters to be entered{instructions, select, false {.} other {: {instructions}}}',
            values: {
              name: scriptInfo.name,
              instructions:
                (scriptInfo.meta.instructions || scriptInfo.meta.example || '').trim() || false,
            },
          }
        );
      }

      return true;
    };
  }

  // `upload` command
  consoleCommands.push({
    name: 'upload',
    about: getCommandAboutInfo({
      aboutInfo: CONSOLE_COMMANDS.upload.about,
      isSupported: doesEndpointSupportCommand('upload'),
    }),
    RenderComponent: UploadActionResult,
    meta: commandMeta,
    exampleUsage: 'upload --file --overwrite --comment "script to fix registry"',
    exampleInstruction: ENTER_OR_ADD_COMMENT_ARG_INSTRUCTION,
    validate: capabilitiesAndPrivilegesValidator(agentType),
    mustHaveArgs: true,
    args: {
      file: {
        required: true,
        allowMultiples: false,
        about: CONSOLE_COMMANDS.upload.args.file.about,
        mustHaveValue: 'truthy',
        SelectorComponent: ArgumentFileSelector,
      },
      overwrite: {
        required: false,
        allowMultiples: false,
        about: CONSOLE_COMMANDS.upload.args.overwrite.about,
        mustHaveValue: false,
      },
      comment: {
        required: false,
        allowMultiples: false,
        mustHaveValue: 'non-empty-string',
        about: COMMENT_ARG_ABOUT,
      },
    },
    helpGroupLabel: HELP_GROUPS.responseActions.label,
    helpGroupPosition: HELP_GROUPS.responseActions.position,
    helpCommandPosition: 7,
    helpDisabled: !doesEndpointSupportCommand('upload'),
    helpHidden: !getRbacControl({
      commandName: 'upload',
      privileges: endpointPrivileges,
    }),
  });

  if (microsoftDefenderEndpointCancelEnabled || responseActionsEndpointCancel) {
    const isSupported = canCancelForCurrentContext();

    consoleCommands.push({
      name: 'cancel',
      about: getCommandAboutInfo({
        aboutInfo: CONSOLE_COMMANDS.cancel.about,
        isSupported: isSupported && doesEndpointSupportCommand('cancel'),
      }),
      RenderComponent: CancelActionResult,
      meta: commandMeta,
      exampleUsage: 'cancel --action="action-123-456-789"',
      exampleInstruction: i18n.translate(
        'xpack.securitySolution.endpointConsoleCommands.cancel.exampleInstruction',
        { defaultMessage: 'Select a pending action to cancel' }
      ),
      mustHaveArgs: true,
      args: {
        action: {
          required: true,
          allowMultiples: false,
          about: i18n.translate(
            'xpack.securitySolution.endpointConsoleCommands.cancel.action.about',
            {
              defaultMessage:
                'The response action to cancel (selected from a popup that displays the list of pending actions for this host that can be canceled).',
            }
          ),
          mustHaveValue: 'truthy',
          SelectorComponent: CancelablePendingActionsSelector,
        },
        ...(agentType === 'endpoint'
          ? {
              force: {
                required: false,
                allowMultiples: false,
                about: CONSOLE_COMMANDS.cancel.forceArgInfo,
                mustHaveValue: false,
              },
            }
          : {}),
        ...commandCommentArgument(),
      },
      helpGroupLabel: HELP_GROUPS.responseActions.label,
      helpGroupPosition: HELP_GROUPS.responseActions.position,
      helpCommandPosition: 10,
      helpDisabled: !isSupported || !doesEndpointSupportCommand('cancel'),
      helpHidden: !isSupported,
      validate: capabilitiesAndPrivilegesValidator(agentType),
    });
  }

  if (responseActionsEndpointMemoryDump) {
    const endpointSupportsKernelDump = (endpointCapabilities as EndpointCapabilities[]).includes(
      'memdump_kernel'
    );
    const endpointSupportsProcessDump = (endpointCapabilities as EndpointCapabilities[]).includes(
      'memdump_process'
    );
    const getMemoryDumpTypeNotSupportedMessage = (type: 'process' | 'kernel') =>
      i18n.translate(
        'xpack.securitySolution.consoleCommandsDefinition.memoryDump.kernelTypeNotSupported',
        {
          defaultMessage:
            '"{type}" memory dump type is not currently supported for this host OS type ({osType})',
          values: { osType: platform, type },
        }
      );

    consoleCommands.push({
      name: 'memory-dump',
      about: getCommandAboutInfo({
        aboutInfo: CONSOLE_COMMANDS.memoryDump.about,
        isSupported: doesEndpointSupportCommand('memory-dump'),
      }),
      RenderComponent: MemoryDumpActionResult,
      meta: commandMeta,
      exampleUsage: 'memory-dump --process --pid=123 --comment="dump process 123"',
      exampleInstruction: ENTER_OR_ADD_COMMENT_ARG_INSTRUCTION,
      validate: (enteredCommand) => {
        const standardValidation = capabilitiesAndPrivilegesValidator(agentType)(enteredCommand);

        if (standardValidation !== true) {
          return standardValidation;
        }

        const argsInterface = enteredCommand.args;

        // Nothing to do if all the user did was `--help`
        if (argsInterface.hasArg('help')) {
          return true;
        }

        const memoryDumpType = argsInterface.hasArg('kernel') ? 'kernel' : 'process';

        // PID and Entity ID are only supported for process memory dumps
        if (
          memoryDumpType === 'kernel' &&
          (argsInterface.hasArg('pid') || argsInterface.hasArg('entityId'))
        ) {
          return i18n.translate(
            'xpack.securitySolution.consoleCommandsDefinition.memoryDump.pidAndEntityIdNotSupportedForKernel',
            {
              defaultMessage:
                '"pid" and "entityId" arguments are not supported for "kernel" memory dumps',
            }
          );
        }

        // Process memory dump requires either pid or entityId
        if (
          memoryDumpType === 'process' &&
          !argsInterface.hasArg('pid') &&
          !argsInterface.hasArg('entityId')
        ) {
          return i18n.translate(
            'xpack.securitySolution.consoleCommandsDefinition.memoryDump.pidAndEntityIdRequiredForProcess',
            {
              defaultMessage: '"pid" or "entityId argument is required for "process" memory dumps',
            }
          );
        }

        return true;
      },
      mustHaveArgs: true,
      args: {
        process: {
          about:
            CONSOLE_COMMANDS.memoryDump.processArgAbout +
            (endpointSupportsProcessDump ? '' : ` ${CONSOLE_COMMANDS.memoryDump.argNotSupported}`),
          required: false,
          allowMultiples: false,
          mustHaveValue: false,
          exclusiveOr: true,
          validate: () => {
            if (!endpointSupportsProcessDump) {
              return getMemoryDumpTypeNotSupportedMessage('process');
            }

            return true;
          },
        },
        kernel: {
          about:
            CONSOLE_COMMANDS.memoryDump.kernelArgAbout +
            (endpointSupportsKernelDump ? '' : ` ${CONSOLE_COMMANDS.memoryDump.argNotSupported}`),
          required: false,
          allowMultiples: false,
          mustHaveValue: false,
          exclusiveOr: true,
          validate: () => {
            if (!endpointSupportsKernelDump) {
              return getMemoryDumpTypeNotSupportedMessage('kernel');
            }

            return true;
          },
        },
        entityId: {
          required: false,
          allowMultiples: false,
          mustHaveValue: 'non-empty-string',
          about: CONSOLE_COMMANDS.memoryDump.entityIdArgAbout,
        },
        pid: {
          required: false,
          allowMultiples: false,
          mustHaveValue: 'number-greater-than-zero',
          about: CONSOLE_COMMANDS.memoryDump.pidArgAbout,
        },
        ...commandCommentArgument(),
      },
      helpGroupLabel: HELP_GROUPS.responseActions.label,
      helpGroupPosition: HELP_GROUPS.responseActions.position,
      helpCommandPosition: 6,
      helpDisabled: !doesEndpointSupportCommand('memory-dump'),
      helpHidden: !getRbacControl({ commandName: 'execute', privileges: endpointPrivileges }),
      helpUsage: getMemoryDumpHelpUsage(),
    });
  }

  switch (agentType) {
    case 'sentinel_one':
      return adjustCommandsForSentinelOne({ commandList: consoleCommands, platform });
    case 'crowdstrike':
      return adjustCommandsForCrowdstrike({
        commandList: consoleCommands,
        crowdstrikeRunScriptEnabled,
      });
    case 'microsoft_defender_endpoint':
      return adjustCommandsForMicrosoftDefenderEndpoint({
        commandList: consoleCommands,
        microsoftDefenderEndpointRunScriptEnabled,
      });
    default:
      // agentType === endpoint: just returns the defined command list
      return consoleCommands;
  }
};

/** @internal */
const disableCommand = (command: CommandDefinition, agentType: ResponseActionAgentType) => {
  command.helpDisabled = true;
  command.helpHidden = true;
  command.validate = () =>
    UPGRADE_AGENT_FOR_RESPONDER(agentType, command.name as ConsoleResponseActionCommands);
};

/** @internal */
const adjustCommandsForSentinelOne = ({
  commandList,
  platform,
}: {
  commandList: CommandDefinition[];
  platform: string;
}): CommandDefinition[] => {
  const featureFlags = ExperimentalFeaturesService.get();
  const isRunscriptEnabled = featureFlags.responseActionsSentinelOneRunScriptEnabled;

  return commandList.map((command) => {
    // Kill-Process: adjust command to accept only `processName`
    if (command.name === 'kill-process') {
      command.args = {
        ...commandCommentArgument(),
        processName: {
          required: true,
          allowMultiples: false,
          about: CONSOLE_COMMANDS.killProcess.args.processName.about,
          mustHaveValue: 'non-empty-string',
        },
      };
      command.exampleUsage = 'kill-process --processName="notepad" --comment="kill malware"';
      command.exampleInstruction = i18n.translate(
        'xpack.securitySolution.consoleCommandsDefinition.killProcess.sentinelOne.instructions',
        { defaultMessage: 'Enter a process name to execute' }
      );
    }

    if (
      command.name === 'status' ||
      !isAgentTypeAndActionSupported(
        'sentinel_one',
        RESPONSE_CONSOLE_COMMAND_TO_API_COMMAND_MAP[command.name as ConsoleResponseActionCommands],
        'manual'
      )
    ) {
      disableCommand(command, 'sentinel_one');
    } else {
      // processes is not currently supported for Windows hosts
      if (command.name === 'processes' && platform.toLowerCase() === 'windows') {
        const message = i18n.translate(
          'xpack.securitySolution.consoleCommandsDefinition.sentineloneProcessesWindowRestriction',
          {
            defaultMessage:
              'Processes command is not currently supported for SentinelOne hosts running on Windows',
          }
        );

        command.helpDisabled = true;
        command.about = getCommandAboutInfo({
          aboutInfo: command.about,
          isSupported: false,
          dataTestSubj: 'sentineloneProcessesWindowsWarningTooltip',
          tooltipContent: message,
        });
        command.validate = () => {
          return message;
        };
      } else if (command.name === 'runscript' && isRunscriptEnabled) {
        command.helpDisabled = false;
        command.mustHaveArgs = true;
        command.exampleUsage = (
          enteredCommand?: Command<
            CommandDefinition,
            SentinelOneRunScriptActionParameters,
            { script: CustomScriptSelectorState<SentinelOneScript> }
          >
        ) => {
          let exampleUsageText = `runscript --script="copy.sh" --inputParams="~/logs/log.txt /tmp/log.backup.txt"`;

          if (enteredCommand) {
            const scriptArgState = enteredCommand?.argState?.script?.at(0);
            const selectedScript = scriptArgState?.store?.selectedOption;

            if (selectedScript?.meta?.inputExample) {
              exampleUsageText = i18n.translate(
                'xpack.securitySolution.consoleCommandsDefinition.runscript.sentinelOne.scriptInputExample',
                {
                  defaultMessage: '{scriptName} script input: {example}',
                  values: {
                    scriptName: scriptArgState?.valueText,
                    example: selectedScript?.meta?.inputExample,
                  },
                }
              );
            }
          }

          return exampleUsageText;
        };
        command.args = {
          script: {
            required: true,
            allowMultiples: false,
            about: i18n.translate(
              'xpack.securitySolution.consoleCommandsDefinition.runscript.sentinelOne.scriptArg',
              { defaultMessage: 'The script to run (selected from popup list)' }
            ),
            mustHaveValue: 'non-empty-string',
            SelectorComponent: CustomScriptSelector,
          },
          inputParams: {
            required: false,
            allowMultiples: false,
            about: i18n.translate(
              'xpack.securitySolution.consoleCommandsDefinition.runscript.sentinelOne.inputParamsArg',
              { defaultMessage: 'Input arguments for the selected script' }
            ),
            mustHaveValue: 'non-empty-string',
            SelectorComponent: SentinelOneScriptInputParams,
          },
          ...commandCommentArgument(),
        };

        const priorValidateFn = command.validate;

        command.validate = (
          enteredCommand: Command<CommandDefinition, SentinelOneRunScriptActionParameters>
        ) => {
          // First do the base validation - like authz checks
          const baseValidation = priorValidateFn ? priorValidateFn(enteredCommand) : true;

          if (baseValidation !== true) {
            return baseValidation;
          }

          const { argState, args } = enteredCommand;

          // No need to validate display of command help `help`
          if (args.hasArg('help')) {
            return true;
          }

          // Validate the script that was selected
          const scriptInfo = (
            argState?.script?.[0]?.store as CustomScriptSelectorState<SentinelOneScript>
          )?.selectedOption;
          const script = args.args.script[0];
          const inputParams = args.args?.inputParams?.[0];

          if (!script) {
            return i18n.translate(
              'xpack.securitySolution.consoleCommandsDefinition.runscript.sentinelOne.scriptArgValueMissing',
              { defaultMessage: 'A script selection is required' }
            );
          }

          if (scriptInfo?.meta?.inputRequired && !inputParams) {
            return i18n.translate(
              'xpack.securitySolution.consoleCommandsDefinition.runscript.sentinelOne.scriptInputParamsMissing',
              {
                defaultMessage:
                  'Script "{name}" requires input parameters to be entered{instructions, select, false {.} other {: {instructions}}}',
                values: {
                  name: scriptInfo.name,
                  instructions:
                    (
                      scriptInfo.meta.inputInstructions ||
                      scriptInfo.meta.inputExample ||
                      ''
                    ).trim() || false,
                },
              }
            );
          }

          return true;
        };
      }
    }

    return command;
  });
};

/** @internal */
const adjustCommandsForCrowdstrike = ({
  commandList,
  crowdstrikeRunScriptEnabled,
}: {
  commandList: CommandDefinition[];
  crowdstrikeRunScriptEnabled: boolean;
}): CommandDefinition[] => {
  return commandList.map((command) => {
    if (
      command.name === 'status' ||
      !isAgentTypeAndActionSupported(
        'crowdstrike',
        RESPONSE_CONSOLE_COMMAND_TO_API_COMMAND_MAP[command.name as ConsoleResponseActionCommands],
        'manual'
      )
    ) {
      disableCommand(command, 'crowdstrike');
    }
    if (command.name === 'runscript') {
      if (!crowdstrikeRunScriptEnabled) {
        disableCommand(command, 'crowdstrike');
      } else {
        return {
          ...command,
          exampleUsage: `runscript --Raw=\`\`\`Get-ChildItem .\`\`\` --CommandLine=""`,
          helpExample: CROWDSTRIKE_CONSOLE_COMMANDS.runscript.helpExample,
          mustHaveArgs: true,
          args: {
            Raw: {
              required: false,
              allowMultiples: false,
              about: CROWDSTRIKE_CONSOLE_COMMANDS.runscript.args.raw.about,
              mustHaveValue: 'non-empty-string',
              exclusiveOr: true,
            },
            CloudFile: {
              required: false,
              allowMultiples: false,
              about: CROWDSTRIKE_CONSOLE_COMMANDS.runscript.args.cloudFile.about,
              mustHaveValue: 'truthy',
              exclusiveOr: true,
              SelectorComponent: CustomScriptSelector,
            },
            CommandLine: {
              required: false,
              allowMultiples: false,
              about: CROWDSTRIKE_CONSOLE_COMMANDS.runscript.args.commandLine.about,
              mustHaveValue: 'non-empty-string',
              SelectorComponent: CrowdstrikeScriptInputParams,
            },
            HostPath: {
              required: false,
              allowMultiples: false,
              about: CROWDSTRIKE_CONSOLE_COMMANDS.runscript.args.hostPath.about,
              mustHaveValue: 'non-empty-string',
              exclusiveOr: true,
            },
            Timeout: {
              required: false,
              allowMultiples: false,
              about: CROWDSTRIKE_CONSOLE_COMMANDS.runscript.args.timeout.about,
              mustHaveValue: 'number-greater-than-zero',
            },
            ...commandCommentArgument(),
          },
        };
      }
    }

    return command;
  });
};

const adjustCommandsForMicrosoftDefenderEndpoint = ({
  commandList,
  microsoftDefenderEndpointRunScriptEnabled,
}: {
  commandList: CommandDefinition[];
  microsoftDefenderEndpointRunScriptEnabled: boolean;
}): CommandDefinition[] => {
  const featureFlags = ExperimentalFeaturesService.get();
  const microsoftDefenderEndpointCancelEnabled =
    featureFlags.microsoftDefenderEndpointCancelEnabled;

  return commandList.map((command) => {
    if (
      command.name === 'status' ||
      !isAgentTypeAndActionSupported(
        'microsoft_defender_endpoint',
        RESPONSE_CONSOLE_COMMAND_TO_API_COMMAND_MAP[command.name as ConsoleResponseActionCommands],
        'manual'
      )
    ) {
      disableCommand(command, 'microsoft_defender_endpoint');
    }

    if (command.name === 'cancel' && !microsoftDefenderEndpointCancelEnabled) {
      disableCommand(command, 'microsoft_defender_endpoint');
    }
    if (command.name === 'runscript') {
      if (!microsoftDefenderEndpointRunScriptEnabled) {
        disableCommand(command, 'microsoft_defender_endpoint');
      } else {
        return {
          ...command,
          exampleUsage: `runscript --ScriptName='test.ps1'`,
          mustHaveArgs: true,
          args: {
            ScriptName: {
              required: true,
              allowMultiples: false,
              about: MS_DEFENDER_ENDPOINT_CONSOLE_COMMANDS.runscript.args.scriptName.about,
              mustHaveValue: 'truthy',
              SelectorComponent: CustomScriptSelector,
            },
            Args: {
              required: false,
              allowMultiples: false,
              about: MS_DEFENDER_ENDPOINT_CONSOLE_COMMANDS.runscript.args.args.about,
              mustHaveValue: 'non-empty-string',
              SelectorComponent: MicrosoftScriptInputParams,
            },
            ...commandCommentArgument(),
          },
        };
      }
    }

    return command;
  });
};
