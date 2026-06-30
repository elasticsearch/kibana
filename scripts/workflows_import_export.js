#!/usr/bin/env node

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/* eslint-disable no-restricted-syntax */

/**
 * Import/Export workflows from Kibana
 *
 * Usage:
 *   Export: node scripts/workflows_import_export.js export --dir=./workflows [--space=default]
 *   Import: node scripts/workflows_import_export.js import --dir=./workflows [--space=default] [--overwrite] [--recursive]
 *
 * Examples:
 *   node scripts/workflows_import_export.js export --dir=./my-workflows
 *   node scripts/workflows_import_export.js import --dir=./my-workflows --overwrite
 *   node scripts/workflows_import_export.js import --dir=./my-workflows --recursive
 */

require('@kbn/setup-node-env');

const fs = require('fs');
const path = require('path');
const getopts = require('getopts');
const https = require('https');
const http = require('http');

// Constants
const DEFAULT_SPACE = 'default';
const DEFAULT_DIR = './workflows';

/**
 * Sanitize workflow name to create valid filename
 */
function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/**
 * Get Kibana configuration
 */
function getKibanaConfig(useSsl = false) {
  const protocol = useSsl ? 'https' : 'http';
  const kibanaUrl = process.env.KIBANA_URL || `${protocol}://localhost:5601/kbn`;
  const username = process.env.KIBANA_USERNAME || 'elastic';
  const password = process.env.KIBANA_PASSWORD || 'changeme';

  return { kibanaUrl, username, password };
}

/**
 * Make HTTP request to Kibana API
 */
function makeKibanaRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const httpModule = url.startsWith('https') ? https : http;

    const requestOptions = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'kbn-xsrf': 'true',
        'x-elastic-internal-origin': 'Kibana',
        'elastic-api-version': '2023-10-31',
        ...options.headers,
      },
      rejectUnauthorized: false,
    };

    const req = httpModule.request(url, requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data || '{}'));
          } catch (e) {
            resolve(data);
          }
        } else {
          const error = new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`);
          error.statusCode = res.statusCode;
          try {
            error.body = JSON.parse(data);
          } catch (e) {
            error.body = data;
          }
          reject(error);
        }
      });
    });

    req.on('error', reject);

    if (body) {
      const bodyStr = JSON.stringify(body);
      req.setHeader('Content-Length', Buffer.byteLength(bodyStr));
      req.write(bodyStr);
    }

    req.end();
  });
}

/**
 * Export workflows from Kibana to YAML files
 */
async function exportWorkflows(options) {
  const { dir, space, ssl } = options;
  const { kibanaUrl, username, password } = getKibanaConfig(ssl);

  try {
    console.log(`Connecting to Kibana at ${kibanaUrl}...`);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }

    // Build auth header
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const headers = {
      Authorization: `Basic ${auth}`,
    };

    // Fetch all workflows using Kibana API
    const spacePrefix = space === 'default' ? '' : `/s/${space}`;
    const listUrl = `${kibanaUrl}${spacePrefix}/api/workflows?size=10000&page=1`;

    console.log(`Fetching workflows from space: ${space}`);
    const result = await makeKibanaRequest(listUrl, {
      method: 'GET',
      headers,
    });

    const workflows = result.results || [];

    if (workflows.length === 0) {
      console.log('No workflows found.');
      return;
    }

    console.log(`Found ${workflows.length} workflow(s)`);

    // Export each workflow to a YAML file
    let exportCount = 0;
    const fileMap = new Map();

    for (const workflow of workflows) {
      if (!workflow.yaml) {
        console.warn(`Skipping workflow ${workflow.id}: No YAML content`);
        continue;
      }

      // Generate filename from workflow name
      let baseFilename = workflow.name
        ? sanitizeFilename(workflow.name)
        : `workflow_${workflow.id}`;

      // Handle filename collisions
      let filename = baseFilename;
      let counter = 1;
      while (fileMap.has(filename)) {
        filename = `${baseFilename}_${counter}`;
        counter++;
      }
      fileMap.set(filename, workflow.id);

      const filepath = path.join(dir, `${filename}.yaml`);

      // Add metadata as YAML comments at the top
      const metadataLines = [
        `# Workflow: ${workflow.name || 'Unnamed'}`,
        `# ID: ${workflow.id}`,
        `# Space: ${space}`,
        `# Created: ${workflow.createdAt}`,
        `# Updated: ${workflow.lastUpdatedAt}`,
        workflow.description ? `# Description: ${workflow.description}` : null,
        `# Enabled: ${workflow.enabled}`,
        workflow.tags && workflow.tags.length > 0 ? `# Tags: ${workflow.tags.join(', ')}` : null,
        `# Created by: ${workflow.createdBy || 'unknown'}`,
      ].filter(Boolean);

      const content = metadataLines.join('\n') + '\n\n' + workflow.yaml;

      fs.writeFileSync(filepath, content, 'utf8');
      console.log(`✓ Exported: ${filename}.yaml (${workflow.name || 'Unnamed'})`);
      exportCount++;
    }

    console.log(`\n✅ Successfully exported ${exportCount} workflow(s) to ${dir}`);
  } catch (error) {
    console.error('❌ Export failed:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
      if (
        error.body.message &&
        error.body.message.includes('not available with the current configuration')
      ) {
        console.error('\n💡 Tip: Make sure workflows are enabled in kibana.yml:');
        console.error('   workflowsManagement.enabled: true');
        console.error('   uiSettings.overrides:');
        console.error('     workflows:ui:enabled: true');
      }
    }
    process.exit(1);
  }
}

/**
 * Collect YAML files from a directory, optionally walking subdirectories.
 * Returns absolute file paths.
 */
function collectYamlFiles(dir, recursive) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...collectYamlFiles(fullPath, recursive));
    } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Import workflows from YAML files using Kibana API
 */
async function importWorkflows(options) {
  const { dir, space, overwrite, recursive, ssl } = options;
  const { kibanaUrl, username, password } = getKibanaConfig(ssl);

  try {
    console.log(`Connecting to Kibana at ${kibanaUrl}...`);

    // Check if directory exists
    if (!fs.existsSync(dir)) {
      console.error(`❌ Directory not found: ${dir}`);
      process.exit(1);
    }

    // Read all YAML files from directory (optionally recursive)
    const files = collectYamlFiles(dir, recursive);

    if (files.length === 0) {
      console.log('No YAML files found in directory.');
      return;
    }

    console.log(`Found ${files.length} YAML file(s) to import`);

    // Build auth header
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const headers = {
      Authorization: `Basic ${auth}`,
    };

    // Fetch existing workflows to check for duplicates
    const spacePrefix = space === 'default' ? '' : `/s/${space}`;
    const listUrl = `${kibanaUrl}${spacePrefix}/api/workflows?size=10000&page=1`;

    let existingByName = new Map();
    try {
      const searchResult = await makeKibanaRequest(listUrl, {
        method: 'GET',
        headers,
      });

      if (searchResult.results) {
        for (const workflow of searchResult.results) {
          if (workflow.name) {
            existingByName.set(workflow.name, workflow.id);
          }
        }
      }
    } catch (error) {
      console.error('❌ Could not connect to Kibana:', error.message);
      process.exit(1);
    }

    let importCount = 0;
    let skipCount = 0;
    let updateCount = 0;
    let errorCount = 0;

    for (const filepath of files) {
      const file = path.relative(dir, filepath);
      const content = fs.readFileSync(filepath, 'utf8');

      // Strip the metadata comment block at the top of the file.
      // Metadata format: consecutive '# Key: Value' lines followed by an empty line.
      // Preserve all other content including inline YAML comments.
      const yamlLines = content.split('\n');
      let firstContentLine = 0;
      let inMetadataBlock = true;
      for (let i = 0; i < yamlLines.length; i++) {
        const trimmed = yamlLines[i].trim();
        if (inMetadataBlock) {
          if (trimmed.startsWith('# ') && trimmed.match(/^# \w+:/)) {
            // Metadata comment line (e.g., "# Workflow: name")
            continue;
          } else if (trimmed === '') {
            // Empty line after metadata - skip it and stop
            firstContentLine = i + 1;
            inMetadataBlock = false;
            break;
          } else {
            // Non-metadata line - metadata block ended (no empty separator)
            firstContentLine = i;
            inMetadataBlock = false;
            break;
          }
        }
      }
      const cleanYaml = yamlLines.slice(firstContentLine).join('\n').trim() + '\n';

      // Extract workflow name from YAML content (source of truth), fallback to comment metadata
      const yamlNameMatch = cleanYaml.match(/^name:\s*(.+)$/m);
      const commentNameMatch = content.match(/^# Workflow: (.+)$/m);
      let workflowName = path.basename(file, path.extname(file));
      if (yamlNameMatch) {
        workflowName = yamlNameMatch[1].trim().replace(/^['"]|['"]$/g, '');
      } else if (commentNameMatch) {
        workflowName = commentNameMatch[1];
      }

      // Check if workflow already exists
      const existingId = existingByName.get(workflowName);

      if (existingId && !overwrite) {
        console.log(`⊘ Skipped: ${file} (workflow "${workflowName}" already exists)`);
        skipCount++;
        continue;
      }

      try {
        // Prepare workflow data (CreateWorkflowCommandSchema expects { yaml, id? })
        const workflowData = {
          yaml: cleanYaml,
        };

        if (existingId && overwrite) {
          // Update existing workflow using PUT
          const updateUrl = `${kibanaUrl}${spacePrefix}/api/workflows/workflow/${existingId}`;
          await makeKibanaRequest(updateUrl, { method: 'PUT', headers }, workflowData);
          console.log(`↻ Updated: ${file} → "${workflowName}"`);
          updateCount++;
        } else {
          // Create new workflow using POST
          const createUrl = `${kibanaUrl}${spacePrefix}/api/workflows/workflow`;
          await makeKibanaRequest(createUrl, { method: 'POST', headers }, workflowData);
          console.log(`✓ Imported: ${file} → "${workflowName}"`);
          importCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to import ${file}:`, error.message);
        if (error.body) {
          console.error('  Details:', JSON.stringify(error.body, null, 2));
        }
        errorCount++;
      }
    }

    const status = errorCount > 0 ? '⚠️ ' : '✅';
    console.log(
      `\n${status} Import complete: ${importCount} created, ${updateCount} updated, ${skipCount} skipped, ${errorCount} failed`
    );
    if (errorCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
      if (
        error.body.message &&
        error.body.message.includes('not available with the current configuration')
      ) {
        console.error('\n💡 Tip: Make sure workflows are enabled in kibana.yml:');
        console.error('   workflowsManagement.enabled: true');
        console.error('   uiSettings.overrides:');
        console.error('     workflows:ui:enabled: true');
        console.error('\nYou may need to restart Kibana after changing the configuration.');
      }
    }
    process.exit(1);
  }
}

/**
 * Delete all workflows from Kibana
 */
async function deleteAllWorkflows(options) {
  const { space, ssl } = options;
  const { kibanaUrl, username, password } = getKibanaConfig(ssl);

  try {
    console.log(`Connecting to Kibana at ${kibanaUrl}...`);

    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const headers = {
      Authorization: `Basic ${auth}`,
    };

    const spacePrefix = space === 'default' ? '' : `/s/${space}`;
    const listUrl = `${kibanaUrl}${spacePrefix}/api/workflows?size=10000&page=1`;

    console.log(`Fetching workflows from space: ${space}`);
    const result = await makeKibanaRequest(listUrl, { method: 'GET', headers });

    const workflows = result.results || [];

    if (workflows.length === 0) {
      console.log('No workflows found to delete.');
      return;
    }

    console.log(`Found ${workflows.length} workflow(s) to delete`);

    let totalDeleted = 0;
    let totalFailed = 0;

    for (const workflow of workflows) {
      const deleteUrl = `${kibanaUrl}${spacePrefix}/api/workflows/workflow/${workflow.id}`;
      try {
        await makeKibanaRequest(deleteUrl, { method: 'DELETE', headers });
        totalDeleted++;
      } catch (error) {
        console.warn(`⚠️  Failed to delete "${workflow.name}" (${workflow.id}): ${error.message}`);
        totalFailed++;
      }
    }

    const status = totalFailed > 0 ? '⚠️ ' : '✅';
    console.log(`\n${status} Deleted ${totalDeleted} workflow(s), ${totalFailed} failed`);
  } catch (error) {
    console.error('❌ Delete failed:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
    if (error.statusCode) {
      console.error('Status code:', error.statusCode);
    }
    process.exit(1);
  }
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Kibana Workflows Import/Export Tool

Usage:
  node scripts/workflows_import_export.js <command> [options]

Commands:
  export    Export workflows to YAML files
  import    Import workflows from YAML files
  delete    Delete all workflows from a space

Options:
  --dir         Directory for workflow files (default: ./workflows)
  --space       Kibana space to use (default: default)
  --overwrite   Overwrite existing workflows on import (default: false)
  --recursive   Walk subdirectories when importing (default: false)
  --ssl         Use HTTPS connection (default: true)
  --no-ssl      Use HTTP connection
  --help        Show this help message

Environment Variables:
  KIBANA_URL       Kibana URL (default: http://localhost:5601)
  KIBANA_USERNAME  Username (default: elastic)
  KIBANA_PASSWORD  Password (default: changeme)

Examples:
  Export all workflows:
    node scripts/workflows_import_export.js export --dir=./my-workflows

  Export workflows from specific space:
    node scripts/workflows_import_export.js export --dir=./my-workflows --space=production

  Export using HTTP (no SSL):
    node scripts/workflows_import_export.js export --no-ssl

  Import workflows (skip existing):
    node scripts/workflows_import_export.js import --dir=./my-workflows

  Import workflows (overwrite existing):
    node scripts/workflows_import_export.js import --dir=./my-workflows --overwrite

  Import workflows from all subdirectories:
    node scripts/workflows_import_export.js import --dir=./my-workflows --recursive

  Import workflows to specific space:
    node scripts/workflows_import_export.js import --dir=./my-workflows --space=staging

  Delete all workflows:
    node scripts/workflows_import_export.js delete

  Delete all workflows in a specific space:
    node scripts/workflows_import_export.js delete --space=production
`);
}

/**
 * Main function
 */
async function main() {
  const opts = getopts(process.argv.slice(2), {
    alias: {
      h: 'help',
      d: 'dir',
      s: 'space',
      o: 'overwrite',
    },
    boolean: ['help', 'overwrite', 'recursive', 'ssl', 'no-ssl'],
    string: ['dir', 'space'],
    default: {
      dir: DEFAULT_DIR,
      space: DEFAULT_SPACE,
      overwrite: false,
      recursive: false,
      ssl: false,
    },
  });

  const command = opts._[0];

  if (opts.help || !command) {
    showHelp();
    process.exit(0);
  }

  const options = {
    dir: opts.dir,
    space: opts.space,
    overwrite: opts.overwrite,
    recursive: opts.recursive,
    ssl: opts['no-ssl'] ? false : opts.ssl,
  };

  console.log('Kibana Workflows Import/Export Tool\n');

  switch (command) {
    case 'export':
      await exportWorkflows(options);
      break;
    case 'import':
      await importWorkflows(options);
      break;
    case 'delete':
      await deleteAllWorkflows(options);
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run with --help for usage information');
      process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { exportWorkflows, importWorkflows, deleteAllWorkflows };
