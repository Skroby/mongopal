import { describe, it, expect } from 'vitest'
import {
  toJsonSchema,
  getTypeColor,
  getOccurrenceColor,
  extractFieldPathsFromDocs,
  type SchemaResult,
  type MongoDocument,
} from './schemaUtils'

describe('getTypeColor', () => {
  it('returns green for String type', () => {
    expect(getTypeColor('String')).toBe('green')
  })

  it('returns blue for Int32 type', () => {
    expect(getTypeColor('Int32')).toBe('blue')
  })

  it('returns blue for Int64 type', () => {
    expect(getTypeColor('Int64')).toBe('blue')
  })

  it('returns blue for Double type', () => {
    expect(getTypeColor('Double')).toBe('blue')
  })

  it('returns blue for Decimal128 type', () => {
    expect(getTypeColor('Decimal128')).toBe('blue')
  })

  it('returns yellow for Boolean type', () => {
    expect(getTypeColor('Boolean')).toBe('yellow')
  })

  it('returns purple for Date type', () => {
    expect(getTypeColor('Date')).toBe('purple')
  })

  it('returns purple for Timestamp type', () => {
    expect(getTypeColor('Timestamp')).toBe('purple')
  })

  it('returns orange for ObjectId type', () => {
    expect(getTypeColor('ObjectId')).toBe('orange')
  })

  it('returns cyan for Array type', () => {
    expect(getTypeColor('Array')).toBe('cyan')
  })

  it('returns cyan for Array<Object> type', () => {
    expect(getTypeColor('Array<Object>')).toBe('cyan')
  })

  it('returns pink for Object type', () => {
    expect(getTypeColor('Object')).toBe('pink')
  })

  it('returns red for Binary type', () => {
    expect(getTypeColor('Binary')).toBe('red')
  })

  it('returns zinc for Null type', () => {
    expect(getTypeColor('Null')).toBe('zinc')
  })

  it('returns default for unknown type', () => {
    expect(getTypeColor('UnknownType')).toBe('default')
  })

  it('returns default for empty string', () => {
    expect(getTypeColor('')).toBe('default')
  })
})

describe('getOccurrenceColor', () => {
  it('returns green-500 for 100%', () => {
    expect(getOccurrenceColor(100)).toBe('green-500')
  })

  it('returns green-400 for 80%', () => {
    expect(getOccurrenceColor(80)).toBe('green-400')
  })

  it('returns green-400 for 99%', () => {
    expect(getOccurrenceColor(99)).toBe('green-400')
  })

  it('returns yellow-400 for 50%', () => {
    expect(getOccurrenceColor(50)).toBe('yellow-400')
  })

  it('returns yellow-400 for 79%', () => {
    expect(getOccurrenceColor(79)).toBe('yellow-400')
  })

  it('returns orange-400 for 20%', () => {
    expect(getOccurrenceColor(20)).toBe('orange-400')
  })

  it('returns orange-400 for 49%', () => {
    expect(getOccurrenceColor(49)).toBe('orange-400')
  })

  it('returns red-400 for values below 20%', () => {
    expect(getOccurrenceColor(19)).toBe('red-400')
    expect(getOccurrenceColor(10)).toBe('red-400')
    expect(getOccurrenceColor(0)).toBe('red-400')
  })
})

describe('toJsonSchema', () => {
  it('converts simple schema with String field', () => {
    const schemaResult: SchemaResult = {
      collection: 'users',
      fields: {
        name: { type: 'String', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(result.title).toBe('users')
    expect(result.type).toBe('object')
    expect(result.properties.name).toEqual({ type: 'string' })
  })

  it('converts schema with Int32 type', () => {
    const schemaResult: SchemaResult = {
      collection: 'orders',
      fields: {
        quantity: { type: 'Int32', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.quantity).toEqual({ type: 'integer' })
  })

  it('converts schema with Int64 type', () => {
    const schemaResult: SchemaResult = {
      collection: 'stats',
      fields: {
        count: { type: 'Int64', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.count).toEqual({ type: 'integer' })
  })

  it('converts schema with Double type', () => {
    const schemaResult: SchemaResult = {
      collection: 'products',
      fields: {
        price: { type: 'Double', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.price).toEqual({ type: 'number' })
  })

  it('converts schema with Boolean type', () => {
    const schemaResult: SchemaResult = {
      collection: 'users',
      fields: {
        active: { type: 'Boolean', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.active).toEqual({ type: 'boolean' })
  })

  it('converts schema with Date type', () => {
    const schemaResult: SchemaResult = {
      collection: 'events',
      fields: {
        createdAt: { type: 'Date', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.createdAt).toEqual({ type: 'string', format: 'date-time' })
  })

  it('converts schema with Timestamp type', () => {
    const schemaResult: SchemaResult = {
      collection: 'logs',
      fields: {
        timestamp: { type: 'Timestamp', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.timestamp).toEqual({ type: 'string', format: 'date-time' })
  })

  it('converts schema with ObjectId type', () => {
    const schemaResult: SchemaResult = {
      collection: 'documents',
      fields: {
        _id: { type: 'ObjectId', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties._id).toEqual({ type: 'string', pattern: '^[a-fA-F0-9]{24}$' })
  })

  it('converts schema with Binary type', () => {
    const schemaResult: SchemaResult = {
      collection: 'files',
      fields: {
        data: { type: 'Binary', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.data).toEqual({ type: 'string', contentEncoding: 'base64' })
  })

  it('converts schema with Null type', () => {
    const schemaResult: SchemaResult = {
      collection: 'data',
      fields: {
        optional: { type: 'Null', occurrence: 50 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.optional).toEqual({ type: 'null' })
  })

  it('converts schema with Decimal128 type', () => {
    const schemaResult: SchemaResult = {
      collection: 'finance',
      fields: {
        amount: { type: 'Decimal128', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.amount).toEqual({ type: 'string' })
  })

  it('converts schema with union types (String | Null)', () => {
    const schemaResult: SchemaResult = {
      collection: 'users',
      fields: {
        middleName: { type: 'String | Null', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.middleName).toEqual({
      oneOf: [
        { type: 'string' },
        { type: 'null' }
      ]
    })
  })

  it('converts schema with union types including Array', () => {
    const schemaResult: SchemaResult = {
      collection: 'data',
      fields: {
        value: { type: 'Array | Null', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.value).toEqual({
      oneOf: [
        { type: 'array' },
        { type: 'null' }
      ]
    })
  })

  it('converts schema with union types including Object', () => {
    const schemaResult: SchemaResult = {
      collection: 'data',
      fields: {
        metadata: { type: 'Object | Null', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.metadata).toEqual({
      oneOf: [
        { type: 'object' },
        { type: 'null' }
      ]
    })
  })

  it('converts schema with nested Object containing fields', () => {
    const schemaResult: SchemaResult = {
      collection: 'users',
      fields: {
        address: {
          type: 'Object',
          occurrence: 100,
          fields: {
            street: { type: 'String', occurrence: 100 },
            city: { type: 'String', occurrence: 100 },
            zip: { type: 'String', occurrence: 80 }
          }
        }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.address).toEqual({
      type: 'object',
      properties: {
        street: { type: 'string' },
        city: { type: 'string' },
        zip: { type: 'string' }
      }
    })
  })

  it('converts schema with Array containing object items', () => {
    const schemaResult: SchemaResult = {
      collection: 'orders',
      fields: {
        items: {
          type: 'Array',
          occurrence: 100,
          arrayType: {
            fields: {
              productId: { type: 'String', occurrence: 100 },
              quantity: { type: 'Int32', occurrence: 100 },
              price: { type: 'Double', occurrence: 100 }
            }
          }
        }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.items).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          quantity: { type: 'integer' },
          price: { type: 'number' }
        }
      }
    })
  })

  it('converts schema with Array without item structure', () => {
    const schemaResult: SchemaResult = {
      collection: 'tags',
      fields: {
        keywords: {
          type: 'Array',
          occurrence: 100
        }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.keywords).toEqual({ type: 'array' })
  })

  it('converts schema with deeply nested structures', () => {
    const schemaResult: SchemaResult = {
      collection: 'complex',
      fields: {
        level1: {
          type: 'Object',
          occurrence: 100,
          fields: {
            level2: {
              type: 'Object',
              occurrence: 100,
              fields: {
                level3: {
                  type: 'Object',
                  occurrence: 100,
                  fields: {
                    value: { type: 'String', occurrence: 100 }
                  }
                }
              }
            }
          }
        }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.level1).toEqual({
      type: 'object',
      properties: {
        level2: {
          type: 'object',
          properties: {
            level3: {
              type: 'object',
              properties: {
                value: { type: 'string' }
              }
            }
          }
        }
      }
    })
  })

  it('handles empty schema', () => {
    const schemaResult: SchemaResult = {
      collection: 'empty',
      fields: {}
    }
    const result = toJsonSchema(schemaResult)

    expect(result.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(result.title).toBe('empty')
    expect(result.type).toBe('object')
    expect(result.properties).toEqual({})
  })

  it('handles unknown type by defaulting to string', () => {
    const schemaResult: SchemaResult = {
      collection: 'unknown',
      fields: {
        weird: { type: 'SomeUnknownType', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.weird).toEqual({ type: 'string' })
  })

  it('converts multiple fields of different types', () => {
    const schemaResult: SchemaResult = {
      collection: 'users',
      fields: {
        _id: { type: 'ObjectId', occurrence: 100 },
        name: { type: 'String', occurrence: 100 },
        age: { type: 'Int32', occurrence: 95 },
        email: { type: 'String | Null', occurrence: 100 },
        createdAt: { type: 'Date', occurrence: 100 },
        active: { type: 'Boolean', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties._id).toEqual({ type: 'string', pattern: '^[a-fA-F0-9]{24}$' })
    expect(result.properties.name).toEqual({ type: 'string' })
    expect(result.properties.age).toEqual({ type: 'integer' })
    expect(result.properties.email).toEqual({ oneOf: [{ type: 'string' }, { type: 'null' }] })
    expect(result.properties.createdAt).toEqual({ type: 'string', format: 'date-time' })
    expect(result.properties.active).toEqual({ type: 'boolean' })
  })

  it('converts Array with nested object containing arrays', () => {
    const schemaResult: SchemaResult = {
      collection: 'nested',
      fields: {
        items: {
          type: 'Array',
          occurrence: 100,
          arrayType: {
            fields: {
              tags: {
                type: 'Array',
                occurrence: 100
              },
              metadata: {
                type: 'Object',
                occurrence: 100,
                fields: {
                  key: { type: 'String', occurrence: 100 }
                }
              }
            }
          }
        }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.items).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tags: { type: 'array' },
          metadata: {
            type: 'object',
            properties: {
              key: { type: 'string' }
            }
          }
        }
      }
    })
  })

  it('handles Object type without nested fields', () => {
    const schemaResult: SchemaResult = {
      collection: 'flexible',
      fields: {
        metadata: { type: 'Object', occurrence: 100 }
        // Note: no fields property
      }
    }
    const result = toJsonSchema(schemaResult)

    // Without fields, it defaults to string type
    expect(result.properties.metadata).toEqual({ type: 'string' })
  })

  it('handles Array<String> type notation', () => {
    const schemaResult: SchemaResult = {
      collection: 'tags',
      fields: {
        keywords: { type: 'Array<String>', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    // Array<String> starts with 'Array', so it becomes { type: 'array' }
    expect(result.properties.keywords).toEqual({ type: 'array' })
  })

  it('handles union with unknown type', () => {
    const schemaResult: SchemaResult = {
      collection: 'data',
      fields: {
        value: { type: 'UnknownType | Null', occurrence: 100 }
      }
    }
    const result = toJsonSchema(schemaResult)

    expect(result.properties.value).toEqual({
      oneOf: [
        { type: 'string' },  // unknown defaults to string
        { type: 'null' }
      ]
    })
  })
})

describe('extractFieldPathsFromDocs', () => {
  it('returns empty set for empty array', () => {
    const result = extractFieldPathsFromDocs([])
    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)
  })

  it('extracts top-level field names', () => {
    const docs: MongoDocument[] = [
      { name: 'John', age: 30, email: 'john@example.com' }
    ]
    const result = extractFieldPathsFromDocs(docs)
    expect(result.has('name')).toBe(true)
    expect(result.has('age')).toBe(true)
    expect(result.has('email')).toBe(true)
  })

  it('extracts nested field paths', () => {
    const docs: MongoDocument[] = [
      {
        user: {
          name: 'John',
          address: {
            city: 'NYC',
            zip: '10001'
          }
        }
      }
    ]
    const result = extractFieldPathsFromDocs(docs)
    expect(result.has('user')).toBe(true)
    expect(result.has('user.name')).toBe(true)
    expect(result.has('user.address')).toBe(true)
    expect(result.has('user.address.city')).toBe(true)
    expect(result.has('user.address.zip')).toBe(true)
  })

  it('merges fields from multiple documents', () => {
    const docs: MongoDocument[] = [
      { name: 'John', age: 30 },
      { name: 'Jane', email: 'jane@example.com' },
      { name: 'Bob', phone: '555-1234' }
    ]
    const result = extractFieldPathsFromDocs(docs)
    expect(result.has('name')).toBe(true)
    expect(result.has('age')).toBe(true)
    expect(result.has('email')).toBe(true)
    expect(result.has('phone')).toBe(true)
  })

  it('skips MongoDB extended JSON type wrappers ($ keys)', () => {
    const docs: MongoDocument[] = [
      {
        _id: { $oid: '507f1f77bcf86cd799439011' },
        createdAt: { $date: '2023-01-01T00:00:00Z' },
        amount: { $numberLong: '123456' }
      }
    ]
    const result = extractFieldPathsFromDocs(docs)
    expect(result.has('_id')).toBe(true)
    expect(result.has('createdAt')).toBe(true)
    expect(result.has('amount')).toBe(true)
    // Should NOT have the $ wrapper keys
    expect(result.has('$oid')).toBe(false)
    expect(result.has('$date')).toBe(false)
    expect(result.has('$numberLong')).toBe(false)
    expect(result.has('_id.$oid')).toBe(false)
  })

  it('does not recurse into extended JSON objects', () => {
    const docs: MongoDocument[] = [
      {
        binary: { $binary: { base64: 'YWJj', subType: '00' } }
      }
    ]
    const result = extractFieldPathsFromDocs(docs)
    expect(result.has('binary')).toBe(true)
    // Should NOT recurse into the extended JSON
    expect(result.has('binary.base64')).toBe(false)
    expect(result.has('binary.subType')).toBe(false)
  })

  it('does not recurse into arrays', () => {
    const docs: MongoDocument[] = [
      {
        tags: ['mongodb', 'database'],
        items: [{ name: 'item1' }, { name: 'item2' }]
      }
    ]
    const result = extractFieldPathsFromDocs(docs)
    expect(result.has('tags')).toBe(true)
    expect(result.has('items')).toBe(true)
    // Should NOT have array indices or nested array object fields
    expect(result.has('tags.0')).toBe(false)
    expect(result.has('items.name')).toBe(false)
  })

  it('handles null and undefined values gracefully', () => {
    const docs: MongoDocument[] = [
      { name: 'John', address: null, phone: undefined }
    ]
    const result = extractFieldPathsFromDocs(docs)
    expect(result.has('name')).toBe(true)
    expect(result.has('address')).toBe(true)
    expect(result.has('phone')).toBe(true)
  })

  it('handles deeply nested structures', () => {
    const docs: MongoDocument[] = [
      {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep'
              }
            }
          }
        }
      }
    ]
    const result = extractFieldPathsFromDocs(docs)
    expect(result.has('level1')).toBe(true)
    expect(result.has('level1.level2')).toBe(true)
    expect(result.has('level1.level2.level3')).toBe(true)
    expect(result.has('level1.level2.level3.level4')).toBe(true)
    expect(result.has('level1.level2.level3.level4.value')).toBe(true)
  })

  it('handles mixed content documents', () => {
    const docs: MongoDocument[] = [
      {
        _id: { $oid: '507f1f77bcf86cd799439011' },
        name: 'Test',
        metadata: {
          created: { $date: '2023-01-01T00:00:00Z' },
          tags: ['a', 'b'],
          author: {
            name: 'Admin',
            email: 'admin@example.com'
          }
        }
      }
    ]
    const result = extractFieldPathsFromDocs(docs)
    expect(result.has('_id')).toBe(true)
    expect(result.has('name')).toBe(true)
    expect(result.has('metadata')).toBe(true)
    expect(result.has('metadata.created')).toBe(true)
    expect(result.has('metadata.tags')).toBe(true)
    expect(result.has('metadata.author')).toBe(true)
    expect(result.has('metadata.author.name')).toBe(true)
    expect(result.has('metadata.author.email')).toBe(true)
    // Should NOT have extended JSON internals
    expect(result.has('metadata.created.$date')).toBe(false)
  })

  it('handles empty objects', () => {
    const docs: MongoDocument[] = [
      { name: 'Test', empty: {} }
    ]
    const result = extractFieldPathsFromDocs(docs)
    expect(result.has('name')).toBe(true)
    expect(result.has('empty')).toBe(true)
  })

  it('handles documents with only _id', () => {
    const docs: MongoDocument[] = [
      { _id: '123' },
      { _id: '456' }
    ]
    const result = extractFieldPathsFromDocs(docs)
    expect(result.has('_id')).toBe(true)
    expect(result.size).toBe(1)
  })
})
