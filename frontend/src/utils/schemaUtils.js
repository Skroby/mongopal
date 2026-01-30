/**
 * Schema utility functions for MongoDB schema analysis and JSON Schema conversion.
 * These pure functions are extracted from SchemaView.jsx for testability.
 */

/**
 * Returns a color name for the given MongoDB type.
 * @param {string} type - MongoDB field type (e.g., 'String', 'Int32', 'ObjectId')
 * @returns {string} Color name (e.g., 'green', 'blue', 'orange')
 */
export function getTypeColor(type) {
  if (type.includes('String')) return 'green'
  if (type.includes('Int') || type.includes('Double') || type.includes('Decimal')) return 'blue'
  if (type.includes('Boolean')) return 'yellow'
  if (type.includes('Date') || type.includes('Timestamp')) return 'purple'
  if (type.includes('ObjectId')) return 'orange'
  if (type.includes('Array')) return 'cyan'
  if (type.includes('Object')) return 'pink'
  if (type.includes('Binary')) return 'red'
  if (type.includes('Null')) return 'zinc'
  return 'default'
}

/**
 * Returns a color name for the given occurrence percentage.
 * @param {number} occurrence - Occurrence percentage (0-100)
 * @returns {string} Color name with shade (e.g., 'green-500', 'yellow-400')
 */
export function getOccurrenceColor(occurrence) {
  if (occurrence >= 100) return 'green-500'
  if (occurrence >= 80) return 'green-400'
  if (occurrence >= 50) return 'yellow-400'
  if (occurrence >= 20) return 'orange-400'
  return 'red-400'
}

/**
 * Converts internal schema format to JSON Schema format.
 * @param {Object} schemaResult - The schema result from MongoDB schema inference
 * @param {string} schemaResult.collection - The collection name
 * @param {Object} schemaResult.fields - Field definitions with type information
 * @returns {Object} JSON Schema object conforming to draft 2020-12
 */
export function toJsonSchema(schemaResult) {
  const convertField = (field) => {
    const typeMap = {
      'String': { type: 'string' },
      'Int32': { type: 'integer' },
      'Int64': { type: 'integer' },
      'Double': { type: 'number' },
      'Boolean': { type: 'boolean' },
      'Date': { type: 'string', format: 'date-time' },
      'Timestamp': { type: 'string', format: 'date-time' },
      'ObjectId': { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
      'Binary': { type: 'string', contentEncoding: 'base64' },
      'Null': { type: 'null' },
      'Decimal128': { type: 'string' },
    }

    // Handle union types (e.g., "String | Null")
    if (field.type.includes(' | ')) {
      const types = field.type.split(' | ').map(t => t.trim())
      const schemas = types.map(t => {
        if (t.startsWith('Array')) return { type: 'array' }
        if (t === 'Object') return { type: 'object' }
        return typeMap[t] || { type: 'string' }
      })
      return { oneOf: schemas }
    }

    // Handle arrays
    if (field.type.startsWith('Array')) {
      const result = { type: 'array' }
      if (field.arrayType && field.arrayType.fields) {
        result.items = {
          type: 'object',
          properties: {},
        }
        for (const [name, f] of Object.entries(field.arrayType.fields)) {
          result.items.properties[name] = convertField(f)
        }
      }
      return result
    }

    // Handle objects
    if (field.type === 'Object' && field.fields) {
      const result = {
        type: 'object',
        properties: {},
      }
      for (const [name, f] of Object.entries(field.fields)) {
        result.properties[name] = convertField(f)
      }
      return result
    }

    return typeMap[field.type] || { type: 'string' }
  }

  const jsonSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: schemaResult.collection,
    type: 'object',
    properties: {},
  }

  for (const [name, field] of Object.entries(schemaResult.fields)) {
    jsonSchema.properties[name] = convertField(field)
  }

  return jsonSchema
}
