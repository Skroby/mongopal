/**
 * Error parser utility for providing actionable hints to common MongoDB/application errors.
 *
 * Parses error messages and provides:
 * - A user-friendly message explaining the issue
 * - A hint with guidance on how to resolve it
 * - An optional action (e.g., 'editConnection', 'openSettings')
 * - The original raw error for debugging
 */

/**
 * Action types that can be suggested for error resolution.
 */
export type ErrorAction = 'editConnection' | 'openSettings' | 'openLink' | null

/**
 * Error pattern definition structure.
 * Each pattern has:
 * - patterns: Array of RegExp to match against the error message
 * - friendlyMessage: User-friendly description of the error
 * - hint: Actionable guidance on how to resolve
 * - action: Optional action identifier for buttons/links
 * - actionLabel: Label for the action button
 * - actionData: Optional data for the action (e.g., URL)
 */
interface ErrorPatternDefinition {
  patterns: RegExp[]
  friendlyMessage: string
  hint: string
  action: ErrorAction
  actionLabel: string | null
  actionData?: string
}

/**
 * Parsed error information returned by parseError.
 */
export interface ParsedError {
  /** Original error message */
  raw: string
  /** User-friendly description of the error */
  friendlyMessage: string
  /** Actionable guidance on how to resolve */
  hint: string
  /** Optional action identifier for buttons/links */
  action: ErrorAction
  /** Optional action button label */
  actionLabel: string | null
  /** Optional action data (e.g., URL) */
  actionData: string | null
  /** Whether the error matched a known pattern */
  isKnown: boolean
}

/**
 * Input type for error parsing functions.
 * Can be an Error object, a string, or null/undefined.
 */
export type ErrorInput = Error | string | null | undefined

const ERROR_PATTERNS: ErrorPatternDefinition[] = [
  // Connection errors
  {
    patterns: [
      /connection.*refused/i,
      /ECONNREFUSED/i,
      /failed to connect/i,
      /no reachable servers/i,
      /server selection.*timeout/i,
      /cannot connect to/i,
    ],
    friendlyMessage: 'Unable to connect to MongoDB server',
    hint: 'Check that MongoDB is running and the connection URI is correct. Verify the host and port are accessible.',
    action: 'editConnection',
    actionLabel: 'Edit Connection',
  },
  {
    patterns: [
      /authentication failed/i,
      /auth.*failed/i,
      /not authorized/i,
      /authentication error/i,
      /bad auth/i,
      /invalid username\/password/i,
      /SCRAM.*authentication/i,
    ],
    friendlyMessage: 'Authentication failed',
    hint: 'Verify your username and password are correct. Check that the user has access to the specified database.',
    action: 'editConnection',
    actionLabel: 'Edit Connection',
  },
  {
    patterns: [
      /timeout/i,
      /context deadline exceeded/i,
      /operation.*timed out/i,
    ],
    friendlyMessage: 'Operation timed out',
    hint: 'The operation took too long to complete. This could be due to a slow network, large dataset, or server load. Try again or increase the timeout in settings.',
    action: 'openSettings',
    actionLabel: 'Open Settings',
  },
  {
    patterns: [
      /network.*error/i,
      /ENETUNREACH/i,
      /EHOSTUNREACH/i,
      /getaddrinfo.*ENOTFOUND/i,
      /DNS.*resolution/i,
    ],
    friendlyMessage: 'Network error',
    hint: 'Check your network connection and verify the MongoDB server hostname is correct.',
    action: 'editConnection',
    actionLabel: 'Edit Connection',
  },
  {
    patterns: [
      /certificate/i,
      /SSL/i,
      /TLS/i,
      /x509/i,
      /handshake.*failed/i,
    ],
    friendlyMessage: 'SSL/TLS connection error',
    hint: 'There was an issue with the secure connection. Check your SSL/TLS settings and certificate configuration.',
    action: 'editConnection',
    actionLabel: 'Edit Connection',
  },

  // Permission errors
  {
    patterns: [
      /not authorized on/i,
      /requires authentication/i,
      /user is not allowed/i,
      /permission denied/i,
      /insufficient privileges/i,
      /Unauthorized/i,
    ],
    friendlyMessage: 'Permission denied',
    hint: "The current user does not have permission for this operation. Check the user's roles and database permissions.",
    action: null,
    actionLabel: null,
  },

  // JSON/Query syntax errors
  {
    patterns: [
      /invalid JSON/i,
      /Unexpected token/i,
      /JSON\.parse/i,
      /SyntaxError.*JSON/i,
    ],
    friendlyMessage: 'Invalid JSON syntax',
    hint: 'Check your JSON for syntax errors. Common issues include missing quotes around strings, trailing commas, or unescaped special characters.',
    action: null,
    actionLabel: null,
  },
  {
    patterns: [
      /invalid query/i,
      /query.*syntax/i,
      /cannot parse/i,
      /Expected.*find/i,
      /Invalid.*filter/i,
    ],
    friendlyMessage: 'Invalid query syntax',
    hint: 'Check your query syntax. Use db.collection.find({}) format or a valid JSON filter object.',
    action: null,
    actionLabel: null,
  },
  {
    patterns: [
      /operator.*not allowed/i,
      /unknown.*operator/i,
      /\$[a-z]+.*not recognized/i,
      /bad query/i,
    ],
    friendlyMessage: 'Invalid query operator',
    hint: "Check that you're using valid MongoDB query operators (e.g., $eq, $gt, $in). Refer to MongoDB documentation for supported operators.",
    action: null,
    actionLabel: null,
  },

  // Document errors
  {
    patterns: [
      /duplicate key/i,
      /E11000/i,
    ],
    friendlyMessage: 'Duplicate key error',
    hint: 'A document with this _id or unique index value already exists. Use a different value or update the existing document.',
    action: null,
    actionLabel: null,
  },
  {
    patterns: [
      /document.*not found/i,
      /no document.*found/i,
      /does not exist/i,
    ],
    friendlyMessage: 'Document not found',
    hint: "The document you're looking for may have been deleted or the ID is incorrect. Refresh the collection view.",
    action: null,
    actionLabel: null,
  },
  {
    patterns: [
      /document.*too large/i,
      /object size.*exceeded/i,
      /BSON.*too large/i,
      /16MB/i,
    ],
    friendlyMessage: 'Document too large',
    hint: 'MongoDB documents are limited to 16MB. Consider splitting large data into multiple documents or using GridFS for large files.',
    action: null,
    actionLabel: null,
  },

  // Mongosh/Script errors
  {
    patterns: [
      /mongosh.*not available/i,
      /install mongosh/i,
      /mongosh.*not found/i,
    ],
    friendlyMessage: 'mongosh is not installed',
    hint: 'Complex queries and scripts require mongosh. Install it from mongodb.com/try/download/shell',
    action: 'openLink',
    actionLabel: 'Download mongosh',
    actionData: 'https://www.mongodb.com/try/download/shell',
  },
  {
    patterns: [
      /script.*execution failed/i,
      /ReferenceError/i,
      /TypeError.*is not/i,
    ],
    friendlyMessage: 'Script execution error',
    hint: 'There was an error in your script. Check for typos, undefined variables, or incorrect method calls.',
    action: null,
    actionLabel: null,
  },

  // Collection/Database errors
  {
    patterns: [
      /namespace.*not found/i,
      /collection.*not found/i,
      /ns not found/i,
    ],
    friendlyMessage: 'Collection not found',
    hint: 'The specified collection does not exist. It may have been dropped or the name is incorrect.',
    action: null,
    actionLabel: null,
  },
  {
    patterns: [
      /database.*not found/i,
      /db.*doesn't exist/i,
    ],
    friendlyMessage: 'Database not found',
    hint: 'The specified database does not exist. It may have been dropped or the name is incorrect.',
    action: null,
    actionLabel: null,
  },

  // Disk/Resource errors
  {
    patterns: [
      /disk.*full/i,
      /no space left/i,
      /write concern/i,
      /journal.*error/i,
    ],
    friendlyMessage: 'Disk or storage error',
    hint: 'There may be a disk space issue on the MongoDB server. Contact your database administrator.',
    action: null,
    actionLabel: null,
  },

  // Import/Export errors
  {
    patterns: [
      /invalid.*archive/i,
      /failed to read/i,
      /corrupt.*file/i,
      /invalid.*zip/i,
    ],
    friendlyMessage: 'Invalid or corrupt file',
    hint: 'The file may be corrupted or in an unsupported format. Try exporting again or use a different file.',
    action: null,
    actionLabel: null,
  },
]

/**
 * Parse an error message and return actionable information.
 *
 * @param error - The error message or Error object
 * @returns Parsed error info with:
 *   - raw: Original error message
 *   - friendlyMessage: User-friendly description
 *   - hint: Actionable guidance
 *   - action: Optional action identifier
 *   - actionLabel: Optional action button label
 *   - actionData: Optional action data (e.g., URL)
 *   - isKnown: Whether the error matched a known pattern
 */
export function parseError(error: ErrorInput): ParsedError {
  const rawMessage = error instanceof Error ? error.message : String(error || '')

  // Try to match against known patterns
  for (const errorDef of ERROR_PATTERNS) {
    for (const pattern of errorDef.patterns) {
      if (pattern.test(rawMessage)) {
        return {
          raw: rawMessage,
          friendlyMessage: errorDef.friendlyMessage,
          hint: errorDef.hint,
          action: errorDef.action,
          actionLabel: errorDef.actionLabel,
          actionData: errorDef.actionData ?? null,
          isKnown: true,
        }
      }
    }
  }

  // Return generic response for unknown errors
  return {
    raw: rawMessage,
    friendlyMessage: 'An error occurred',
    hint: 'Check the error details below for more information.',
    action: null,
    actionLabel: null,
    actionData: null,
    isKnown: false,
  }
}

/**
 * Check if an error message matches a specific action type.
 * Useful for conditionally showing action buttons.
 *
 * @param error - The error message or Error object
 * @param actionType - The action type to check for
 * @returns Whether the error has the specified action
 */
export function errorHasAction(error: ErrorInput, actionType: ErrorAction): boolean {
  const parsed = parseError(error)
  return parsed.action === actionType
}

/**
 * Get a short summary suitable for toast notifications.
 * Uses the friendly message if available, otherwise truncates the raw message.
 *
 * @param error - The error message or Error object
 * @param maxLength - Maximum length for the summary (default: 100)
 * @returns A short summary of the error
 */
export function getErrorSummary(error: ErrorInput, maxLength: number = 100): string {
  const parsed = parseError(error)

  if (parsed.isKnown) {
    return parsed.friendlyMessage
  }

  // Truncate raw message if too long
  if (parsed.raw.length <= maxLength) {
    return parsed.raw
  }

  return parsed.raw.slice(0, maxLength - 3) + '...'
}

export default {
  parseError,
  errorHasAction,
  getErrorSummary,
}
