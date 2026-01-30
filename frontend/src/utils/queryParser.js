// Check if a query is a simple find that can be handled by the Go driver
// Returns true for: empty, filter objects, or proper db.x.find({...}) syntax
export function isSimpleFindQuery(query) {
  const trimmed = (query || '').trim()
  // Empty or just a filter object - Go driver can handle
  if (!trimmed || trimmed.startsWith('{')) return true
  // Multi-statement scripts are not simple queries
  if (trimmed.includes(';')) return false
  // Must be db.something.find({...}) with proper parentheses at the end
  const findMatch = trimmed.match(/\.find\s*\(\s*([\s\S]*)\s*\)\s*$/)
  return findMatch !== null
}

// Split find() arguments into filter and projection, respecting nested braces
// Returns { filter, projection } where projection may be null
function splitFindArguments(argsStr) {
  const trimmed = argsStr.trim()
  if (!trimmed) return { filter: '{}', projection: null }

  // Track brace depth to find the comma that separates filter from projection
  let depth = 0
  let inString = false
  let stringChar = null
  let splitIndex = -1

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i]
    const prevChar = i > 0 ? trimmed[i - 1] : ''

    // Handle string boundaries
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true
        stringChar = char
      } else if (char === stringChar) {
        inString = false
        stringChar = null
      }
      continue
    }

    if (inString) continue

    // Track brace/bracket depth
    if (char === '{' || char === '[') depth++
    if (char === '}' || char === ']') depth--

    // Found top-level comma - this separates filter from projection
    if (char === ',' && depth === 0) {
      splitIndex = i
      break
    }
  }

  if (splitIndex === -1) {
    // No projection, just filter
    return { filter: trimmed || '{}', projection: null }
  }

  const filter = trimmed.slice(0, splitIndex).trim() || '{}'
  const projection = trimmed.slice(splitIndex + 1).trim() || null

  return { filter, projection }
}

// Parse filter from full MongoDB query string like db.getCollection("col").find({...})
// Extracts the filter and sends to backend - let MongoDB validate it
export function parseFilterFromQuery(queryStr) {
  const trimmed = queryStr.trim()

  // Handle empty input
  if (!trimmed) {
    return '{}'
  }

  // If it's just a JSON object, use it directly
  if (trimmed.startsWith('{')) {
    return trimmed
  }

  // Try to extract content from .find(...) - get everything between the parentheses
  // This handles both db.getCollection("x").find({}) and db.collection.find({})
  const findMatch = trimmed.match(/\.find\s*\(\s*([\s\S]*)\s*\)/)
  if (findMatch) {
    const content = findMatch[1].trim()
    if (!content) return '{}'
    // Split into filter and projection, return only filter
    const { filter } = splitFindArguments(content)
    return filter
  }

  // If contains .find but no parentheses, send empty string to let backend error
  if (trimmed.includes('.find')) {
    return ''
  }

  // Fallback - send as-is and let backend handle it
  return trimmed || '{}'
}

// Parse projection from full MongoDB query string
// Returns null if no projection specified
export function parseProjectionFromQuery(queryStr) {
  const trimmed = queryStr.trim()

  // Handle empty input or plain filter objects (no projection possible)
  if (!trimmed || trimmed.startsWith('{')) {
    return null
  }

  // Try to extract content from .find(...)
  const findMatch = trimmed.match(/\.find\s*\(\s*([\s\S]*)\s*\)/)
  if (findMatch) {
    const content = findMatch[1].trim()
    if (!content) return null
    const { projection } = splitFindArguments(content)
    return projection
  }

  return null
}

// Build full MongoDB query string for display
export function buildFullQuery(collection, filter) {
  return `db.getCollection("${collection}").find(${filter})`
}

// Write operations that don't automatically print output in mongosh --eval
const WRITE_OPERATIONS = [
  'insertOne', 'insertMany',
  'updateOne', 'updateMany',
  'deleteOne', 'deleteMany',
  'replaceOne', 'bulkWrite',
  'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
  'drop', 'createIndex', 'dropIndex', 'dropIndexes',
  'createCollection', 'renameCollection'
]

// Check if script already has output mechanisms
function hasOutputMechanism(script) {
  return /printjson\s*\(|print\s*\(|console\.log\s*\(|\.toArray\s*\(\s*\)/.test(script)
}

// Find the last statement in a script (splits by semicolon, respecting strings)
function getLastStatement(script) {
  const trimmed = script.trim()

  // Remove trailing semicolons and whitespace to find actual last statement
  const withoutTrailingSemicolons = trimmed.replace(/;\s*$/, '')

  let lastSemicolon = -1
  let inString = false
  let stringChar = null

  for (let i = 0; i < withoutTrailingSemicolons.length; i++) {
    const char = withoutTrailingSemicolons[i]
    const prevChar = i > 0 ? withoutTrailingSemicolons[i - 1] : ''

    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true
      stringChar = char
    } else if (inString && char === stringChar && prevChar !== '\\') {
      inString = false
      stringChar = null
    } else if (!inString && char === ';') {
      lastSemicolon = i
    }
  }

  if (lastSemicolon === -1) {
    return { prefix: '', lastStatement: withoutTrailingSemicolons }
  }

  return {
    prefix: withoutTrailingSemicolons.substring(0, lastSemicolon + 1),
    lastStatement: withoutTrailingSemicolons.substring(lastSemicolon + 1).trim()
  }
}

// Check if a statement ends with a write operation
function endsWithWriteOperation(statement) {
  const pattern = new RegExp(
    `\\.(${WRITE_OPERATIONS.join('|')})\\s*\\([^]*\\)\\s*;?\\s*$`
  )
  return pattern.test(statement)
}

// Check if statement is a variable assignment containing a write operation
// Returns { isAssignment: boolean, varName: string | null, hasWriteOp: boolean }
function parseVariableAssignment(statement) {
  // Match: var/let/const varName = ... writeOperation(...)
  const assignmentMatch = statement.match(/^(var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/)
  if (!assignmentMatch) {
    return { isAssignment: false, varName: null, hasWriteOp: false }
  }

  const varName = assignmentMatch[2]
  const writeOpPattern = new RegExp(`\\.(${WRITE_OPERATIONS.join('|')})\\s*\\(`)
  const hasWriteOp = writeOpPattern.test(statement)

  return { isAssignment: true, varName, hasWriteOp }
}

// Find all variable assignments with write operations in the script
function findAllWriteOpVariables(script) {
  const variables = []

  // Split by semicolons, respecting strings
  let currentStatement = ''
  let inString = false
  let stringChar = null

  for (let i = 0; i < script.length; i++) {
    const char = script[i]
    const prevChar = i > 0 ? script[i - 1] : ''

    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true
      stringChar = char
    } else if (inString && char === stringChar && prevChar !== '\\') {
      inString = false
      stringChar = null
    }

    if (!inString && char === ';') {
      const trimmedStatement = currentStatement.trim()
      if (trimmedStatement) {
        const { isAssignment, varName, hasWriteOp } = parseVariableAssignment(trimmedStatement)
        if (isAssignment && hasWriteOp && varName) {
          variables.push(varName)
        }
      }
      currentStatement = ''
    } else {
      currentStatement += char
    }
  }

  // Handle last statement (no trailing semicolon)
  const trimmedStatement = currentStatement.trim()
  if (trimmedStatement) {
    const { isAssignment, varName, hasWriteOp } = parseVariableAssignment(trimmedStatement)
    if (isAssignment && hasWriteOp && varName) {
      variables.push(varName)
    }
  }

  return variables
}

/**
 * Wrap script with printjson if it contains write operations that don't produce output
 * @param {string} script - The mongosh script
 * @returns {string} - Script with printjson wrapper if needed
 */
export function wrapScriptForOutput(script) {
  const trimmed = (script || '').trim()

  // Empty script
  if (!trimmed) return trimmed

  // Already has output mechanism
  if (hasOutputMechanism(trimmed)) return trimmed

  // Get the last statement
  const { prefix, lastStatement } = getLastStatement(trimmed)

  // Find all variable assignments with write operations
  const writeOpVars = findAllWriteOpVariables(trimmed)

  if (writeOpVars.length > 1) {
    // Multiple write operation variables - print them all as an object
    const varsObj = writeOpVars.join(', ')
    return trimmed + '; printjson({ ' + varsObj + ' })'
  }

  if (writeOpVars.length === 1) {
    // Single write operation variable - print just that
    return trimmed + '; printjson(' + writeOpVars[0] + ')'
  }

  // Check if last statement is a direct write operation (not an assignment)
  if (lastStatement && endsWithWriteOperation(lastStatement)) {
    const { isAssignment } = parseVariableAssignment(lastStatement)
    if (!isAssignment) {
      // Remove trailing semicolon from last statement for wrapping
      const cleanLast = lastStatement.replace(/;\s*$/, '')
      return prefix + (prefix ? ' ' : '') + `printjson(${cleanLast})`
    }
  }

  return trimmed
}
