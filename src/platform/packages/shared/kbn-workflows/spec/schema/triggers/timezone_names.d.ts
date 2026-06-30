/**
 * IANA timezone names list
 *
 * Hardcoded to avoid bundling moment-timezone data (~900KB) in plugins.
 * Source: moment.tz.names() output
 *
 * If timezone support needs updating, regenerate from latest moment-timezone
 * using: `require('moment-timezone').tz.names()`
 */
export declare const timezoneNames: string[];
