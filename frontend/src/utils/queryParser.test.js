import { describe, it, expect } from 'vitest'
import { parseFilterFromQuery, parseProjectionFromQuery, buildFullQuery, isSimpleFindQuery, wrapScriptForOutput } from './queryParser'

describe('parseFilterFromQuery', () => {
  it('extracts filter from valid find query', () => {
    const query = 'db.getCollection("users").find({ name: "test" })'
    expect(parseFilterFromQuery(query)).toBe('{ name: "test" }')
  })

  it('extracts empty filter from find with empty object', () => {
    const query = 'db.getCollection("users").find({})'
    expect(parseFilterFromQuery(query)).toBe('{}')
  })

  it('handles raw JSON filter', () => {
    const query = '{ status: "active" }'
    expect(parseFilterFromQuery(query)).toBe('{ status: "active" }')
  })

  it('handles complex nested filter', () => {
    const query = 'db.getCollection("orders").find({ $and: [{ status: "pending" }, { total: { $gt: 100 } }] })'
    expect(parseFilterFromQuery(query)).toBe('{ $and: [{ status: "pending" }, { total: { $gt: 100 } }] }')
  })

  it('returns empty string for .find without parentheses', () => {
    const query = 'db.getCollection("users").find'
    expect(parseFilterFromQuery(query)).toBe('')
  })

  it('handles find with whitespace', () => {
    const query = 'db.getCollection("users").find(  { name: "test" }  )'
    expect(parseFilterFromQuery(query)).toBe('{ name: "test" }')
  })

  it('returns default for empty find parentheses', () => {
    const query = 'db.getCollection("users").find()'
    expect(parseFilterFromQuery(query)).toBe('{}')
  })
})

describe('parseFilterFromQuery - edge cases', () => {
  it('handles multiline query', () => {
    const query = `db.getCollection("users").find({
      name: "test",
      age: { $gt: 21 }
    })`
    expect(parseFilterFromQuery(query)).toContain('name: "test"')
  })

  it('handles db.collection shorthand', () => {
    const query = 'db.users.find({ active: true })'
    expect(parseFilterFromQuery(query)).toBe('{ active: true }')
  })

  it('returns trimmed string for plain text', () => {
    const query = '  { foo: "bar" }  '
    expect(parseFilterFromQuery(query)).toBe('{ foo: "bar" }')
  })

  it('handles empty string', () => {
    expect(parseFilterFromQuery('')).toBe('{}')
  })

  it('handles whitespace only', () => {
    expect(parseFilterFromQuery('   ')).toBe('{}')
  })
})

describe('buildFullQuery', () => {
  it('builds query string with collection and filter', () => {
    expect(buildFullQuery('users', '{}')).toBe('db.getCollection("users").find({})')
  })

  it('builds query string with complex filter', () => {
    expect(buildFullQuery('orders', '{ status: "active" }')).toBe('db.getCollection("orders").find({ status: "active" })')
  })

  it('handles collection names with special characters', () => {
    expect(buildFullQuery('my-collection', '{}')).toBe('db.getCollection("my-collection").find({})')
  })
})

describe('parseFilterFromQuery - with projections', () => {
  it('extracts only filter when projection is present', () => {
    const query = 'db.users.find({ active: true }, { name: 1, email: 1 })'
    expect(parseFilterFromQuery(query)).toBe('{ active: true }')
  })

  it('handles nested objects in filter with projection', () => {
    const query = 'db.users.find({ address: { city: "NYC" } }, { name: 1 })'
    expect(parseFilterFromQuery(query)).toBe('{ address: { city: "NYC" } }')
  })

  it('handles arrays in filter with projection', () => {
    const query = 'db.users.find({ tags: ["a", "b"] }, { name: 1 })'
    expect(parseFilterFromQuery(query)).toBe('{ tags: ["a", "b"] }')
  })

  it('handles commas in strings correctly', () => {
    const query = 'db.users.find({ name: "Doe, John" }, { email: 1 })'
    expect(parseFilterFromQuery(query)).toBe('{ name: "Doe, John" }')
  })
})

describe('parseProjectionFromQuery', () => {
  it('returns null for query without projection', () => {
    expect(parseProjectionFromQuery('db.users.find({ active: true })')).toBe(null)
    expect(parseProjectionFromQuery('{}')).toBe(null)
    expect(parseProjectionFromQuery('')).toBe(null)
  })

  it('extracts projection from find query', () => {
    const query = 'db.users.find({ active: true }, { name: 1, email: 1 })'
    expect(parseProjectionFromQuery(query)).toBe('{ name: 1, email: 1 }')
  })

  it('handles empty filter with projection', () => {
    const query = 'db.users.find({}, { name: 1, _id: 0 })'
    expect(parseProjectionFromQuery(query)).toBe('{ name: 1, _id: 0 }')
  })

  it('handles nested projection', () => {
    const query = 'db.users.find({}, { "address.city": 1, name: 1 })'
    expect(parseProjectionFromQuery(query)).toBe('{ "address.city": 1, name: 1 }')
  })

  it('handles projection with $elemMatch', () => {
    const query = 'db.users.find({}, { items: { $elemMatch: { status: "A" } } })'
    expect(parseProjectionFromQuery(query)).toBe('{ items: { $elemMatch: { status: "A" } } }')
  })
})

describe('isSimpleFindQuery', () => {
  it('returns true for empty query', () => {
    expect(isSimpleFindQuery('')).toBe(true)
    expect(isSimpleFindQuery(null)).toBe(true)
    expect(isSimpleFindQuery(undefined)).toBe(true)
  })

  it('returns true for filter object', () => {
    expect(isSimpleFindQuery('{ name: "test" }')).toBe(true)
    expect(isSimpleFindQuery('{}')).toBe(true)
  })

  it('returns true for valid find query', () => {
    expect(isSimpleFindQuery('db.getCollection("users").find({})')).toBe(true)
    expect(isSimpleFindQuery('db.users.find({ active: true })')).toBe(true)
    expect(isSimpleFindQuery('db.collection.find(  )')).toBe(true)
  })

  it('returns false for .find without parentheses', () => {
    expect(isSimpleFindQuery('db.getCollection("users").find')).toBe(false)
    expect(isSimpleFindQuery('db.users.find')).toBe(false)
  })

  it('returns false for aggregation queries', () => {
    expect(isSimpleFindQuery('db.users.aggregate([{ $match: {} }])')).toBe(false)
  })

  it('returns false for other mongo operations', () => {
    expect(isSimpleFindQuery('db.users.insertOne({ name: "test" })')).toBe(false)
    expect(isSimpleFindQuery('db.users.updateMany({}, { $set: { active: true } })')).toBe(false)
    expect(isSimpleFindQuery('db.users.deleteOne({ _id: "123" })')).toBe(false)
  })

  it('returns false for multi-statement scripts', () => {
    expect(isSimpleFindQuery('var x = db.users.find({}); print(x)')).toBe(false)
  })
})

describe('wrapScriptForOutput', () => {
  it('wraps insertOne with printjson', () => {
    const script = 'db.users.insertOne({ name: "test" })'
    expect(wrapScriptForOutput(script)).toBe('printjson(db.users.insertOne({ name: "test" }))')
  })

  it('wraps insertMany with printjson', () => {
    const script = 'db.users.insertMany([{ name: "a" }, { name: "b" }])'
    expect(wrapScriptForOutput(script)).toBe('printjson(db.users.insertMany([{ name: "a" }, { name: "b" }]))')
  })

  it('wraps updateOne with printjson', () => {
    const script = 'db.users.updateOne({ _id: "1" }, { $set: { name: "new" } })'
    expect(wrapScriptForOutput(script)).toBe('printjson(db.users.updateOne({ _id: "1" }, { $set: { name: "new" } }))')
  })

  it('wraps deleteMany with printjson', () => {
    const script = 'db.users.deleteMany({ active: false })'
    expect(wrapScriptForOutput(script)).toBe('printjson(db.users.deleteMany({ active: false }))')
  })

  it('wraps drop with printjson', () => {
    const script = 'db.tempCollection.drop()'
    expect(wrapScriptForOutput(script)).toBe('printjson(db.tempCollection.drop())')
  })

  it('does not wrap if already has printjson', () => {
    const script = 'printjson(db.users.insertOne({ name: "test" }))'
    expect(wrapScriptForOutput(script)).toBe(script)
  })

  it('does not wrap if already has print', () => {
    const script = 'var result = db.users.insertOne({ name: "test" }); print(result)'
    expect(wrapScriptForOutput(script)).toBe(script)
  })

  it('does not wrap if has toArray', () => {
    const script = 'db.users.find({}).toArray()'
    expect(wrapScriptForOutput(script)).toBe(script)
  })

  it('does not wrap aggregate without toArray', () => {
    // Aggregate returns a cursor, not a write operation
    const script = 'db.users.aggregate([{ $match: {} }])'
    expect(wrapScriptForOutput(script)).toBe(script)
  })

  it('handles trailing semicolon', () => {
    const script = 'db.users.insertOne({ name: "test" });'
    expect(wrapScriptForOutput(script)).toBe('printjson(db.users.insertOne({ name: "test" }))')
  })

  it('wraps only last statement in multi-statement script', () => {
    const script = 'var x = 1; db.users.insertOne({ count: x })'
    expect(wrapScriptForOutput(script)).toBe('var x = 1; printjson(db.users.insertOne({ count: x }))')
  })

  it('handles getCollection syntax', () => {
    const script = 'db.getCollection("users").insertOne({ name: "test" })'
    expect(wrapScriptForOutput(script)).toBe('printjson(db.getCollection("users").insertOne({ name: "test" }))')
  })

  it('returns empty string for empty input', () => {
    expect(wrapScriptForOutput('')).toBe('')
    expect(wrapScriptForOutput(null)).toBe('')
    expect(wrapScriptForOutput(undefined)).toBe('')
  })

  it('adds printjson for variable assignment with write operation', () => {
    const script = 'var result = db.users.insertOne({ name: "test" })'
    expect(wrapScriptForOutput(script)).toBe('var result = db.users.insertOne({ name: "test" }); printjson(result)')
  })

  it('adds printjson for let assignment with write operation', () => {
    const script = 'let deleted = db.users.deleteMany({ active: false })'
    expect(wrapScriptForOutput(script)).toBe('let deleted = db.users.deleteMany({ active: false }); printjson(deleted)')
  })

  it('adds printjson for const assignment with write operation', () => {
    const script = 'const updated = db.users.updateOne({ _id: 1 }, { $set: { x: 1 } })'
    expect(wrapScriptForOutput(script)).toBe('const updated = db.users.updateOne({ _id: 1 }, { $set: { x: 1 } }); printjson(updated)')
  })

  it('handles multi-statement script with multiple write operation variables', () => {
    const script = 'var inserted = db.users.insertOne({ x: 1 }); var deleted = db.users.deleteMany({ old: true })'
    expect(wrapScriptForOutput(script)).toBe('var inserted = db.users.insertOne({ x: 1 }); var deleted = db.users.deleteMany({ old: true }); printjson({ inserted, deleted })')
  })

  it('handles three write operation variables', () => {
    const script = 'var a = db.users.insertOne({ x: 1 }); var b = db.users.updateOne({}, {}); var c = db.users.deleteOne({})'
    expect(wrapScriptForOutput(script)).toBe('var a = db.users.insertOne({ x: 1 }); var b = db.users.updateOne({}, {}); var c = db.users.deleteOne({}); printjson({ a, b, c })')
  })

  it('does not wrap variable assignment without write operation', () => {
    const script = 'var docs = db.users.find({}).toArray()'
    expect(wrapScriptForOutput(script)).toBe(script)
  })
})
