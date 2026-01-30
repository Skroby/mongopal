/**
 * Pure utility functions for TableView component.
 * These functions are extracted for testability and reusability.
 */

/**
 * Get document ID as string for selection tracking and API calls.
 * For ObjectId: returns hex string; For complex types: returns Extended JSON.
 * @param {Object} doc - MongoDB document
 * @returns {string|null} Document ID as string
 */
export function getDocId(doc) {
  if (!doc || !doc._id) return null
  if (typeof doc._id === 'string') return doc._id
  if (doc._id.$oid) return doc._id.$oid
  // For Binary, UUID, and other complex types, return Extended JSON
  return JSON.stringify(doc._id)
}

/**
 * Format a value for display (returns object with type and display string).
 * @param {*} value - The value to format
 * @returns {{ type: string, display: string }} Formatted value info
 */
export function formatValue(value) {
  if (value === null) {
    return { type: 'null', display: 'null' }
  }
  if (value === undefined) {
    return { type: 'undefined', display: 'undefined' }
  }
  if (typeof value === 'boolean') {
    return { type: 'boolean', display: String(value), boolValue: value }
  }
  if (typeof value === 'number') {
    return { type: 'number', display: String(value) }
  }
  if (typeof value === 'string') {
    // Truncate long strings
    if (value.length > 50) {
      return { type: 'string', display: value.slice(0, 50) + '...', truncated: true }
    }
    return { type: 'string', display: value }
  }
  if (Array.isArray(value)) {
    return { type: 'array', display: `[${value.length} items]`, length: value.length }
  }
  if (typeof value === 'object') {
    // Check for special BSON types
    if (value.$date !== undefined) {
      try {
        // Handle both string and { $numberLong: "..." } formats
        const dateValue = typeof value.$date === 'object' && value.$date.$numberLong
          ? parseInt(value.$date.$numberLong, 10)
          : value.$date
        const date = new Date(dateValue)
        if (isNaN(date.getTime())) {
          return { type: 'date', display: 'Invalid Date', invalid: true }
        }
        return { type: 'date', display: date.toISOString() }
      } catch {
        return { type: 'date', display: 'Invalid Date', invalid: true }
      }
    }
    if (value.$oid) {
      return { type: 'objectId', display: `ObjectId("${value.$oid.slice(0, 8)}...")`, fullId: value.$oid }
    }
    if (value.$numberLong) {
      return { type: 'numberLong', display: value.$numberLong }
    }
    if (value.$numberInt) {
      return { type: 'numberInt', display: value.$numberInt }
    }
    if (value.$numberDouble) {
      return { type: 'numberDouble', display: value.$numberDouble }
    }
    if (value.$binary) {
      const base64 = value.$binary.base64 || ''
      return { type: 'binary', display: `Binary("${base64.slice(0, 12)}...")`, base64 }
    }
    if (value.$uuid) {
      return { type: 'uuid', display: `UUID("${value.$uuid.slice(0, 8)}...")`, uuid: value.$uuid }
    }
    return { type: 'object', display: '{...}' }
  }
  return { type: 'unknown', display: String(value) }
}

/**
 * Get raw value for copying to clipboard.
 * @param {*} value - The value to convert
 * @returns {string} String representation of the value
 */
export function getRawValue(value) {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

/**
 * Get value at a dot-notation path (e.g., "address.city").
 * @param {Object} obj - Object to traverse
 * @param {string} path - Dot-notation path
 * @returns {*} Value at path or undefined
 */
export function getNestedValue(obj, path) {
  if (!path) return undefined
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

/**
 * Check if a value is a plain nested object (not a BSON type).
 * @param {*} value - Value to check
 * @returns {boolean} True if value is an expandable object
 */
export function isExpandableObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  // Check for special BSON types - these should NOT be expanded
  if (value.$date !== undefined) return false
  if (value.$oid) return false
  if (value.$numberLong) return false
  if (value.$numberInt) return false
  if (value.$numberDouble) return false
  if (value.$binary) return false
  if (value.$uuid) return false
  if (value.$timestamp) return false
  if (value.$regularExpression) return false
  if (value.$minKey) return false
  if (value.$maxKey) return false
  return true
}

/**
 * Get sub-keys from a nested object across all documents.
 * @param {Array<Object>} documents - Array of documents
 * @param {string} columnPath - Dot-notation path to the column
 * @returns {string[]} Sorted array of sub-key names
 */
export function getNestedKeys(documents, columnPath) {
  const subKeys = new Set()
  documents.forEach(doc => {
    const value = getNestedValue(doc, columnPath)
    if (isExpandableObject(value)) {
      Object.keys(value).forEach(key => subKeys.add(key))
    }
  })
  return Array.from(subKeys).sort()
}

/**
 * Check if a column contains expandable objects in any document.
 * @param {Array<Object>} documents - Array of documents
 * @param {string} columnPath - Dot-notation path to the column
 * @returns {boolean} True if column has expandable objects
 */
export function columnHasExpandableObjects(documents, columnPath) {
  return documents.some(doc => {
    const value = getNestedValue(doc, columnPath)
    return isExpandableObject(value)
  })
}

/**
 * Extract columns from documents, handling expanded columns.
 * @param {Array<Object>} documents - Array of documents
 * @param {Set<string>} expandedColumns - Set of expanded column paths
 * @returns {string[]} Array of column names/paths
 */
export function extractColumns(documents, expandedColumns = new Set()) {
  const columnSet = new Set()
  documents.forEach(doc => {
    Object.keys(doc).forEach(key => columnSet.add(key))
  })

  // Sort columns: _id first, then alphabetically
  let columns = Array.from(columnSet).sort((a, b) => {
    if (a === '_id') return -1
    if (b === '_id') return 1
    return a.localeCompare(b)
  })

  // Expand columns that are marked as expanded
  const result = []
  for (const col of columns) {
    if (expandedColumns.has(col)) {
      // Get sub-keys and add them as column.subkey
      const subKeys = getNestedKeys(documents, col)
      if (subKeys.length > 0) {
        subKeys.forEach(subKey => {
          const subPath = `${col}.${subKey}`
          // Check if this sub-column is also expanded
          if (expandedColumns.has(subPath)) {
            const deepSubKeys = getNestedKeys(documents, subPath)
            if (deepSubKeys.length > 0) {
              deepSubKeys.forEach(deepKey => result.push(`${subPath}.${deepKey}`))
            } else {
              result.push(subPath)
            }
          } else {
            result.push(subPath)
          }
        })
      } else {
        result.push(col)
      }
    } else {
      result.push(col)
    }
  }

  return result
}
