/**
 * Parser for mongosh output format
 *
 * mongosh outputs JavaScript object notation which differs from JSON:
 * - Unquoted keys: { name: "value" } instead of { "name": "value" }
 * - MongoDB types: ObjectId("..."), ISODate("..."), NumberLong("..."), etc.
 * - Trailing commas are allowed
 *
 * This parser converts mongosh output to standard JavaScript objects.
 */

/**
 * Result of parsing mongosh output
 */
export interface MongoshParseResult {
  success: boolean
  data: unknown[]
  error?: string
}

/**
 * Strip mongosh result type wrappers like InsertManyResult { ... } -> { ... }
 * @param str - The mongosh output string
 * @returns String with type wrappers removed
 */
export function stripResultTypeWrappers(str: string): string {
  // Match result type names followed by whitespace and opening brace
  // InsertOneResult, InsertManyResult, UpdateResult, DeleteResult, BulkWriteResult, etc.
  const resultTypes: readonly string[] = [
    'InsertOneResult',
    'InsertManyResult',
    'UpdateResult',
    'DeleteResult',
    'BulkWriteResult',
    'ModifyResult'
  ]

  let result = str
  for (const typeName of resultTypes) {
    // Replace "TypeName {" with just "{"
    const pattern = new RegExp(typeName + '\\s*\\{', 'g')
    result = result.replace(pattern, '{')
  }

  return result
}

/**
 * Convert MongoDB shell type notation to EJSON-compatible format
 * @param str - The mongosh output string
 * @returns JSON-compatible string
 */
export function convertMongoshTypes(str: string): string {
  let result = str

  // Strip result type wrappers first
  result = stripResultTypeWrappers(result)

  // ObjectId("...") -> { "$oid": "..." }
  result = result.replace(/ObjectId\s*\(\s*["']([a-fA-F0-9]{24})["']\s*\)/g, '{"$oid":"$1"}')

  // ISODate("...") -> { "$date": "..." }
  result = result.replace(/ISODate\s*\(\s*["']([^"']+)["']\s*\)/g, '{"$date":"$1"}')

  // new Date("...") -> { "$date": "..." }
  result = result.replace(/new\s+Date\s*\(\s*["']([^"']+)["']\s*\)/g, '{"$date":"$1"}')

  // Timestamp(seconds, increment) -> { "$timestamp": { "t": seconds, "i": increment } }
  result = result.replace(/Timestamp\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/g, '{"$timestamp":{"t":$1,"i":$2}}')

  // NumberLong("...") or NumberLong(...) -> { "$numberLong": "..." }
  result = result.replace(/NumberLong\s*\(\s*["']?(-?\d+)["']?\s*\)/g, '{"$numberLong":"$1"}')

  // NumberInt(...) -> { "$numberInt": "..." }
  result = result.replace(/NumberInt\s*\(\s*["']?(-?\d+)["']?\s*\)/g, '{"$numberInt":"$1"}')

  // NumberDecimal("...") -> { "$numberDecimal": "..." }
  result = result.replace(/NumberDecimal\s*\(\s*["']([^"']+)["']\s*\)/g, '{"$numberDecimal":"$1"}')

  // BinData(subtype, "base64") -> { "$binary": { "base64": "...", "subType": "..." } }
  result = result.replace(
    /BinData\s*\(\s*(\d+)\s*,\s*["']([^"']+)["']\s*\)/g,
    (_: string, subType: string, base64: string) => `{"$binary":{"base64":"${base64}","subType":"${parseInt(subType).toString(16).padStart(2, '0')}"}}`
  )

  // UUID("...") -> { "$uuid": "..." }
  result = result.replace(/UUID\s*\(\s*["']([^"']+)["']\s*\)/g, '{"$uuid":"$1"}')

  // MinKey() -> { "$minKey": 1 }
  result = result.replace(/MinKey\s*\(\s*\)/g, '{"$minKey":1}')

  // MaxKey() -> { "$maxKey": 1 }
  result = result.replace(/MaxKey\s*\(\s*\)/g, '{"$maxKey":1}')

  // RegExp("/pattern/flags") or /pattern/flags -> { "$regularExpression": { "pattern": "...", "options": "..." } }
  result = result.replace(
    /\/([^/]+)\/([gimsuy]*)/g,
    (_match: string, pattern: string, flags: string) => `{"$regularExpression":{"pattern":"${pattern.replace(/"/g, '\\"')}","options":"${flags}"}}`
  )

  return result
}

/**
 * Convert single-quoted strings to double-quoted strings
 * @param str - String with potential single-quoted values
 * @returns String with double-quoted values
 */
export function convertSingleQuotesToDouble(str: string): string {
  // Match single-quoted strings and convert to double quotes
  // This handles: 'value', 'value with spaces', 'value\'s escaped'
  let result = ''
  let i = 0
  let inDoubleQuote = false
  let inSingleQuote = false

  while (i < str.length) {
    const char = str[i]
    const nextChar = str[i + 1]

    // Handle escape sequences
    if (char === '\\' && (inDoubleQuote || inSingleQuote)) {
      result += char + (nextChar || '')
      i += 2
      continue
    }

    // Toggle double quote state
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      result += char
      i++
      continue
    }

    // Handle single quotes
    if (char === "'" && !inDoubleQuote) {
      if (!inSingleQuote) {
        // Start of single-quoted string - convert to double quote
        inSingleQuote = true
        result += '"'
      } else {
        // End of single-quoted string - convert to double quote
        inSingleQuote = false
        result += '"'
      }
      i++
      continue
    }

    result += char
    i++
  }

  return result
}

/**
 * Quote unquoted object keys in JavaScript notation
 * @param str - The string with potentially unquoted keys
 * @returns String with quoted keys
 */
export function quoteUnquotedKeys(str: string): string {
  // Match unquoted keys: word characters followed by colon
  // But not inside strings and not already quoted
  // This regex handles most common cases
  return str.replace(
    /([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
    '$1"$2":'
  )
}

/**
 * Remove trailing commas from arrays and objects
 * @param str - JSON-like string with potential trailing commas
 * @returns Clean JSON string
 */
export function removeTrailingCommas(str: string): string {
  // Remove trailing commas before } or ]
  return str.replace(/,(\s*[}\]])/g, '$1')
}

/**
 * Parse mongosh output to JavaScript objects
 * @param output - Raw mongosh output
 * @returns Parse result with success flag, data array, and optional error
 */
export function parseMongoshOutput(output: unknown): MongoshParseResult {
  if (output === null || output === undefined || typeof output !== 'string') {
    return { success: false, data: [], error: 'Empty or invalid output' }
  }

  const trimmed = output.trim()

  if (trimmed === '') {
    return { success: true, data: [] }
  }

  // First, try parsing as valid JSON (already in correct format)
  try {
    const parsed: unknown = JSON.parse(trimmed)
    const data = Array.isArray(parsed) ? parsed : [parsed]
    return { success: true, data }
  } catch {
    // Not valid JSON, continue with conversion
  }

  // Try parsing as NDJSON (newline-delimited JSON)
  if (trimmed.includes('\n') && !trimmed.startsWith('[')) {
    const lines = trimmed.split('\n').filter(line => line.trim())
    const docs: unknown[] = []
    let allParsed = true

    for (const line of lines) {
      try {
        docs.push(JSON.parse(line))
      } catch {
        allParsed = false
        break
      }
    }

    if (allParsed && docs.length > 0) {
      return { success: true, data: docs }
    }
  }

  // Convert mongosh format to JSON
  try {
    let converted = trimmed

    // Step 1: Convert MongoDB types
    converted = convertMongoshTypes(converted)

    // Step 2: Convert single quotes to double quotes
    converted = convertSingleQuotesToDouble(converted)

    // Step 3: Quote unquoted keys
    converted = quoteUnquotedKeys(converted)

    // Step 4: Remove trailing commas
    converted = removeTrailingCommas(converted)

    // Step 5: Try to parse
    const parsed: unknown = JSON.parse(converted)
    const data = Array.isArray(parsed) ? parsed : [parsed]
    return { success: true, data }
  } catch (e) {
    // If conversion failed, try line-by-line for mongosh output
    const lines = trimmed.split('\n').filter(line => line.trim())
    const docs: unknown[] = []

    for (const line of lines) {
      try {
        let converted = line
        converted = convertMongoshTypes(converted)
        converted = convertSingleQuotesToDouble(converted)
        converted = quoteUnquotedKeys(converted)
        converted = removeTrailingCommas(converted)
        docs.push(JSON.parse(converted))
      } catch {
        // Skip lines that can't be parsed (like cursor info, etc.)
      }
    }

    if (docs.length > 0) {
      return { success: true, data: docs }
    }

    const errorMessage = e instanceof Error ? e.message : String(e)
    return {
      success: false,
      data: [],
      error: `Failed to parse mongosh output: ${errorMessage}`
    }
  }
}

export default parseMongoshOutput
