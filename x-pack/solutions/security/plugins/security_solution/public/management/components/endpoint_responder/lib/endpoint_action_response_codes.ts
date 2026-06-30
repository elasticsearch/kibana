/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

const CODES = Object.freeze({
  // -----------------------------------------------------------------
  // GET-FILE CODES
  // -----------------------------------------------------------------
  'ra_get-file_error_canceled': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.getFile.canceled',
    { defaultMessage: 'Response action was canceled' }
  ),

  /** file not found */
  'ra_get-file_error_not-found': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.getFile.notFound',
    { defaultMessage: 'The file specified was not found' }
  ),

  /** path is reachable but does not point to a file */
  'ra_get-file_error_is-directory': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.getFile.isDirectory',
    { defaultMessage: 'The path defined is not a file' }
  ),

  /** path did not pass basic validation: malformed path, unix instead of windows, invalid characters, not full path, etc */
  'ra_get-file_error_invalid-input': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.getFile.invalidPath',
    { defaultMessage: 'The path defined is not valid' }
  ),

  /** Maybe: possible to be able to list the file but not read it's content */
  'ra_get-file_error_not-permitted': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.getFile.notPermitted',
    { defaultMessage: 'Endpoint unable to read file requested (not permitted)' }
  ),

  /** file size exceeds hard coded limit (100MB) */
  'ra_get-file_error_too-big': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.getFile.tooBig',
    { defaultMessage: 'The file requested is too large and can not be retrieved' }
  ),

  /** Endpoint ran out of file upload queue size */
  'ra_get-file_error_disk-quota': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.getFile.diskQuota',
    { defaultMessage: 'Endpoint ran out of disk quota while attempting to retrieve file' }
  ),

  /** Something interrupted preparing the zip: file read error, zip error */
  'ra_get-file_error_processing': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.getFile.errorProcessing',
    { defaultMessage: 'File retrieval was interrupted' }
  ),

  /** The fleet upload API was unreachable (not just busy) */
  'ra_get-file_error_upload-api-unreachable': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.getFile.uploadApiUnreachable',
    { defaultMessage: 'File upload api (fleet-server) is unreachable' }
  ),

  /** Perhaps internet connection was too slow or unstable to upload all chunks before unique upload-id expired. Endpoint will re-try a bit (3 times?). */
  'ra_get-file_error_upload-timeout': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.getFile.uploadTimeout',
    { defaultMessage: 'File upload timed out' }
  ),

  /** Upload API could be busy, endpoint should periodically re-try */
  'ra_get-file_error_queue-timeout': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.getFile.queueTimeout',
    { defaultMessage: 'Endpoint timed out while attempting to connect to upload API' }
  ),

  /** not enough free disk space to complete the action as per endpoint advanced policy */
  'ra_get-file_error_not-enough-free-space': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.getFile.notEnoughFreeSpace',
    { defaultMessage: 'Not enough free disk space to process the action' }
  ),

  // -----------------------------------------------------------------
  // SUSPEND-PROCESS CODES
  // -----------------------------------------------------------------
  /**
   * Code will be used whenever you provide an entity_id or pid that isn't found.
   * suspend_process will always be an error because the process was not found to be suspended
   */
  'ra_suspend-process_error_not-found': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.suspendProcess.notFoundError',
    { defaultMessage: 'The provided process was not found' }
  ),

  /**
   * Code will be used when the provided process can not be suspended (for stability reasons).
   * Example: This occurs if you try to suspend Endpoint Security
   */
  'ra_suspend-process_error_not-permitted': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.suspendProcess.notPermittedSuccess',
    { defaultMessage: 'The provided process cannot be suspended' }
  ),

  // -----------------------------------------------------------------
  // KILL-PROCESS CODES
  // -----------------------------------------------------------------
  /**
   * Code will be used whenever you provide an entity_id that isn't found. Since entity_id is
   * unique, we can guarantee that it was legitimately not found and not just that the process
   * was already killed.
   */
  'ra_kill-process_error_not-found': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.killProcess.notFoundError',
    { defaultMessage: 'The provided process was not found' }
  ),

  /**
   * Code will be used whenever you provide a pid that isn't found. Since pid is reused, we aren't
   * sure if the process was already killed or just wasn't found. In either case, a process with
   * that pid will no longer be running.
   */
  'ra_kill-process_success_no-action': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.killProcess.noActionSuccess',
    { defaultMessage: 'Action completed. The provided process was not found or already killed' }
  ),

  /**
   * Code will be used when the provided process can not be killed (for stability reasons).
   * Example: This occurs if you try to kill Endpoint Security
   */
  'ra_kill-process_error_not-permitted': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.killProcess.notPermittedSuccess',
    { defaultMessage: 'The provided process cannot be killed' }
  ),

  // -----------------------------------------------------------------
  // EXECUTE CODES
  // -----------------------------------------------------------------

  ra_execute_error_canceled: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.execute.canceled',
    { defaultMessage: 'Response action was canceled' }
  ),

  // Dev:
  // Something interrupted preparing the zip: file read error, zip error. I think these should be rare,
  // and should succeed on retry by the user or result in file-not-found. We might implement some retries
  // internally but I'm leaning to the opinion that we should rather quickly send the feedback to the
  // user to let them decide.
  ra_execute_error_processing: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.execute.processingError',
    {
      defaultMessage: 'Unable to create execution output zip file.',
    }
  ),

  // Dev:
  // Executing timeout has been reached, the command was killed.
  'ra_execute_error_processing-timeout': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.execute.processingTimeout',
    { defaultMessage: 'Command execution was terminated. It exceeded the provided timeout.' }
  ),

  // Dev:
  // Execution was interrupted, for example: system shutdown, endpoint service stop/restart.
  'ra_execute_error_processing-interrupted': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.execute.processingInterrupted',
    {
      defaultMessage: 'Command execution was absolutely interrupted.',
    }
  ),

  // Dev:
  // Too many active execute actions, limit 10. Execute actions are allowed to run in parallel, we must
  // take into account resource use impact on endpoint as customers are piky about CPU/MEM utilization.
  'ra_execute_error_to-many-requests': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.execute.toManyRequests',
    {
      defaultMessage: 'Too many concurrent command execution actions.',
    }
  ),

  // Dev:
  // generic failure (rare corner case, software bug, etc)
  ra_execute_error_failure: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.execute.failure',
    { defaultMessage: 'Unknown failure while executing command.' }
  ),

  // Dev:
  // Max pending response zip uploads has been reached, limit 10. Endpoint can't use unlimited disk space.
  'ra_execute_error_disk-quota': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.execute.diskQuotaError',
    {
      defaultMessage: 'Too many pending command execution output zip files.',
    }
  ),

  // Dev:
  // The fleet upload API was unreachable (not just busy). This may mean policy misconfiguration, in which
  // case health status in Kibana should indicate degraded, or maybe network configuration problems, or fleet
  // server problems HTTP 500. This excludes offline status, where endpoint should just wait for network connection.
  'ra_execute_error_upload-api-unreachable': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.execute.uploadApiUnreachable',
    {
      defaultMessage:
        'Failed to upload command execution output zip file. Unable to reach Fleet Server upload API.',
    }
  ),

  // Dev:
  // Perhaps internet connection was too slow or unstable to upload all chunks before unique
  // upload-id expired. Endpoint will re-try a bit, max 3 times.
  'ra_execute_error_upload-timeout': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.execute.outputUploadTimeout',
    {
      defaultMessage: 'Failed to upload command execution output zip file. Upload timed out',
    }
  ),

  // DEV:
  // Upload API could be busy, endpoint should periodically re-try (2 days = 192 x 15min, assuming
  // that with 1Mbps 15min is enough to upload 100MB)
  'ra_execute_error_queue-timeout': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.execute.queueTimeout',
    {
      defaultMessage:
        'Failed to upload command execution output zip file. Timed out while queued waiting for Fleet Server',
    }
  ),

  // -----------------------------------------------------------------
  // UPLOAD CODES
  // -----------------------------------------------------------------

  ra_upload_error_canceled: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.upload.canceled',
    { defaultMessage: 'Response action was canceled' }
  ),

  // Dev:
  // generic failure (rare corner case, software bug, etc)
  ra_upload_error_failure: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.upload.failure',
    { defaultMessage: 'Upload failed' }
  ),

  // Dev:
  // File with the given name already exists and overwrite was not allowed.
  'ra_upload_error_already-exists': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.upload.fileAlreadyExists',
    {
      defaultMessage:
        'File with this name already exists. Use "--overwrite" argument if wanting to overwrite it',
    }
  ),

  // Dev:
  // HTTP 404 from fleet server when trying to download file
  'ra_upload_error_not-found': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.upload.fileNotFound',
    { defaultMessage: 'Failed to retrieve file. File was not found (404)' }
  ),

  // Dev:
  // HTTP 401, HTTP 403 from fleet server
  'ra_upload_error_not-permitted': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.upload.fileAccessForbidden',
    { defaultMessage: 'Failed to retrieve file. Access is forbidden (403) or unauthorized (401)' }
  ),

  // Dev:
  // file size exceeds hard coded limit (100MB)
  'ra_upload_error_too-big': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.upload.fileTooLarge',
    { defaultMessage: 'Failed to save file. Size exceeds max allowed' }
  ),

  // Dev:
  // Fleet file API could be busy, endpoint should periodically re-try (2 days = 192 x 15min, assuming that with 1Mbps 15min is enough to upload 100MB)
  'ra_upload_error_queue-timeout': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.upload.timeout',
    { defaultMessage: 'Attempts to retrieve file failed due to timeout' }
  ),

  // Downloaded data was corrupted, SHA256 didn't match expected, or IO error when writing to disk happened.
  'ra_upload_error_download-failed': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.upload.fileCorruption',
    { defaultMessage: 'Failed to save file to disk or validate its integrity' }
  ),

  // Dev:
  // Fleet upload API was unreachable or misconfigured
  'ra_upload_error_upload-api-unreachable': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.upload.uploadApiUnreachable',
    { defaultMessage: 'Failed to retrieve the file. File upload api (fleet-server) is unreachable' }
  ),

  /** not enough free disk space to complete the action as per endpoint advanced policy */
  'ra_upload_error_not-enough-free-space': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.upload.notEnoughFreeSpace',
    { defaultMessage: 'Not enough free disk space to process the action' }
  ),
  // -----------------------------------------------------------------
  // SCAN CODES
  // -----------------------------------------------------------------

  ra_scan_error_canceled: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.scan.canceled',
    { defaultMessage: 'Response action was canceled' }
  ),

  ra_scan_error_disabled: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.scan.disabled',
    { defaultMessage: 'Malware protection is disabled.' }
  ),

  'ra_scan_error_invalid-input': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.scan.invalidInput',
    { defaultMessage: 'Invalid absolute file path provided' }
  ),

  // Dev:
  // local disk path not found failure
  'ra_scan_error_not-found': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.scan.notFound',
    { defaultMessage: 'File path or folder was not found' }
  ),

  // Dev:
  // scan quota exceeded failure
  'ra_scan_error_queue-quota': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.scan.queueQuota',
    { defaultMessage: 'Too many scans are queued' }
  ),

  // Dev:
  // an error happened while scanning files, scan was not completed
  ra_scan_error_processing: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.scan.processingError',
    { defaultMessage: 'An error occurred while processing the scan' }
  ),

  // Dev:
  // scan was interrupted, for example: system shutdown, endpoint service stop/restart.
  // Endpoint does not track yet scan progress, that's why it can't resume
  'ra_scan_error_processing-interrupted': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.scan.processingInterrupted',
    { defaultMessage: 'The scan was interrupted' }
  ),

  // Dev:
  // scan success/completed
  ra_scan_success_done: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.scan.success',
    { defaultMessage: 'Scan complete' }
  ),

  // -----------------------------------------------------------------
  // MEMORY-DUMP CODES
  // -----------------------------------------------------------------
  'ra_memory-dump_error_canceled': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.memoryDump.canceled',
    { defaultMessage: 'Response action was canceled' }
  ),
  'ra_memory-dump_error_failure': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.memoryDump.failure',
    { defaultMessage: 'Unknown failure while capturing memory dump' }
  ),
  'ra_memory-dump_success_done': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.memoryDump.done',
    { defaultMessage: 'Memory dump complete' }
  ),
  'ra_memory-dump_error_invalid-input': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.memoryDump.invalidInput',
    { defaultMessage: 'The request provided for memory dump is invalid' }
  ),

  // DEV: process with pid or entity_id not foud
  'ra_memory-dump_error_not-found': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.memoryDump.notFound',
    { defaultMessage: 'The process for memory dump was not found' }
  ),

  // DEV: not permitted to dump protected process memory. Endpoint honors the OS system protection model
  // thus protected processes are not allowed to dump memory.
  'ra_memory-dump_error_not-permitted': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.memoryDump.notPermitted',
    { defaultMessage: 'Memory dump not permitted on protected processes' }
  ),

  // DEV: too many queued memory dump requests
  'ra_memory-dump_error_queue-full': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.memoryDump.queueFull',
    { defaultMessage: 'Too many memory-dump requests in queue' }
  ),

  'ra_memory-dump_error_io': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.memoryDump.ioError',
    { defaultMessage: 'A disk input/output error has occurred' }
  ),

  // DEV: A catch-all placeholder to indicate that action failed during processing memory dump with
  // a rare not generally expected code.
  'ra_memory-dump_error_processing': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.memoryDump.processingError',
    { defaultMessage: 'Memory dump failed during processing' }
  ),

  // DEV: processing interrupted by stop/shutdown/reboot. Action has been interrupted or could have
  // been just in the queue before shutdown. Nonetheless, since in this case all processes are gone,
  // action will fail
  'ra_memory-dump_error_processing-interrupted': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.memoryDump.processingInterruptedError',
    { defaultMessage: 'Memory dump action was interrupted' }
  ),

  // DEV: Fail early when disk space falls below free space threshold set via advanced Endpoint policy
  'ra_memory-dump_error_not-enough-free-space': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.memoryDump.insufficientDiskSpaceError',
    { defaultMessage: 'Host does not have sufficient disk space to capture a memory dump' }
  ),

  // -----------------------------------------------------------------
  // RUNSCRIPT CODES
  // -----------------------------------------------------------------
  ra_runscript_error_failure: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.errorFailure',
    { defaultMessage: 'Unknown failure while executing runscript' }
  ),
  ra_runscript_success_done: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.success',
    { defaultMessage: 'Runscript completed' }
  ),
  'ra_runscript_error_not-found': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.notFound',
    { defaultMessage: 'Script not found' }
  ),
  'ra_runscript_error_invalid-command': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.invalidCommand',
    { defaultMessage: 'The runscript command is invalid' }
  ),
  'ra_runscript_error_invalid-input': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.invalidInput',
    { defaultMessage: 'Script action input is invalid' }
  ),
  'ra_runscript_error_not-permitted': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.notPermitted',
    { defaultMessage: 'Misconfiguration - no permission to use Fleet API for script retrieval' }
  ),
  'ra_runscript_error_too-big': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.tooBig',
    { defaultMessage: 'Script too large' }
  ),
  // DEV: was too long in queue, because of no network, other action instance was stuck, etc
  'ra_runscript_error_queue-timeout': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.queueTimeout',
    { defaultMessage: 'Action timed out' }
  ),
  'ra_runscript_error_download-failed': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.downloadFailed',
    { defaultMessage: 'Failed to download script for execution' }
  ),
  'ra_runscript_error_api-unreachable': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.unreachable',
    { defaultMessage: 'Unable to download script for execution - Fleet Server API not reachable' }
  ),
  'ra_runscript_error_not-enough-free-space': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.notEnoughFreeSpace',
    { defaultMessage: 'Unable to execute script due to insufficient free space on host' }
  ),
  ra_runscript_error_canceled: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.canceled',
    { defaultMessage: 'Runscript was canceled' }
  ),
  ra_runscript_error_processing: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.processing',
    { defaultMessage: 'Error occurred during action processing' }
  ),
  'ra_runscript_error_upload-timeout': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.uploadTimeout',
    { defaultMessage: 'Runscript failed to upload script execution output' }
  ),
  'ra_runscript_error_processing-timeout': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.processingTimeout',
    { defaultMessage: 'Action processing timeout has been reached' }
  ),
  // DEV: reboot, etc
  'ra_runscript_error_processing-interrupted': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.processingInterrupted',
    { defaultMessage: 'Action has been interrupted' }
  ),
  'ra_runscript_error_disk-quota': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.runscript.diskQuota',
    { defaultMessage: 'Too many actions' }
  ),

  // -----------------------------------------------------------------
  // CANCEL CODES
  // -----------------------------------------------------------------
  ra_cancel_success_done: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.cancel.success',
    { defaultMessage: 'Action was successfully canceled' }
  ),
  ra_cancel_success_forced: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.cancel.forcedSuccess',
    { defaultMessage: 'Action was successfully canceled' }
  ),
  'ra_cancel_error_not-found': i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.cancel.notFound',
    { defaultMessage: 'Action to be canceled was not found (it may no longer be pending)' }
  ),
  ra_cancel_success_canceling: i18n.translate(
    'xpack.securitySolution.endpointActionResponseCodes.cancel.canceling',
    {
      defaultMessage:
        "The action is being cancelled - the remaining processing will terminate at the next safe point. Use '--force' to terminate it abruptly.",
    }
  ),
});

/**
 * A map of possible code's that can be returned from the endpoint for response actions
 */
export const endpointActionResponseCodes: Readonly<Record<string | keyof typeof CODES, string>> =
  CODES;
