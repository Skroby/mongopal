/**
 * Field validation utilities for MongoDB queries.
 * Extracts field names from queries and validates against collection schema.
 */

/**
 * Warning object for field validation
 */
export interface FieldWarning {
  field: string
  message: string
}

/**
 * Monaco diagnostic object with position information
 */
export interface MonacoDiagnostic {
  message: string
  severity: number
  startLine: number
  startCol: number
  endLine: number
  endCol: number
}

/**
 * Position in text (1-indexed for Monaco)
 */
interface TextPosition {
  line: number
  column: number
}

/**
 * Query object that can contain MongoDB query operators and field conditions
 */
type QueryValue = unknown
type QueryObject = Record<string, QueryValue>

/**
 * MongoDB query operators that should not be treated as field names
 */
const QUERY_OPERATORS = new Set([
  // Comparison
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin',
  // Logical
  '$and', '$or', '$not', '$nor',
  // Element
  '$exists', '$type',
  // Evaluation
  '$expr', '$jsonSchema', '$mod', '$regex', '$text', '$where',
  // Geospatial
  '$geoIntersects', '$geoWithin', '$near', '$nearSphere',
  // Array
  '$all', '$elemMatch', '$size',
  // Bitwise
  '$bitsAllClear', '$bitsAllSet', '$bitsAnyClear', '$bitsAnySet',
  // Projection
  '$', '$meta', '$slice',
  // Update (in case they appear in queries)
  '$set', '$unset', '$inc', '$push', '$pull', '$addToSet', '$pop', '$rename',
  // Aggregation
  '$match', '$project', '$group', '$sort', '$limit', '$skip', '$lookup',
  '$unwind', '$count', '$facet', '$bucket', '$bucketAuto', '$out', '$merge',
  // Options
  '$options', '$search',
])

/**
 * Extract field names from a parsed query object
 * @param queryObj - Parsed query object
 * @returns Set of field names found in the query
 */
export function extractFieldNamesFromObject(queryObj: unknown): Set<string> {
  const fieldNames = new Set<string>()

  function traverse(obj: unknown, currentPath: string = ''): void {
    if (!obj || typeof obj !== 'object') return

    // Handle arrays (e.g., $and, $or conditions)
    if (Array.isArray(obj)) {
      for (const item of obj) {
        traverse(item, currentPath)
      }
      return
    }

    const queryObject = obj as QueryObject
    for (const [key, value] of Object.entries(queryObject)) {
      // Skip operators
      if (key.startsWith('$')) {
        // But traverse into operator values (e.g., $and: [...], $or: [...])
        if (QUERY_OPERATORS.has(key) && value !== null && typeof value === 'object') {
          traverse(value, currentPath)
        }
        continue
      }

      // This is a field name
      const fullPath = currentPath ? `${currentPath}.${key}` : key
      fieldNames.add(fullPath)

      // Traverse nested conditions but not further into the value structure
      // unless it contains more operators
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Check if value contains operators or nested field conditions
        const valueObj = value as QueryObject
        const valueKeys = Object.keys(valueObj)
        const hasOperators = valueKeys.some(k => k.startsWith('$'))

        if (hasOperators) {
          // This is { field: { $gt: 5 } } - don't traverse deeper for field names
          // but do traverse operator values
          for (const [vKey, vVal] of Object.entries(valueObj)) {
            if (vKey.startsWith('$') && vVal !== null && typeof vVal === 'object') {
              // For $elemMatch, traverse to find nested field conditions
              if (vKey === '$elemMatch') {
                traverse(vVal, fullPath)
              }
            }
          }
        } else {
          // This is nested object query like { "address.city": "NYC" }
          // The key itself is the full dotted path, don't traverse
        }
      }
    }
  }

  traverse(queryObj)
  return fieldNames
}

/**
 * Parse a JSON filter string and extract field names
 * @param filterStr - JSON filter string (e.g., '{ "name": "test" }')
 * @returns Set of field names, or empty set if parse fails
 */
export function extractFieldNamesFromFilter(filterStr: string | null | undefined): Set<string> {
  if (!filterStr || filterStr.trim() === '' || filterStr.trim() === '{}') {
    return new Set()
  }

  try {
    const parsed: unknown = JSON.parse(filterStr)
    return extractFieldNamesFromObject(parsed)
  } catch {
    // Could not parse as JSON - might be invalid or use extended syntax
    return new Set()
  }
}

/**
 * Validate field names against known schema fields
 * @param queryFields - Field names used in query
 * @param schemaFields - Known field names from schema
 * @returns Array of warnings for unknown fields
 */
export function validateFieldNames(
  queryFields: Set<string> | null | undefined,
  schemaFields: Set<string> | null | undefined
): FieldWarning[] {
  if (!queryFields || !schemaFields || schemaFields.size === 0) {
    return []
  }

  const warnings: FieldWarning[] = []

  for (const field of queryFields) {
    // Check exact match
    if (schemaFields.has(field)) {
      continue
    }

    // Check if it's a prefix of a known field (nested field access)
    // e.g., "address" when we have "address.city" and "address.street"
    let isPrefix = false
    for (const schemaField of schemaFields) {
      if (schemaField.startsWith(field + '.')) {
        isPrefix = true
        break
      }
    }

    if (isPrefix) {
      continue
    }

    // Check if it's a nested path of a known field
    // e.g., "address.zip" when we have "address" as an object type
    const pathParts = field.split('.')
    let isNestedPath = false
    for (let i = pathParts.length - 1; i > 0; i--) {
      const parentPath = pathParts.slice(0, i).join('.')
      if (schemaFields.has(parentPath)) {
        // Parent exists - could be accessing a sub-field not in sample
        isNestedPath = true
        break
      }
    }

    if (isNestedPath) {
      // Parent exists but this specific path wasn't sampled - still warn but softer
      warnings.push({
        field,
        message: `Unknown field '${field}' (not found in sampled documents)`
      })
    } else {
      // Completely unknown field
      warnings.push({
        field,
        message: `Unknown field '${field}'`
      })
    }
  }

  return warnings
}

/**
 * All-in-one function to validate a filter string against schema
 * @param filterStr - JSON filter string
 * @param schemaFields - Known field names from schema
 * @returns Array of warnings
 */
export function validateFilter(
  filterStr: string | null | undefined,
  schemaFields: Set<string> | null | undefined
): FieldWarning[] {
  const queryFields = extractFieldNamesFromFilter(filterStr)
  return validateFieldNames(queryFields, schemaFields)
}

/**
 * Find the position of a substring in a multiline string.
 * Returns { line, column } (1-indexed for Monaco).
 */
function findPosition(text: string, index: number): TextPosition {
  const lines = text.substring(0, index).split('\n')
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Find positions of field names in query text and return Monaco-compatible diagnostics.
 * @param queryText - Full query text (e.g., db.collection.find({...}))
 * @param warnings - Field validation warnings
 * @returns Array of diagnostic objects with positions
 */
export function fieldWarningsToMonacoDiagnostics(
  queryText: string | null | undefined,
  warnings: FieldWarning[] | null | undefined
): MonacoDiagnostic[] {
  if (!queryText || !warnings || warnings.length === 0) {
    return []
  }

  const diagnostics: MonacoDiagnostic[] = []

  for (const warning of warnings) {
    const fieldName = warning.field
    // Look for the field name as a key in the query (with or without quotes)
    // Pattern matches: "fieldName": or fieldName: (as key, not value)
    const patterns = [
      new RegExp(`"${escapeRegex(fieldName)}"\\s*:`, 'g'),  // "field":
      new RegExp(`'${escapeRegex(fieldName)}'\\s*:`, 'g'),  // 'field':
      new RegExp(`([{,]\\s*)${escapeRegex(fieldName)}\\s*:`, 'g'),  // field: (unquoted)
    ]

    let found = false
    for (const pattern of patterns) {
      let match: RegExpExecArray | null
      while ((match = pattern.exec(queryText)) !== null) {
        // Calculate the actual field position within the match
        let fieldStart = match.index
        if (match[1]) {
          // For unquoted pattern, skip the leading {, or whitespace
          fieldStart += match[1].length
        } else if (match[0].startsWith('"') || match[0].startsWith("'")) {
          // For quoted patterns, skip the opening quote
          fieldStart += 1
        }

        const pos = findPosition(queryText, fieldStart)
        const endPos = findPosition(queryText, fieldStart + fieldName.length)

        diagnostics.push({
          message: warning.message,
          severity: 4, // Warning (yellow squiggle)
          startLine: pos.line,
          startCol: pos.column,
          endLine: endPos.line,
          endCol: endPos.column,
        })
        found = true
      }
    }

    // If not found with above patterns, try a simpler search
    if (!found) {
      const simpleIndex = queryText.indexOf(fieldName)
      if (simpleIndex !== -1) {
        const pos = findPosition(queryText, simpleIndex)
        diagnostics.push({
          message: warning.message,
          severity: 4,
          startLine: pos.line,
          startCol: pos.column,
          endLine: pos.line,
          endCol: pos.column + fieldName.length,
        })
      }
    }
  }

  return diagnostics
}
