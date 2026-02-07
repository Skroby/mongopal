import { describe, it, expect } from 'vitest'
import {
  parseMongoshOutput,
  convertMongoshTypes,
  convertSingleQuotesToDouble,
  quoteUnquotedKeys,
  removeTrailingCommas,
  stripResultTypeWrappers,
  type MongoshParseResult
} from './mongoshParser'

describe('stripResultTypeWrappers', () => {
  it('strips InsertManyResult wrapper', () => {
    const input = 'InsertManyResult { acknowledged: true }'
    expect(stripResultTypeWrappers(input)).toBe('{ acknowledged: true }')
  })

  it('strips InsertOneResult wrapper', () => {
    const input = 'InsertOneResult { acknowledged: true, insertedId: "123" }'
    expect(stripResultTypeWrappers(input)).toBe('{ acknowledged: true, insertedId: "123" }')
  })

  it('strips DeleteResult wrapper', () => {
    const input = 'DeleteResult { acknowledged: true, deletedCount: 5 }'
    expect(stripResultTypeWrappers(input)).toBe('{ acknowledged: true, deletedCount: 5 }')
  })

  it('strips UpdateResult wrapper', () => {
    const input = 'UpdateResult { acknowledged: true, modifiedCount: 3 }'
    expect(stripResultTypeWrappers(input)).toBe('{ acknowledged: true, modifiedCount: 3 }')
  })

  it('strips BulkWriteResult wrapper', () => {
    const input = 'BulkWriteResult { ok: 1 }'
    expect(stripResultTypeWrappers(input)).toBe('{ ok: 1 }')
  })

  it('strips multiple result types in object', () => {
    const input = '{ inserted: InsertManyResult { acknowledged: true }, deleted: DeleteResult { deletedCount: 3 } }'
    expect(stripResultTypeWrappers(input)).toBe('{ inserted: { acknowledged: true }, deleted: { deletedCount: 3 } }')
  })

  it('leaves regular objects unchanged', () => {
    const input = '{ name: "test", value: 123 }'
    expect(stripResultTypeWrappers(input)).toBe('{ name: "test", value: 123 }')
  })
})

describe('convertMongoshTypes', () => {
  it('converts ObjectId to EJSON format', () => {
    const input = 'ObjectId("507f1f77bcf86cd799439011")'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$oid":"507f1f77bcf86cd799439011"}')
  })

  it('converts ObjectId with single quotes', () => {
    const input = "ObjectId('507f1f77bcf86cd799439011')"
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$oid":"507f1f77bcf86cd799439011"}')
  })

  it('converts ISODate to EJSON format', () => {
    const input = 'ISODate("2023-01-15T10:30:00.000Z")'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$date":"2023-01-15T10:30:00.000Z"}')
  })

  it('converts new Date to EJSON format', () => {
    const input = 'new Date("2023-01-15T10:30:00.000Z")'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$date":"2023-01-15T10:30:00.000Z"}')
  })

  it('converts NumberLong to EJSON format', () => {
    const input = 'NumberLong("9223372036854775807")'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$numberLong":"9223372036854775807"}')
  })

  it('converts NumberLong without quotes', () => {
    const input = 'NumberLong(12345)'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$numberLong":"12345"}')
  })

  it('converts negative NumberLong', () => {
    const input = 'NumberLong(-12345)'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$numberLong":"-12345"}')
  })

  it('converts NumberInt to EJSON format', () => {
    const input = 'NumberInt(42)'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$numberInt":"42"}')
  })

  it('converts NumberDecimal to EJSON format', () => {
    const input = 'NumberDecimal("123.456")'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$numberDecimal":"123.456"}')
  })

  it('converts Timestamp to EJSON format', () => {
    const input = 'Timestamp(1234567890, 1)'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$timestamp":{"t":1234567890,"i":1}}')
  })

  it('converts BinData to EJSON format', () => {
    const input = 'BinData(0, "SGVsbG8gV29ybGQ=")'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$binary":{"base64":"SGVsbG8gV29ybGQ=","subType":"00"}}')
  })

  it('converts BinData with subType 4 (UUID)', () => {
    const input = 'BinData(4, "QmFzZTY0RW5jb2RlZA==")'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$binary":{"base64":"QmFzZTY0RW5jb2RlZA==","subType":"04"}}')
  })

  it('converts UUID to EJSON format', () => {
    const input = 'UUID("550e8400-e29b-41d4-a716-446655440000")'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$uuid":"550e8400-e29b-41d4-a716-446655440000"}')
  })

  it('converts MinKey to EJSON format', () => {
    const input = 'MinKey()'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$minKey":1}')
  })

  it('converts MaxKey to EJSON format', () => {
    const input = 'MaxKey()'
    const result = convertMongoshTypes(input)
    expect(result).toBe('{"$maxKey":1}')
  })

  it('handles multiple types in one string', () => {
    const input = '{ _id: ObjectId("507f1f77bcf86cd799439011"), date: ISODate("2023-01-15T10:30:00Z"), count: NumberLong(100) }'
    const result = convertMongoshTypes(input)
    expect(result).toContain('{"$oid":"507f1f77bcf86cd799439011"}')
    expect(result).toContain('{"$date":"2023-01-15T10:30:00Z"}')
    expect(result).toContain('{"$numberLong":"100"}')
  })
})

describe('quoteUnquotedKeys', () => {
  it('quotes simple unquoted keys', () => {
    const input = '{ name: "value" }'
    const result = quoteUnquotedKeys(input)
    expect(result).toBe('{ "name": "value" }')
  })

  it('quotes multiple unquoted keys', () => {
    const input = '{ name: "John", age: 30 }'
    const result = quoteUnquotedKeys(input)
    expect(result).toBe('{ "name": "John", "age": 30 }')
  })

  it('handles keys with underscores', () => {
    const input = '{ first_name: "John", last_name: "Doe" }'
    const result = quoteUnquotedKeys(input)
    expect(result).toBe('{ "first_name": "John", "last_name": "Doe" }')
  })

  it('handles keys starting with underscore', () => {
    const input = '{ _id: "123", _class: "User" }'
    const result = quoteUnquotedKeys(input)
    expect(result).toBe('{ "_id": "123", "_class": "User" }')
  })

  it('handles keys with dollar sign', () => {
    const input = '{ $set: { name: "John" } }'
    const result = quoteUnquotedKeys(input)
    expect(result).toBe('{ "$set": { "name": "John" } }')
  })

  it('preserves already quoted keys', () => {
    const input = '{ "name": "value" }'
    const result = quoteUnquotedKeys(input)
    // Should not double-quote
    expect(result).toBe('{ "name": "value" }')
  })

  it('handles nested objects', () => {
    const input = '{ outer: { inner: "value" } }'
    const result = quoteUnquotedKeys(input)
    expect(result).toBe('{ "outer": { "inner": "value" } }')
  })

  it('handles arrays of objects', () => {
    const input = '[{ name: "John" }, { name: "Jane" }]'
    const result = quoteUnquotedKeys(input)
    expect(result).toBe('[{ "name": "John" }, { "name": "Jane" }]')
  })
})

describe('convertSingleQuotesToDouble', () => {
  it('converts simple single-quoted string', () => {
    const input = "{ name: 'John' }"
    const result = convertSingleQuotesToDouble(input)
    expect(result).toBe('{ name: "John" }')
  })

  it('converts multiple single-quoted strings', () => {
    const input = "{ name: 'John', city: 'NYC' }"
    const result = convertSingleQuotesToDouble(input)
    expect(result).toBe('{ name: "John", city: "NYC" }')
  })

  it('preserves double-quoted strings', () => {
    const input = '{ name: "John" }'
    const result = convertSingleQuotesToDouble(input)
    expect(result).toBe('{ name: "John" }')
  })

  it('handles mixed quotes', () => {
    const input = `{ name: 'John', city: "NYC" }`
    const result = convertSingleQuotesToDouble(input)
    expect(result).toBe('{ name: "John", city: "NYC" }')
  })

  it('handles single quotes inside double-quoted strings', () => {
    const input = `{ message: "It's working" }`
    const result = convertSingleQuotesToDouble(input)
    expect(result).toBe(`{ message: "It's working" }`)
  })

  it('handles ISODate with single quotes', () => {
    const input = "ISODate('2023-01-15T10:30:00Z')"
    const result = convertSingleQuotesToDouble(input)
    expect(result).toBe('ISODate("2023-01-15T10:30:00Z")')
  })

  it('handles array values with single quotes', () => {
    const input = "['a', 'b', 'c']"
    const result = convertSingleQuotesToDouble(input)
    expect(result).toBe('["a", "b", "c"]')
  })
})

describe('removeTrailingCommas', () => {
  it('removes trailing comma before closing brace', () => {
    const input = '{ "name": "John", }'
    const result = removeTrailingCommas(input)
    expect(result).toBe('{ "name": "John" }')
  })

  it('removes trailing comma before closing bracket', () => {
    const input = '["a", "b", ]'
    const result = removeTrailingCommas(input)
    expect(result).toBe('["a", "b" ]')
  })

  it('removes multiple trailing commas', () => {
    const input = '{ "arr": [1, 2, ], "obj": { "a": 1, }, }'
    const result = removeTrailingCommas(input)
    expect(result).toBe('{ "arr": [1, 2 ], "obj": { "a": 1 } }')
  })

  it('handles trailing comma with newlines', () => {
    const input = '{\n  "name": "John",\n}'
    const result = removeTrailingCommas(input)
    expect(result).toBe('{\n  "name": "John"\n}')
  })
})

describe('parseMongoshOutput', () => {
  it('returns empty array for empty input', () => {
    const result: MongoshParseResult = parseMongoshOutput('')
    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('returns error for null input', () => {
    const result: MongoshParseResult = parseMongoshOutput(null)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('parses valid JSON array', () => {
    const input = '[{"name": "John"}, {"name": "Jane"}]'
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    expect((result.data[0] as Record<string, unknown>).name).toBe('John')
    expect((result.data[1] as Record<string, unknown>).name).toBe('Jane')
  })

  it('parses valid JSON object (wraps in array)', () => {
    const input = '{"name": "John"}'
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect((result.data[0] as Record<string, unknown>).name).toBe('John')
  })

  it('parses NDJSON format', () => {
    const input = '{"name": "John"}\n{"name": "Jane"}'
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
  })

  it('parses mongosh format with unquoted keys', () => {
    const input = '{ name: "John", age: 30 }'
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect((result.data[0] as Record<string, unknown>).name).toBe('John')
    expect((result.data[0] as Record<string, unknown>).age).toBe(30)
  })

  it('parses mongosh array with unquoted keys', () => {
    const input = '[{ name: "John" }, { name: "Jane" }]'
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
  })

  it('parses mongosh format with ObjectId', () => {
    const input = '{ _id: ObjectId("507f1f77bcf86cd799439011"), name: "John" }'
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect((result.data[0] as Record<string, unknown>)._id).toEqual({ $oid: '507f1f77bcf86cd799439011' })
    expect((result.data[0] as Record<string, unknown>).name).toBe('John')
  })

  it('parses mongosh format with ISODate', () => {
    const input = '{ createdAt: ISODate("2023-01-15T10:30:00.000Z") }'
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect((result.data[0] as Record<string, unknown>).createdAt).toEqual({ $date: '2023-01-15T10:30:00.000Z' })
  })

  it('parses mongosh format with NumberLong', () => {
    const input = '{ count: NumberLong("9223372036854775807") }'
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect((result.data[0] as Record<string, unknown>).count).toEqual({ $numberLong: '9223372036854775807' })
  })

  it('parses complex mongosh aggregation result', () => {
    const input = `[
      { _id: "category1", count: NumberLong(10), lastUpdated: ISODate("2023-06-15T00:00:00Z") },
      { _id: "category2", count: NumberLong(25), lastUpdated: ISODate("2023-06-16T00:00:00Z") }
    ]`
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    expect((result.data[0] as Record<string, unknown>)._id).toBe('category1')
    expect((result.data[0] as Record<string, unknown>).count).toEqual({ $numberLong: '10' })
    expect((result.data[1] as Record<string, unknown>)._id).toBe('category2')
  })

  it('parses mongosh format with trailing commas', () => {
    const input = '{ name: "John", age: 30, }'
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect((result.data[0] as Record<string, unknown>).name).toBe('John')
  })

  it('parses mongosh format with nested objects', () => {
    const input = '{ user: { name: "John", address: { city: "NYC" } } }'
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    const user = (result.data[0] as Record<string, unknown>).user as Record<string, unknown>
    expect(user.name).toBe('John')
    expect((user.address as Record<string, unknown>).city).toBe('NYC')
  })

  it('parses mongosh format with arrays', () => {
    const input = '{ tags: ["a", "b", "c"], scores: [1, 2, 3] }'
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect((result.data[0] as Record<string, unknown>).tags).toEqual(['a', 'b', 'c'])
    expect((result.data[0] as Record<string, unknown>).scores).toEqual([1, 2, 3])
  })

  it('parses mongosh format with mixed types', () => {
    const input = `{
      _id: ObjectId("507f1f77bcf86cd799439011"),
      name: "Test",
      count: NumberLong(100),
      ratio: 0.5,
      active: true,
      tags: ["a", "b"],
      metadata: { key: "value" },
      createdAt: ISODate("2023-01-01T00:00:00Z")
    }`
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    const data = result.data[0] as Record<string, unknown>
    expect(data._id).toEqual({ $oid: '507f1f77bcf86cd799439011' })
    expect(data.name).toBe('Test')
    expect(data.count).toEqual({ $numberLong: '100' })
    expect(data.ratio).toBe(0.5)
    expect(data.active).toBe(true)
    expect(data.tags).toEqual(['a', 'b'])
    expect(data.metadata).toEqual({ key: 'value' })
  })

  it('handles whitespace variations', () => {
    const input = '{name:"John",age:30}'
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect((result.data[0] as Record<string, unknown>).name).toBe('John')
  })

  it('parses realistic aggregation output', () => {
    const input = `[
      {
        _id: ObjectId("65a1b2c3d4e5f6a7b8c9d0e1"),
        category: "electronics",
        totalSales: NumberLong(15000),
        avgPrice: 299.99,
        lastSale: ISODate("2024-01-15T14:30:00.000Z"),
        topProducts: [
          { name: "Phone", qty: NumberInt(50) },
          { name: "Laptop", qty: NumberInt(30) }
        ]
      }
    ]`
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    const data = result.data[0] as Record<string, unknown>
    expect(data.category).toBe('electronics')
    expect(data.totalSales).toEqual({ $numberLong: '15000' })
    expect(data.avgPrice).toBe(299.99)
    expect(data.topProducts).toHaveLength(2)
  })

  it('parses mongosh output with single-quoted strings', () => {
    const input = `[
      {
        count: 262152,
        oldestToken: ISODate('2023-08-18T18:28:14.838Z'),
        newestToken: ISODate('2026-01-23T10:57:20.127Z'),
        singleUseCount: 1,
        tokenType: 'PAT',
        ownerType: 'User',
        avgPermissionAssignments: 2.84
      },
      {
        count: 2713,
        oldestToken: ISODate('2025-10-11T12:40:41.836Z'),
        newestToken: ISODate('2026-01-31T01:49:27.055Z'),
        singleUseCount: 0,
        tokenType: 'M2M',
        ownerType: 'Machine2Machine',
        avgPermissionAssignments: 0
      }
    ]`
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    const data0 = result.data[0] as Record<string, unknown>
    const data1 = result.data[1] as Record<string, unknown>
    expect(data0.count).toBe(262152)
    expect(data0.tokenType).toBe('PAT')
    expect(data0.ownerType).toBe('User')
    expect(data0.oldestToken).toEqual({ $date: '2023-08-18T18:28:14.838Z' })
    expect(data1.tokenType).toBe('M2M')
    expect(data1.ownerType).toBe('Machine2Machine')
  })

  it('parses write operation results with type wrappers', () => {
    const input = `{
  inserted: InsertManyResult {
    acknowledged: true,
    insertedIds: {
      '0': ObjectId('697d75381772b9e2e58089a9'),
      '1': ObjectId('697d75381772b9e2e58089aa'),
      '2': ObjectId('697d75381772b9e2e58089ab')
    }
  },
  deleted: DeleteResult {
    acknowledged: true,
    deletedCount: 6
  }
}`
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    const data = result.data[0] as Record<string, unknown>
    const inserted = data.inserted as Record<string, unknown>
    const deleted = data.deleted as Record<string, unknown>
    expect(inserted.acknowledged).toBe(true)
    expect((inserted.insertedIds as Record<string, unknown>)['0']).toEqual({ $oid: '697d75381772b9e2e58089a9' })
    expect(deleted.acknowledged).toBe(true)
    expect(deleted.deletedCount).toBe(6)
  })

  it('parses single InsertOneResult', () => {
    const input = `InsertOneResult {
  acknowledged: true,
  insertedId: ObjectId('697d75381772b9e2e58089a9')
}`
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    const data = result.data[0] as Record<string, unknown>
    expect(data.acknowledged).toBe(true)
    expect(data.insertedId).toEqual({ $oid: '697d75381772b9e2e58089a9' })
  })

  it('parses UpdateResult', () => {
    const input = `UpdateResult {
  acknowledged: true,
  matchedCount: 5,
  modifiedCount: 3,
  upsertedCount: 0
}`
    const result: MongoshParseResult = parseMongoshOutput(input)
    expect(result.success).toBe(true)
    const data = result.data[0] as Record<string, unknown>
    expect(data.acknowledged).toBe(true)
    expect(data.matchedCount).toBe(5)
    expect(data.modifiedCount).toBe(3)
  })
})
