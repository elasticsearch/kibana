/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { LicenseType } from '@kbn/licensing-types';
import type { ESQLFieldWithMetadata } from '@kbn/esql-types';
import type { ESQLCommand, ESQLAstAllCommands } from '@elastic/esql/types';
import type {
  ISuggestionItem,
  ICommandCallbacks,
  ICommandContext,
  ESQLColumnData,
  ESQLCommandSummary,
  UnmappedFieldsStrategy,
} from './types';
import type { ESQLMessage } from '../definitions/types';

/**
 * Interface defining the methods that each ES|QL command should register.
 * These methods provide functionality specific to the command's behavior.
 *
 * @template TContext The type of any additional context required by the methods.
 */
export interface ICommandMethods<TContext = ICommandContext> {
  /**
   * Validates the given query string or AST snippet for the specific command.
   * @param command The parsed Abstract Syntax Tree for deeper semantic validation.
   * @param ast The full Abstract Syntax Tree of the ESQL query.
   * @param context Additional context needed for validation (e.g., available fields).
   * @returns Return an array of validation errors/warnings.
   */
  validate?: (
    command: ESQLAstAllCommands,
    ast: ESQLCommand[],
    context?: TContext,
    callbacks?: ICommandCallbacks
  ) => ESQLMessage[];

  /**
   * Provides suggestions for autocompletion based on the current query context
   * and the command's syntax.
   * @param query The ESQL query string.
   * @param command The parsed Abstract Syntax Tree.
   * @param cursorPosition The current cursor position in the query string.
   * @param context Additional context for suggestions (e.g., available functions, field types).
   * @param callbacks Optional callbacks for handling specific events during autocompletion.
   * @returns An array of suggested completion items.
   */
  autocomplete: (
    query: string,
    command: ESQLAstAllCommands,
    callbacks?: ICommandCallbacks,
    context?: TContext,
    cursorPosition?: number
  ) => Promise<ISuggestionItem[]>;

  /**
   * Determines the columns available or expected after this command in a query pipeline.
   * This is crucial for chaining commands and ensuring type compatibility.
   * @param command The parsed Abstract Syntax Tree.
   * @param previousColumns An array of columns inherited from the preceding command.
   * @param query The ESQL query string.
   * @param context Additional context (e.g., schema information).
   * @returns An array of column names or more detailed column definitions.
   */
  columnsAfter?: (
    command: ESQLCommand,
    previousColumns: ESQLColumnData[],
    query: string,
    newFields: IAdditionalFields,
    unmappedFieldsStrategy: UnmappedFieldsStrategy
  ) => Promise<ESQLColumnData[]> | ESQLColumnData[];

  /**
   * Returns useful information about the command.
   * @param command The parsed Abstract Syntax Tree.
   * @param query The ESQL query string.
   * @returns A summary object containing details about the command.
   */
  summary?: (command: ESQLCommand, query: string) => ESQLCommandSummary;
}

export interface ICommandMetadata {
  preview?: boolean; // Optional property to indicate if the command is in preview mode
  description: string; // Optional property for a brief description of the command
  declaration: string; // The pattern for declaring this command statement. Displayed in the autocomplete.
  examples: string[]; // A list of examples of how to use the command. Displayed in the autocomplete.
  hidden?: boolean; // Optional property to indicate if the command should be hidden in UI
  types?: Array<{ name: string; description: string }>; // Optional property for command-specific types
  license?: LicenseType; // Optional property indicating the license for the command's availability
  observabilityTier?: string; // Optional property indicating the observability tier availability
  type?: 'source' | 'header' | 'processing'; // Optional property to classify the command type
  isTimeseries?: boolean; // Optional property to indicate if the command is a timeseries source command
  requiresTimeseriesSource?: boolean; // Optional property to indicate the command is only available when the source command is TS
  hiddenAfterCommands?: string[]; // Optional list of command names; this command is not suggested when any of them appear anywhere in the pipeline
  subquerySupport?: boolean; // Temporary property to indicate if the command supports subquery suggestions.
  subquerySource?: boolean; // Optional property to indicate if the command can start a subquery expression.
  subqueryRestrictions?: {
    hideInside: boolean; // Command is hidden inside subqueries
    hideOutside: boolean; // Command is hidden outside subqueries (at root level)
  };
}

/**
 * Interface defining the structure of a single registered command.
 */
export interface ICommand {
  name: string;
  methods: ICommandMethods;
  metadata: ICommandMetadata;
}

/**
 * Interface for the ESQL Command Registry, defining its public API.
 */
export interface ICommandRegistry {
  /**
   * Registers a new command with its associated methods.
   * @param command The ICommand object to register.
   */
  registerCommand(command: ICommand): void;

  /**
   * Retrieves the methods associated with a given command name.
   * @param commandName The name of the command to retrieve.
   * @returns The ICommandMethods object for the command, or undefined if not found.
   */
  getCommandMethods(commandName: string): ICommandMethods | undefined;

  /**
   * Retrieves all registered command names.
   * @returns An array of strings representing the names of all registered commands.
   */
  getAllCommandNames(): string[];

  /**
   * Retrieves the names of source commands (commands that can start a query).
   * @returns An array of source command names.
   */
  getSourceCommandNames(): string[];

  /**
   * Retrieves the names of processing commands (commands that transform data).
   * @returns An array of processing command names.
   */
  getProcessingCommandNames(): string[];

  /**
   * Retrieves the names of timeseries source commands.
   * @returns An array of timeseries command names.
   */
  getTimeseriesCommandNames(): string[];

  /**
   * Retrieves a command by its name, including its methods and optional metadata.
   * @param commandName The name of the command to retrieve.
   * @returns The ICommand object if found, otherwise undefined.
   */
  getCommandByName(commandName: string): ICommand | undefined;
}

export interface IAdditionalFields {
  fromJoin: (cmd: ESQLCommand) => Promise<ESQLFieldWithMetadata[]>;
  fromEnrich: (cmd: ESQLCommand) => Promise<ESQLFieldWithMetadata[]>;
  fromFrom: (cmd: ESQLCommand) => Promise<ESQLFieldWithMetadata[]>;
  fromPromql?: (cmd: ESQLCommand) => Promise<ESQLFieldWithMetadata[]>;
}

/**
 * Implementation of the ESQL Command Registry.
 * This class manages the registration, storage, and retrieval of ESQL command methods.
 */
export class CommandRegistry implements ICommandRegistry {
  private commands: Map<
    string,
    {
      methods: ICommandMethods;
      metadata: ICommandMetadata; // Optional metadata for the command
    }
  > = new Map();

  private sourceCommandNames: string[] = [];
  private processingCommandNames: string[] = [];
  private timeseriesCommandNames: string[] = [];

  constructor() {
    this.commands = new Map<
      string,
      {
        methods: ICommandMethods;
        metadata: ICommandMetadata; // Optional metadata for the command
      }
    >();
  }

  /**
   * Registers a new command and its methods into the registry.
   * @param command The command object containing its name and methods.
   */
  public registerCommand(command: ICommand): void {
    if (!this.commands.has(command.name)) {
      this.commands.set(command.name, {
        methods: command.methods,
        metadata: command.metadata,
      });

      if (command.metadata.type === 'source') {
        this.sourceCommandNames.push(command.name);
      } else if (!command.metadata.type) {
        this.processingCommandNames.push(command.name);
      }

      if (command.metadata.isTimeseries) {
        this.timeseriesCommandNames.push(command.name);
      }
    }
  }

  /**
   * Retrieves the methods associated with a specific command name.
   * @param commandName The name of the command to look up.
   * @returns The ICommandMethods object if the command is found, otherwise undefined.
   */
  public getCommandMethods(commandName: string): ICommandMethods | undefined {
    return this.commands.get(commandName)?.methods;
  }

  /**
   * Returns a list of all command names currently registered in the registry.
   * @returns An array of command names.
   */
  public getAllCommandNames(): string[] {
    return Array.from(this.commands.keys());
  }

  /**
   * Retrieves the names of source commands (commands that can start a query).
   * @returns An array of source command names.
   */
  public getSourceCommandNames(): string[] {
    return this.sourceCommandNames;
  }

  /**
   * Retrieves the names of processing commands (commands that transform data).
   * @returns An array of processing command names.
   */
  public getProcessingCommandNames(): string[] {
    return this.processingCommandNames;
  }

  /**
   * Retrieves the names of timeseries source commands.
   * @returns An array of timeseries command names.
   */
  public getTimeseriesCommandNames(): string[] {
    return this.timeseriesCommandNames;
  }

  /**
   * Retrieves all registered commands, including their methods and metadata.
   * Filters commands based on subquery context and restrictions.
   * @returns An array of ICommand objects representing all registered commands.
   */
  public getAllCommands(options?: {
    isCursorInSubquery?: boolean;
    isStartingSubquery?: boolean;
    queryContainsSubqueries?: boolean;
  }): ICommand[] {
    const allCommands = Array.from(this.commands.entries(), ([name, { methods, metadata }]) => ({
      name,
      methods,
      metadata,
    }));

    const isCursorInSubquery = options?.isCursorInSubquery ?? false;
    const isStartingSubquery = options?.isStartingSubquery ?? false;
    const queryContainsSubqueries = options?.queryContainsSubqueries ?? false;

    const filtered = isStartingSubquery
      ? allCommands.filter(({ metadata }) => !!metadata.subquerySource)
      : allCommands;

    // Then apply subquery restrictions
    return filtered.filter(({ metadata: { subqueryRestrictions: restrictions } }) => {
      if (!restrictions || !queryContainsSubqueries) {
        return true;
      }

      return isCursorInSubquery ? !restrictions.hideInside : !restrictions.hideOutside;
    });
  }

  /**
   * Retrieves a command by its name, including its methods and optional metadata.
   * @param commandName The name of the command to retrieve.
   * @returns The ICommand object if found, otherwise undefined.
   */
  public getCommandByName(commandName: string): ICommand | undefined {
    const command = this.commands.get(commandName);
    return command
      ? {
          name: commandName,
          methods: command.methods,
          metadata: command.metadata,
        }
      : undefined;
  }
}
