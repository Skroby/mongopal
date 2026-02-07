/**
 * Schema utility functions for MongoDB schema analysis and JSON Schema conversion.
 * These pure functions are extracted from SchemaView.jsx for testability.
 */

/**
 * Color names returned by type color functions.
 */
export type TypeColor =
  | 'green'
  | 'blue'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'cyan'
  | 'pink'
  | 'red'
  | 'zinc'
  | 'default'

/**
 * Color names with shades for occurrence percentage.
 */
export type OccurrenceColor =
  | 'green-500'
  | 'green-400'
  | 'yellow-400'
  | 'orange-400'
  | 'red-400'

/**
 * Represents a field in the MongoDB schema inference result.
 */
export interface SchemaField {
  /** MongoDB type name (e.g., 'String', 'Int32', 'ObjectId', 'String | Null') */
  type: string
  /** Percentage of documents containing this field (0-100) */
  occurrence?: number
  /** Nested fields for Object type */
  fields?: Record<string, SchemaField>
  /** Array item type information */
  arrayType?: {
    fields?: Record<string, SchemaField>
  }
}

/**
 * Result from MongoDB schema inference.
 */
export interface SchemaResult {
  /** The collection name */
  collection: string
  /** Field definitions with type information */
  fields: Record<string, SchemaField>
}

/**
 * JSON Schema property definition.
 */
export interface JsonSchemaProperty {
  type?: string
  format?: string
  pattern?: string
  contentEncoding?: string
  properties?: Record<string, JsonSchemaProperty>
  items?: JsonSchemaProperty
  oneOf?: JsonSchemaProperty[]
}

/**
 * JSON Schema output conforming to draft 2020-12.
 */
export interface JsonSchema {
  $schema: string
  title: string
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
}

/**
 * A document from MongoDB - can contain any fields.
 */
export type MongoDocument = Record<string, unknown>

/**
 * Returns a color name for the given MongoDB type.
 * @param type - MongoDB field type (e.g., 'String', 'Int32', 'ObjectId')
 * @returns Color name (e.g., 'green', 'blue', 'orange')
 */
export function getTypeColor(type: string): TypeColor {
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
 * @param occurrence - Occurrence percentage (0-100)
 * @returns Color name with shade (e.g., 'green-500', 'yellow-400')
 */
export function getOccurrenceColor(occurrence: number): OccurrenceColor {
  if (occurrence >= 100) return 'green-500'
  if (occurrence >= 80) return 'green-400'
  if (occurrence >= 50) return 'yellow-400'
  if (occurrence >= 20) return 'orange-400'
  return 'red-400'
}

/**
 * Converts internal schema format to JSON Schema format.
 * @param schemaResult - The schema result from MongoDB schema inference
 * @returns JSON Schema object conforming to draft 2020-12
 */
export function toJsonSchema(schemaResult: SchemaResult): JsonSchema {
  const typeMap: Record<string, JsonSchemaProperty> = {
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

  const convertField = (field: SchemaField): JsonSchemaProperty => {
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
      const result: JsonSchemaProperty = { type: 'array' }
      if (field.arrayType && field.arrayType.fields) {
        result.items = {
          type: 'object',
          properties: {},
        }
        for (const [name, f] of Object.entries(field.arrayType.fields)) {
          result.items.properties![name] = convertField(f)
        }
      }
      return result
    }

    // Handle objects
    if (field.type === 'Object' && field.fields) {
      const result: JsonSchemaProperty = {
        type: 'object',
        properties: {},
      }
      for (const [name, f] of Object.entries(field.fields)) {
        result.properties![name] = convertField(f)
      }
      return result
    }

    return typeMap[field.type] || { type: 'string' }
  }

  const jsonSchema: JsonSchema = {
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

/**
 * Extract all field paths from documents, including nested paths.
 * Used for progressive schema enrichment from query results.
 * @param docs - Array of documents
 * @returns Set of field paths (e.g., 'name', 'address.city')
 */
export function extractFieldPathsFromDocs(docs: MongoDocument[]): Set<string> {
  const fieldPaths = new Set<string>()

  function traverse(obj: unknown, prefix: string = ''): void {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return

    const record = obj as Record<string, unknown>
    for (const [key, value] of Object.entries(record)) {
      // Skip MongoDB extended JSON type wrappers
      if (key.startsWith('$')) continue

      const fullPath = prefix ? `${prefix}.${key}` : key
      fieldPaths.add(fullPath)

      // Recurse into nested objects (but not arrays or extended JSON)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Check if it's an extended JSON type (has $ keys)
        const keys = Object.keys(value)
        const isExtendedJson = keys.length > 0 && keys.every(k => k.startsWith('$'))
        if (!isExtendedJson) {
          traverse(value, fullPath)
        }
      }
    }
  }

  for (const doc of docs) {
    traverse(doc)
  }

  return fieldPaths
}
