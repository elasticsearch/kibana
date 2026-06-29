/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFile } from 'fs';

import { promisify } from 'util';
import path from 'path';

import { merge } from '@kbn/std';
import { parse } from 'yaml';
import { pick } from 'lodash';
import semverMajor from 'semver/functions/major';
import semverPrerelease from 'semver/functions/prerelease';

import { appContextService } from '../..';

import type {
  ArchivePackage,
  RegistryPolicyTemplate,
  RegistryDataStream,
  RegistryInput,
  RegistryStream,
  RegistryVarsEntry,
  PackageSpecManifest,
  RegistryDataStreamRoutingRules,
  RegistryDataStreamLifecycle,
  PackageSpecTags,
} from '../../../../common/types';
import {
  RegistryInputKeys,
  RegistryVarsEntryKeys,
  RegistryPolicyTemplateKeys,
  RegistryStreamKeys,
  RegistryDataStreamKeys,
} from '../../../../common/types';
import { PackageInvalidArchiveError } from '../../../errors';
import { getErrorMessage } from '../../../errors/utils';
import { pkgToPkgKey } from '../registry';

import { traverseArchiveEntries } from '.';

const readFileAsync = promisify(readFile);
export const MANIFEST_NAME = 'manifest.yml';
export const DATASTREAM_MANIFEST_NAME = 'manifest.yml';
export const DATASTREAM_ROUTING_RULES_NAME = 'routing_rules.yml';
export const DATASTREAM_LIFECYCLE_NAME = 'lifecycle.yml';

export const KIBANA_FOLDER_NAME = 'kibana';
export const TAGS_NAME = 'tags.yml';

const DEFAULT_RELEASE_VALUE = 'ga';

// Ingest pipelines are specified in a `data_stream/<name>/elasticsearch/ingest_pipeline/` directory where a `default`
// ingest pipeline should be specified by one of these filenames.
const DEFAULT_INGEST_PIPELINE_VALUE = 'default';
const DEFAULT_INGEST_PIPELINE_FILE_NAME_YML = 'default.yml';
const DEFAULT_INGEST_PIPELINE_FILE_NAME_JSON = 'default.json';

// Borrowed from https://github.com/elastic/kibana/blob/main/x-pack/solutions/security/plugins/security_solution/common/utils/expand_dotted.ts
// with some alterations around non-object values. The package registry service expands some dotted fields from manifest files,
// so we need to do the same here.
const expandDottedField = (dottedFieldName: string, val: unknown): object => {
  const parts = dottedFieldName.split('.');

  if (parts.length === 1) {
    return { [parts[0]]: val };
  } else {
    return { [parts[0]]: expandDottedField(parts.slice(1).join('.'), val) };
  }
};

export const expandDottedObject = (dottedObj: object = {}) => {
  if (typeof dottedObj !== 'object' || Array.isArray(dottedObj)) {
    return dottedObj;
  }
  return Object.entries(dottedObj).reduce(
    (acc, [key, val]) => merge(acc, expandDottedField(key, val)),
    {} as Record<string, any>
  );
};

export const expandDottedEntries = (obj: object) => {
  return Object.entries<any>(obj).reduce<any>((acc, [key, value]) => {
    acc[key] = expandDottedObject(value);

    return acc;
  }, {} as Record<string, any>);
};

type AssetsBufferMap = Record<string, Buffer>;

// not sure these are 100% correct but they do the job here
// keeping them local until others need them
type OptionalPropertyOf<T extends object> = Exclude<
  {
    [K in keyof T]: T extends Record<K, T[K]> ? never : K;
  }[keyof T],
  undefined
>;
type RequiredPropertyOf<T extends object> = Exclude<keyof T, OptionalPropertyOf<T>>;

type RequiredPackageProp = RequiredPropertyOf<ArchivePackage>;
type OptionalPackageProp = OptionalPropertyOf<ArchivePackage>;
// pro: guarantee only supplying known values. these keys must be in ArchivePackage. no typos or new values
// pro: any values added to these lists will be passed through by default
// pro & con: values do need to be shadowed / repeated from ArchivePackage, but perhaps we want to limit values
const requiredArchivePackageProps: readonly RequiredPackageProp[] = [
  'name',
  'version',
  'title',
  'owner',
] as const;

const optionalArchivePackageProps: readonly OptionalPackageProp[] = [
  'readme',
  'assets',
  'data_streams',
  'license',
  'requires',
  'type',
  'categories',
  'conditions',
  'screenshots',
  'icons',
  'policy_templates',
  'policy_templates_behavior',
  'release',
  'agent',
  'elasticsearch',
  'description',
  'format_version',
  'discovery',
  'var_groups',
  'deprecated',
  'provider_permissions',
] as const;

const registryInputProps = Object.values(RegistryInputKeys);
const registryVarsProps = Object.values(RegistryVarsEntryKeys);
const registryPolicyTemplateProps = Object.values(RegistryPolicyTemplateKeys);
const registryStreamProps = Object.values(RegistryStreamKeys);
const registryDataStreamProps = Object.values(RegistryDataStreamKeys);

const PARSE_AND_VERIFY_ASSETS_NAME = [
  MANIFEST_NAME,
  DATASTREAM_ROUTING_RULES_NAME,
  DATASTREAM_LIFECYCLE_NAME,
  TAGS_NAME,
];
/**
 * Filter assets needed for the parse and verify archive function
 */
export function filterAssetPathForParseAndVerifyArchive(assetPath: string): boolean {
  return PARSE_AND_VERIFY_ASSETS_NAME.some((endWithPath) => assetPath.endsWith(endWithPath));
}

/*
  This function generates a package info object (see type `ArchivePackage`) by parsing and verifying the `manifest.yml` file as well
  as the directory structure for the given package archive and other files adhering to the package spec: https://github.com/elastic/package-spec.
*/
export async function generatePackageInfoFromArchiveBuffer(
  archiveBuffer: Buffer,
  contentType: string
): Promise<{ paths: string[]; packageInfo: ArchivePackage }> {
  const assetsMap: AssetsBufferMap = {};
  const paths: string[] = [];
  await traverseArchiveEntries(
    archiveBuffer,
    contentType,
    async ({ path: bufferPath, buffer }) => {
      paths.push(bufferPath);
      if (buffer) {
        assetsMap[bufferPath] = buffer;
      }
    },
    (entryPath: string) => filterAssetPathForParseAndVerifyArchive(entryPath)
  );

  return {
    packageInfo: parseAndVerifyArchive(paths, assetsMap),
    paths,
  };
}

/*
This is a util function for verifying packages from a directory not an archive.
It is only to be called from test scripts.
*/
export async function _generatePackageInfoFromPaths(
  paths: string[],
  topLevelDir: string
): Promise<ArchivePackage> {
  const assetsMap: AssetsBufferMap = {};
  await Promise.all(
    paths.map(async (filePath) => {
      if (filterAssetPathForParseAndVerifyArchive(filePath)) {
        assetsMap[filePath] = await readFileAsync(filePath);
      }
    })
  );

  return parseAndVerifyArchive(paths, assetsMap, topLevelDir);
}

export function parseAndVerifyArchive(
  paths: string[],
  assetsMap: AssetsBufferMap,
  topLevelDirOverride?: string
): ArchivePackage {
  // The top-level directory must match pkgName-pkgVersion, and no other top-level files or directories may be present
  const logger = appContextService.getLogger();
  let toplevelDir = topLevelDirOverride || '';
  if (paths.length > 0) {
    toplevelDir = topLevelDirOverride || paths[0].split('/')[0];
  }

  paths.forEach((filePath) => {
    if (!filePath.startsWith(toplevelDir)) {
      throw new PackageInvalidArchiveError(
        `Package contains more than one top-level directory; top-level directory found: ${toplevelDir}; filePath: ${filePath}`
      );
    }
  });

  // The package must contain a manifest file ...
  const manifestFile = path.posix.join(toplevelDir, MANIFEST_NAME);
  const manifestBuffer = assetsMap[manifestFile];
  logger.debug(`Verifying archive - checking manifest file and manifest buffer`);
  if (!paths.includes(manifestFile) || !manifestBuffer) {
    throw new PackageInvalidArchiveError(
      !paths.includes(manifestFile)
        ? `Manifest file ${manifestFile} not found in paths.`
        : `Manifest buffer is not found in assets map for manifest file ${manifestFile}.`
    );
  }

  // ... which must be valid YAML
  let manifest: ArchivePackage;
  try {
    logger.debug(`Verifying archive - loading yaml`);
    const parsed = parse(manifestBuffer.toString());
    // Validate that the parsed result is an object (not a primitive like string, number, etc.)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Manifest must be a valid YAML object');
    }
    manifest = parsed;
  } catch (error) {
    throw new PackageInvalidArchiveError(
      `Could not parse top-level package manifest at top-level directory ${toplevelDir}: ${getErrorMessage(
        error
      )}.`
    );
  }

  // must have mandatory fields
  logger.debug(`Verifying archive - verifying manifest content`);
  const reqGiven = pick(manifest, requiredArchivePackageProps);
  const requiredKeysMatch =
    Object.keys(reqGiven).toString() === requiredArchivePackageProps.toString();
  if (!requiredKeysMatch) {
    const list = requiredArchivePackageProps.join(', ');
    throw new PackageInvalidArchiveError(
      `Invalid top-level package manifest at top-level directory ${toplevelDir} (package name: ${manifest.name}): one or more fields missing of ${list}.`
    );
  }

  // at least have all required properties
  // get optional values and combine into one object for the remaining operations
  const optGiven = pick(manifest, optionalArchivePackageProps);
  if (optGiven.elasticsearch) {
    optGiven.elasticsearch = parseTopLevelElasticsearchEntry(optGiven.elasticsearch);
  }
  const parsed: ArchivePackage = { ...reqGiven, ...optGiven };

  // Package name and version from the manifest must match those from the toplevel directory
  logger.debug(`Verifying archive - parsing manifest: ${parsed.name} - ${parsed.version}`);
  const pkgKey = pkgToPkgKey({ name: parsed.name, version: parsed.version });

  if (!topLevelDirOverride && toplevelDir !== pkgKey) {
    throw new PackageInvalidArchiveError(
      `Name ${parsed.name} and version ${parsed.version} do not match top-level directory ${toplevelDir}`
    );
  }
  logger.debug(`Parsing archive - parsing and verifying data streams`);
  const parsedDataStreams = parseAndVerifyDataStreams({
    paths,
    pkgName: parsed.name,
    pkgVersion: parsed.version,
    pkgBasePathOverride: topLevelDirOverride,
    assetsMap,
  });

  if (parsedDataStreams.length) {
    parsed.data_streams = parsedDataStreams;
  }

  logger.debug(`Parsing archive - parsing and verifying policy templates`);
  parsed.policy_templates = parseAndVerifyPolicyTemplates(manifest);

  // add readme if exists
  logger.debug(`Parsing archive - parsing and verifying Readme`);
  const readme = parseAndVerifyReadme(paths, parsed.name, parsed.version);
  if (readme) {
    parsed.readme = readme;
  }

  // If no `release` is specified, fall back to a value based on the `version` of the integration
  // to maintain backwards comptability. This is a temporary measure until the `release` field is
  // completely deprecated elsewhere in Fleet/Agent. See https://github.com/elastic/package-spec/issues/225
  if (!parsed.release) {
    parsed.release =
      semverPrerelease(parsed.version) || semverMajor(parsed.version) < 1 ? 'beta' : 'ga';
  }

  // Ensure top-level variables are parsed as well
  if (manifest.vars) {
    logger.debug(`Parsing archive - parsing and verifying top-level vars`);
    parsed.vars = parseAndVerifyVars(manifest.vars, 'manifest.yml');
  }

  // check that kibana/tags.yml file exists and add its content to ArchivePackage
  const tagsFile = path.posix.join(toplevelDir, KIBANA_FOLDER_NAME, TAGS_NAME);
  const tagsBuffer = assetsMap[tagsFile];

  if (paths.includes(tagsFile) || tagsBuffer) {
    let tags: PackageSpecTags[];
    try {
      tags = parse(tagsBuffer.toString());
      logger.debug(`Parsing archive - parsing kibana/tags.yml file`);
      if (tags.length) {
        parsed.asset_tags = tags;
      }
    } catch (error) {
      throw new PackageInvalidArchiveError(
        `Could not parse tags file kibana/tags.yml: ${getErrorMessage(error)}.`
      );
    }
  }

  return parsed;
}

export function parseAndVerifyReadme(
  paths: string[],
  pkgName: string,
  pkgVersion: string
): string | null {
  const readmeRelPath = `/docs/README.md`;
  const readmePath = `${pkgName}-${pkgVersion}${readmeRelPath}`;
  return paths.includes(readmePath) ? `/package/${pkgName}/${pkgVersion}${readmeRelPath}` : null;
}

export function parseAndVerifyDataStreams(opts: {
  paths: string[];
  pkgName: string;
  pkgVersion: string;
  assetsMap: AssetsBufferMap;
  pkgBasePathOverride?: string;
}): RegistryDataStream[] {
  const { paths, pkgName, pkgVersion, assetsMap: assetsMap, pkgBasePathOverride } = opts;
  // A data stream is made up of a subdirectory of name-version/data_stream/, containing a manifest.yml
  const dataStreamPaths = new Set<string>();
  const dataStreams: RegistryDataStream[] = [];
  const pkgBasePath = pkgBasePathOverride || pkgToPkgKey({ name: pkgName, version: pkgVersion });
  const dataStreamsBasePath = path.posix.join(pkgBasePath, 'data_stream');
  // pick all paths matching name-version/data_stream/DATASTREAM_NAME/...
  // from those, pick all unique data stream names
  paths.forEach((filePath) => {
    if (!filePath.startsWith(dataStreamsBasePath)) return;

    const streamWithoutPrefix = filePath.slice(dataStreamsBasePath.length);
    const [dataStreamPath] = streamWithoutPrefix.split('/').filter((v) => v); // remove undefined incase of leading /
    if (dataStreamPath) dataStreamPaths.add(dataStreamPath);
  });

  dataStreamPaths.forEach((dataStreamPath) => {
    const fullDataStreamPath = path.posix.join(dataStreamsBasePath, dataStreamPath);
    const manifestFile = path.posix.join(fullDataStreamPath, DATASTREAM_MANIFEST_NAME);
    const manifestBuffer = assetsMap[manifestFile];
    if (!paths.includes(manifestFile) || !manifestBuffer) {
      throw new PackageInvalidArchiveError(
        `No manifest.yml file found for data stream '${dataStreamPath}'`
      );
    }

    let manifest;
    try {
      const parsed = parse(manifestBuffer.toString());
      // Validate that the parsed result is an object (not a primitive like string, number, etc.)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Manifest must be a valid YAML object');
      }
      manifest = parsed;
    } catch (error) {
      throw new PackageInvalidArchiveError(
        `Could not parse package manifest for data stream '${dataStreamPath}': ${getErrorMessage(
          error
        )}.`
      );
    }

    // Routing rules
    const routingRulesPath = path.posix.join(fullDataStreamPath, DATASTREAM_ROUTING_RULES_NAME);
    const routingRulesBuffer = assetsMap[routingRulesPath];
    let dataStreamRoutingRules: RegistryDataStreamRoutingRules[] | undefined;
    if (routingRulesBuffer) {
      try {
        dataStreamRoutingRules = parse(routingRulesBuffer.toString());
      } catch (error) {
        throw new PackageInvalidArchiveError(
          `Could not parse routing rules for data stream '${dataStreamPath}': ${getErrorMessage(
            error
          )}.`
        );
      }
    }
    // Lifecycle
    const lifecyclePath = path.posix.join(fullDataStreamPath, DATASTREAM_LIFECYCLE_NAME);
    const lifecyleBuffer = assetsMap[lifecyclePath];
    let dataStreamLifecyle: RegistryDataStreamLifecycle | undefined;
    if (lifecyleBuffer) {
      try {
        dataStreamLifecyle = parse(lifecyleBuffer.toString());
      } catch (error) {
        throw new PackageInvalidArchiveError(
          `Could not parse lifecycle for data stream '${dataStreamPath}': ${getErrorMessage(
            error
          )}.`
        );
      }
    }

    const {
      // @ts-expect-error upgrade typescript v5.1.6
      title: dataStreamTitle,
      // @ts-expect-error upgrade typescript v5.1.6
      release = DEFAULT_RELEASE_VALUE,
      // @ts-expect-error upgrade typescript v5.1.6
      type,
      // @ts-expect-error upgrade typescript v5.1.6
      dataset,
      // @ts-expect-error upgrade typescript v5.1.6
      streams: manifestStreams,
      // @ts-expect-error upgrade typescript v5.1.6
      elasticsearch,
      ...restOfProps
    } = expandDottedObject(manifest);

    if (!(dataStreamTitle && type)) {
      throw new PackageInvalidArchiveError(
        `Invalid manifest for data stream '${dataStreamPath}': one or more fields missing of 'title', 'type'`
      );
    }

    const ingestPipeline = parseDefaultIngestPipeline(fullDataStreamPath, paths);
    const streams = parseAndVerifyStreams(manifestStreams, dataStreamPath);
    const parsedElasticsearchEntry = parseDataStreamElasticsearchEntry(
      elasticsearch,
      ingestPipeline
    );

    // Build up the stream object here so we can conditionally insert nullable fields. The package registry omits undefined
    // fields, so we're mimicking that behavior here.
    const dataStreamObject: RegistryDataStream = {
      title: dataStreamTitle,
      release,
      type,
      package: pkgName,
      dataset: dataset || `${pkgName}.${dataStreamPath}`,
      path: dataStreamPath,
      elasticsearch: parsedElasticsearchEntry,
    };

    if (dataStreamRoutingRules) {
      dataStreamObject.routing_rules = dataStreamRoutingRules;
    }

    if (dataStreamLifecyle) {
      dataStreamObject.lifecycle = dataStreamLifecyle;
    }

    if (ingestPipeline) {
      dataStreamObject.ingest_pipeline = ingestPipeline;
    }

    if (streams.length) {
      dataStreamObject.streams = streams;
    }

    dataStreams.push(
      Object.entries(restOfProps).reduce((validatedDataStream, [key, value]) => {
        if (registryDataStreamProps.includes(key as RegistryDataStreamKeys)) {
          validatedDataStream[key] = value;
        }
        return validatedDataStream;
      }, dataStreamObject)
    );
  });

  return dataStreams;
}

export function parseAndVerifyStreams(
  manifestStreams: any,
  dataStreamPath: string
): RegistryStream[] {
  const streams: RegistryStream[] = [];
  if (manifestStreams && manifestStreams.length > 0) {
    manifestStreams.forEach((manifestStream: any) => {
      const {
        input,
        title: streamTitle,
        vars: manifestVars,
        template_path: templatePath,
        template_paths: templatePaths,
        ...restOfProps
      } = manifestStream;
      if (!(input && streamTitle)) {
        throw new PackageInvalidArchiveError(
          `Invalid manifest for data stream ${dataStreamPath}: stream is missing one or more fields of: input, title`
        );
      }

      const vars = parseAndVerifyVars(manifestVars, `data stream ${dataStreamPath}`);

      const streamObject: RegistryStream = {
        input,
        title: streamTitle,
        ...(templatePaths?.length
          ? { template_paths: templatePaths }
          : { template_path: templatePath || 'stream.yml.hbs' }),
      };

      if (vars.length) {
        streamObject.vars = vars;
      }

      streams.push(
        Object.entries(restOfProps).reduce((validatedStream, [key, value]) => {
          if (registryStreamProps.includes(key as RegistryStreamKeys)) {
            // @ts-expect-error
            validatedStream[key] = value;
          }
          return validatedStream;
        }, streamObject)
      );
    });
  }
  return streams;
}

export function parseAndVerifyVars(manifestVars: any[], location: string): RegistryVarsEntry[] {
  const vars: RegistryVarsEntry[] = [];
  if (manifestVars && manifestVars.length > 0) {
    manifestVars.forEach((manifestVar) => {
      const { name, type, ...restOfProps } = manifestVar;
      if (!(name && type)) {
        throw new PackageInvalidArchiveError(
          `Invalid var definition for ${location}: one of mandatory fields 'name' and 'type' missing in var: ${JSON.stringify(
            manifestVar
          )}`
        );
      }

      vars.push(
        Object.entries(restOfProps).reduce(
          (validatedVarEntry, [key, value]) => {
            if (registryVarsProps.includes(key as RegistryVarsEntryKeys)) {
              // @ts-expect-error
              validatedVarEntry[key] = value;
            }
            return validatedVarEntry;
          },
          { name, type } as RegistryVarsEntry
        )
      );
    });
  }
  return vars;
}

export function parseAndVerifyPolicyTemplates(
  manifest: PackageSpecManifest
): RegistryPolicyTemplate[] {
  const policyTemplates: RegistryPolicyTemplate[] = [];
  const manifestPolicyTemplates = manifest.policy_templates;
  if (manifestPolicyTemplates && manifestPolicyTemplates.length > 0) {
    manifestPolicyTemplates.forEach((policyTemplate: any) => {
      const {
        name,
        title: policyTemplateTitle,
        description,
        inputs,
        input,
        multiple,
        ...restOfProps
      } = policyTemplate;
      if (!(name && policyTemplateTitle && description)) {
        throw new PackageInvalidArchiveError(
          `Invalid top-level manifest: one of mandatory fields 'name', 'title', 'description' is missing in policy template: ${JSON.stringify(
            policyTemplate
          )}`
        );
      }
      let parsedInputs: RegistryInput[] | undefined = [];
      if (inputs) {
        parsedInputs = parseAndVerifyInputs(inputs, `config template ${name}`);
      }

      // defaults to true if undefined, but may be explicitly set to false.
      let parsedMultiple = true;
      if (typeof multiple === 'boolean' && multiple === false) parsedMultiple = false;

      const validatedTemplate = Object.entries(restOfProps).reduce(
        (validatedPolicyTemplate, [key, value]) => {
          if (registryPolicyTemplateProps.includes(key as RegistryPolicyTemplateKeys)) {
            // @ts-expect-error
            validatedPolicyTemplate[key] = value;
          }
          return validatedPolicyTemplate;
        },
        {
          name,
          title: policyTemplateTitle,
          description,
          multiple: parsedMultiple,
          // template can only have one of input or inputs
          ...(!input ? { inputs: parsedInputs } : { input }),
        } as RegistryPolicyTemplate
      ) as RegistryPolicyTemplate & {
        input?: string;
        type?: string;
        dynamic_signal_types?: boolean;
      };

      // For input-only packages: either type is required, or dynamic_signal_types must be true (package-spec)
      if (validatedTemplate.input !== undefined) {
        const hasType = validatedTemplate.type !== undefined && validatedTemplate.type !== '';
        const hasDynamicSignalTypes = validatedTemplate.dynamic_signal_types === true;
        if (!hasType && !hasDynamicSignalTypes) {
          throw new PackageInvalidArchiveError(
            `Invalid policy template: for input packages, either 'type' is required or 'dynamic_signal_types' must be true. Template: ${JSON.stringify(
              {
                name: validatedTemplate.name,
                type: validatedTemplate.type,
                dynamic_signal_types: validatedTemplate.dynamic_signal_types,
              }
            )}`
          );
        }
      }

      policyTemplates.push(validatedTemplate);
    });
  }
  return policyTemplates;
}

export function parseAndVerifyInputs(manifestInputs: any, location: string): RegistryInput[] {
  const inputs: RegistryInput[] = [];
  if (manifestInputs && manifestInputs.length > 0) {
    manifestInputs.forEach((input: any) => {
      const { title: inputTitle, vars, ...restOfProps } = input;
      if (!(input.type && inputTitle)) {
        throw new PackageInvalidArchiveError(
          `Invalid top-level manifest: one of mandatory fields 'type', 'title' missing in input: ${JSON.stringify(
            input
          )}`
        );
      }
      const parsedVars = parseAndVerifyVars(vars, location);

      inputs.push(
        Object.entries(restOfProps).reduce(
          (validatedInput, [key, value]) => {
            if (registryInputProps.includes(key as RegistryInputKeys)) {
              // @ts-expect-error
              validatedInput[key] = value;
            }
            return validatedInput;
          },
          {
            title: inputTitle,
            vars: parsedVars,
          } as RegistryInput
        )
      );
    });
  }
  return inputs;
}

export function parseDataStreamElasticsearchEntry(
  elasticsearch?: Record<string, any>,
  ingestPipeline?: string
) {
  const parsedElasticsearchEntry: Record<string, any> = {};
  const expandedElasticsearch = expandDottedObject(elasticsearch);
  if (ingestPipeline) {
    parsedElasticsearchEntry['ingest_pipeline.name'] = ingestPipeline;
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.privileges) {
    // @ts-expect-error upgrade typescript v5.1.6
    parsedElasticsearchEntry.privileges = expandedElasticsearch.privileges;
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.source_mode) {
    // @ts-expect-error upgrade typescript v5.1.6
    parsedElasticsearchEntry.source_mode = expandedElasticsearch.source_mode;
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.index_template?.mappings) {
    parsedElasticsearchEntry['index_template.mappings'] = expandDottedEntries(
      // @ts-expect-error upgrade typescript v5.1.6
      expandedElasticsearch.index_template.mappings
    );
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.index_template?.settings) {
    parsedElasticsearchEntry['index_template.settings'] = expandDottedEntries(
      // @ts-expect-error upgrade typescript v5.1.6
      expandedElasticsearch.index_template.settings
    );
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.index_template?.data_stream) {
    parsedElasticsearchEntry['index_template.data_stream'] = expandDottedEntries(
      // @ts-expect-error upgrade typescript v5.1.6
      expandedElasticsearch.index_template.data_stream
    );
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.index_mode) {
    // @ts-expect-error upgrade typescript v5.1.6
    parsedElasticsearchEntry.index_mode = expandedElasticsearch.index_mode;
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.dynamic_dataset) {
    // @ts-expect-error upgrade typescript v5.1.6
    parsedElasticsearchEntry.dynamic_dataset = expandedElasticsearch.dynamic_dataset;
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.dynamic_namespace) {
    // @ts-expect-error upgrade typescript v5.1.6
    parsedElasticsearchEntry.dynamic_namespace = expandedElasticsearch.dynamic_namespace;
  }

  return parsedElasticsearchEntry;
}

export function parseTopLevelElasticsearchEntry(elasticsearch?: Record<string, any>) {
  const parsedElasticsearchEntry: Record<string, any> = {};
  const expandedElasticsearch = expandDottedObject(elasticsearch);

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.privileges) {
    // @ts-expect-error upgrade typescript v5.1.6
    parsedElasticsearchEntry.privileges = expandedElasticsearch.privileges;
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.index_mode) {
    // @ts-expect-error upgrade typescript v5.1.6
    parsedElasticsearchEntry.index_mode = expandedElasticsearch.index_mode;
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.source_mode) {
    // @ts-expect-error upgrade typescript v5.1.6
    parsedElasticsearchEntry.source_mode = expandedElasticsearch.source_mode;
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.dynamic_dataset) {
    // @ts-expect-error upgrade typescript v5.1.6
    parsedElasticsearchEntry.dynamic_dataset = expandedElasticsearch.dynamic_dataset;
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.dynamic_namespace) {
    // @ts-expect-error upgrade typescript v5.1.6
    parsedElasticsearchEntry.dynamic_namespace = expandedElasticsearch.dynamic_namespace;
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.index_template?.mappings) {
    parsedElasticsearchEntry['index_template.mappings'] = expandDottedEntries(
      // @ts-expect-error upgrade typescript v5.1.6
      expandedElasticsearch.index_template.mappings
    );
  }

  // @ts-expect-error upgrade typescript v5.1.6
  if (expandedElasticsearch?.index_template?.settings) {
    parsedElasticsearchEntry['index_template.settings'] = expandDottedEntries(
      // @ts-expect-error upgrade typescript v5.1.6
      expandedElasticsearch.index_template.settings
    );
  }

  return parsedElasticsearchEntry;
}

const isDefaultPipelineFile = (pipelinePath: string) =>
  pipelinePath.endsWith(DEFAULT_INGEST_PIPELINE_FILE_NAME_YML) ||
  pipelinePath.endsWith(DEFAULT_INGEST_PIPELINE_FILE_NAME_JSON);

export function parseDefaultIngestPipeline(fullDataStreamPath: string, paths: string[]) {
  const ingestPipelineDirPath = path.posix.join(
    fullDataStreamPath,
    '/elasticsearch/ingest_pipeline'
  );
  const defaultIngestPipelinePaths = paths.filter(
    (pipelinePath) =>
      pipelinePath.startsWith(ingestPipelineDirPath) && isDefaultPipelineFile(pipelinePath)
  );

  if (!defaultIngestPipelinePaths.length) return undefined;

  return DEFAULT_INGEST_PIPELINE_VALUE;
}
