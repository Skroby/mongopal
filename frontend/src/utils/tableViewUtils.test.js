import { describe, it, expect } from 'vitest'
import {
  getDocId,
  formatValue,
  getRawValue,
  getNestedValue,
  isExpandableObject,
  extractColumns,
  getNestedKeys,
  columnHasExpandableObjects,
} from './tableViewUtils'

describe('getDocId', () => {
  it('returns null for null document', () => {
    expect(getDocId(null)).toBe(null)
  })

  it('returns null for undefined document', () => {
    expect(getDocId(undefined)).toBe(null)
  })

  it('returns null for document without _id', () => {
    expect(getDocId({ name: 'test' })).toBe(null)
  })

  it('returns null for document with null _id', () => {
    expect(getDocId({ _id: null })).toBe(null)
  })

  it('returns string ID directly', () => {
    expect(getDocId({ _id: 'my-string-id' })).toBe('my-string-id')
  })

  it('returns hex string for ObjectId', () => {
    expect(getDocId({ _id: { $oid: '507f1f77bcf86cd799439011' } })).toBe('507f1f77bcf86cd799439011')
  })

  it('returns Extended JSON for Binary/UUID', () => {
    const doc = { _id: { $binary: { base64: 'YWJjZA==', subType: '03' } } }
    expect(getDocId(doc)).toBe(JSON.stringify(doc._id))
  })

  it('returns Extended JSON for $uuid type', () => {
    const doc = { _id: { $uuid: '550e8400-e29b-41d4-a716-446655440000' } }
    expect(getDocId(doc)).toBe(JSON.stringify(doc._id))
  })

  it('handles nested $oid in document', () => {
    const doc = { _id: { $oid: 'abc123def456789012345678' } }
    expect(getDocId(doc)).toBe('abc123def456789012345678')
  })

  it('handles numeric _id', () => {
    const doc = { _id: 12345 }
    expect(getDocId(doc)).toBe(JSON.stringify(12345))
  })
})

describe('formatValue', () => {
  it('handles null', () => {
    const result = formatValue(null)
    expect(result.type).toBe('null')
    expect(result.display).toBe('null')
  })

  it('handles undefined', () => {
    const result = formatValue(undefined)
    expect(result.type).toBe('undefined')
    expect(result.display).toBe('undefined')
  })

  it('handles boolean true', () => {
    const result = formatValue(true)
    expect(result.type).toBe('boolean')
    expect(result.display).toBe('true')
    expect(result.boolValue).toBe(true)
  })

  it('handles boolean false', () => {
    const result = formatValue(false)
    expect(result.type).toBe('boolean')
    expect(result.display).toBe('false')
    expect(result.boolValue).toBe(false)
  })

  it('handles integers', () => {
    const result = formatValue(42)
    expect(result.type).toBe('number')
    expect(result.display).toBe('42')
  })

  it('handles floats', () => {
    const result = formatValue(3.14159)
    expect(result.type).toBe('number')
    expect(result.display).toBe('3.14159')
  })

  it('handles short strings', () => {
    const result = formatValue('hello')
    expect(result.type).toBe('string')
    expect(result.display).toBe('hello')
    expect(result.truncated).toBeFalsy()
  })

  it('truncates long strings', () => {
    const longString = 'a'.repeat(100)
    const result = formatValue(longString)
    expect(result.type).toBe('string')
    expect(result.display).toBe('a'.repeat(50) + '...')
    expect(result.truncated).toBe(true)
  })

  it('handles exactly 50 character strings without truncation', () => {
    const exactString = 'a'.repeat(50)
    const result = formatValue(exactString)
    expect(result.display).toBe(exactString)
    expect(result.truncated).toBeFalsy()
  })

  it('handles empty arrays', () => {
    const result = formatValue([])
    expect(result.type).toBe('array')
    expect(result.display).toBe('[0 items]')
    expect(result.length).toBe(0)
  })

  it('handles arrays with items', () => {
    const result = formatValue([1, 2, 3])
    expect(result.type).toBe('array')
    expect(result.display).toBe('[3 items]')
    expect(result.length).toBe(3)
  })

  it('handles $date with ISO string', () => {
    const result = formatValue({ $date: '2023-01-15T10:30:00Z' })
    expect(result.type).toBe('date')
    expect(result.display).toBe('2023-01-15T10:30:00.000Z')
  })

  it('handles $date with $numberLong', () => {
    const result = formatValue({ $date: { $numberLong: '1673778600000' } })
    expect(result.type).toBe('date')
    expect(result.display).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
  })

  it('handles invalid $date', () => {
    const result = formatValue({ $date: 'not-a-date' })
    expect(result.type).toBe('date')
    expect(result.display).toBe('Invalid Date')
    expect(result.invalid).toBe(true)
  })

  it('handles $oid', () => {
    const result = formatValue({ $oid: '507f1f77bcf86cd799439011' })
    expect(result.type).toBe('objectId')
    expect(result.display).toBe('ObjectId("507f1f77...")')
    expect(result.fullId).toBe('507f1f77bcf86cd799439011')
  })

  it('handles $numberLong', () => {
    const result = formatValue({ $numberLong: '9223372036854775807' })
    expect(result.type).toBe('numberLong')
    expect(result.display).toBe('9223372036854775807')
  })

  it('handles $numberInt', () => {
    const result = formatValue({ $numberInt: '42' })
    expect(result.type).toBe('numberInt')
    expect(result.display).toBe('42')
  })

  it('handles $numberDouble', () => {
    const result = formatValue({ $numberDouble: '3.14' })
    expect(result.type).toBe('numberDouble')
    expect(result.display).toBe('3.14')
  })

  it('handles $binary', () => {
    const result = formatValue({ $binary: { base64: 'SGVsbG8gV29ybGQh', subType: '00' } })
    expect(result.type).toBe('binary')
    expect(result.display).toBe('Binary("SGVsbG8gV29y...")')
    expect(result.base64).toBe('SGVsbG8gV29ybGQh')
  })

  it('handles $binary with empty base64', () => {
    const result = formatValue({ $binary: { subType: '00' } })
    expect(result.type).toBe('binary')
    expect(result.display).toBe('Binary("...")')
  })

  it('handles $uuid', () => {
    const result = formatValue({ $uuid: '550e8400-e29b-41d4-a716-446655440000' })
    expect(result.type).toBe('uuid')
    expect(result.display).toBe('UUID("550e8400...")')
    expect(result.uuid).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('handles plain objects', () => {
    const result = formatValue({ name: 'John', age: 30 })
    expect(result.type).toBe('object')
    expect(result.display).toBe('{...}')
  })

  it('handles empty objects', () => {
    const result = formatValue({})
    expect(result.type).toBe('object')
    expect(result.display).toBe('{...}')
  })
})

describe('getRawValue', () => {
  it('returns "null" for null', () => {
    expect(getRawValue(null)).toBe('null')
  })

  it('returns "undefined" for undefined', () => {
    expect(getRawValue(undefined)).toBe('undefined')
  })

  it('returns string representation of numbers', () => {
    expect(getRawValue(42)).toBe('42')
    expect(getRawValue(3.14)).toBe('3.14')
  })

  it('returns string representation of booleans', () => {
    expect(getRawValue(true)).toBe('true')
    expect(getRawValue(false)).toBe('false')
  })

  it('returns strings as-is', () => {
    expect(getRawValue('hello')).toBe('hello')
  })

  it('returns formatted JSON for objects', () => {
    const obj = { name: 'John', age: 30 }
    expect(getRawValue(obj)).toBe(JSON.stringify(obj, null, 2))
  })

  it('returns formatted JSON for arrays', () => {
    const arr = [1, 2, 3]
    expect(getRawValue(arr)).toBe(JSON.stringify(arr, null, 2))
  })

  it('handles nested objects', () => {
    const obj = { user: { name: 'John', address: { city: 'NYC' } } }
    expect(getRawValue(obj)).toBe(JSON.stringify(obj, null, 2))
  })

  it('handles BSON types as JSON', () => {
    const bson = { $oid: '507f1f77bcf86cd799439011' }
    expect(getRawValue(bson)).toBe(JSON.stringify(bson, null, 2))
  })
})

describe('getNestedValue', () => {
  it('gets simple property', () => {
    expect(getNestedValue({ name: 'John' }, 'name')).toBe('John')
  })

  it('gets nested property', () => {
    const obj = { address: { city: 'NYC' } }
    expect(getNestedValue(obj, 'address.city')).toBe('NYC')
  })

  it('gets deeply nested property', () => {
    const obj = { level1: { level2: { level3: { value: 42 } } } }
    expect(getNestedValue(obj, 'level1.level2.level3.value')).toBe(42)
  })

  it('returns undefined for missing simple path', () => {
    expect(getNestedValue({ name: 'John' }, 'age')).toBe(undefined)
  })

  it('returns undefined for missing nested path', () => {
    const obj = { address: { city: 'NYC' } }
    expect(getNestedValue(obj, 'address.country')).toBe(undefined)
  })

  it('returns undefined when intermediate is null', () => {
    const obj = { address: null }
    expect(getNestedValue(obj, 'address.city')).toBe(undefined)
  })

  it('returns undefined when intermediate is undefined', () => {
    const obj = { address: undefined }
    expect(getNestedValue(obj, 'address.city')).toBe(undefined)
  })

  it('handles null object', () => {
    expect(getNestedValue(null, 'name')).toBe(undefined)
  })

  it('handles undefined object', () => {
    expect(getNestedValue(undefined, 'name')).toBe(undefined)
  })

  it('returns undefined for empty path', () => {
    expect(getNestedValue({ name: 'John' }, '')).toBe(undefined)
  })

  it('handles array access with numeric keys', () => {
    const obj = { items: ['a', 'b', 'c'] }
    expect(getNestedValue(obj, 'items.1')).toBe('b')
  })
})

describe('isExpandableObject', () => {
  it('returns true for plain objects', () => {
    expect(isExpandableObject({ name: 'John', age: 30 })).toBe(true)
  })

  it('returns true for empty objects', () => {
    expect(isExpandableObject({})).toBe(true)
  })

  it('returns true for nested plain objects', () => {
    expect(isExpandableObject({ address: { city: 'NYC' } })).toBe(true)
  })

  it('returns false for arrays', () => {
    expect(isExpandableObject([1, 2, 3])).toBe(false)
  })

  it('returns false for empty arrays', () => {
    expect(isExpandableObject([])).toBe(false)
  })

  it('returns false for null', () => {
    expect(isExpandableObject(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isExpandableObject(undefined)).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isExpandableObject('string')).toBe(false)
    expect(isExpandableObject(42)).toBe(false)
    expect(isExpandableObject(true)).toBe(false)
  })

  it('returns false for $oid', () => {
    expect(isExpandableObject({ $oid: '507f1f77bcf86cd799439011' })).toBe(false)
  })

  it('returns false for $date', () => {
    expect(isExpandableObject({ $date: '2023-01-15T10:30:00Z' })).toBe(false)
  })

  it('returns false for $date with $numberLong', () => {
    expect(isExpandableObject({ $date: { $numberLong: '1673778600000' } })).toBe(false)
  })

  it('returns false for $numberLong', () => {
    expect(isExpandableObject({ $numberLong: '123' })).toBe(false)
  })

  it('returns false for $numberInt', () => {
    expect(isExpandableObject({ $numberInt: '42' })).toBe(false)
  })

  it('returns false for $numberDouble', () => {
    expect(isExpandableObject({ $numberDouble: '3.14' })).toBe(false)
  })

  it('returns false for $binary', () => {
    expect(isExpandableObject({ $binary: { base64: 'YWJj', subType: '00' } })).toBe(false)
  })

  it('returns false for $uuid', () => {
    expect(isExpandableObject({ $uuid: '550e8400-e29b-41d4-a716-446655440000' })).toBe(false)
  })

  it('returns false for $timestamp', () => {
    expect(isExpandableObject({ $timestamp: { t: 1234567890, i: 1 } })).toBe(false)
  })

  it('returns false for $regularExpression', () => {
    expect(isExpandableObject({ $regularExpression: { pattern: '^test', options: 'i' } })).toBe(false)
  })

  it('returns false for $minKey', () => {
    expect(isExpandableObject({ $minKey: 1 })).toBe(false)
  })

  it('returns false for $maxKey', () => {
    expect(isExpandableObject({ $maxKey: 1 })).toBe(false)
  })
})

describe('extractColumns', () => {
  it('extracts columns from single document', () => {
    const docs = [{ _id: '1', name: 'John', age: 30 }]
    const result = extractColumns(docs)
    expect(result).toEqual(['_id', 'age', 'name'])
  })

  it('extracts columns from multiple documents', () => {
    const docs = [
      { _id: '1', name: 'John' },
      { _id: '2', age: 25 },
    ]
    const result = extractColumns(docs)
    expect(result).toEqual(['_id', 'age', 'name'])
  })

  it('places _id first', () => {
    const docs = [{ name: 'John', _id: '1', zebra: true, apple: 1 }]
    const result = extractColumns(docs)
    expect(result[0]).toBe('_id')
    expect(result).toEqual(['_id', 'apple', 'name', 'zebra'])
  })

  it('sorts columns alphabetically after _id', () => {
    const docs = [{ _id: '1', z: 1, a: 2, m: 3 }]
    const result = extractColumns(docs)
    expect(result).toEqual(['_id', 'a', 'm', 'z'])
  })

  it('handles empty document array', () => {
    const result = extractColumns([])
    expect(result).toEqual([])
  })

  it('handles documents without _id', () => {
    const docs = [{ name: 'John', age: 30 }]
    const result = extractColumns(docs)
    expect(result).toEqual(['age', 'name'])
  })

  it('expands columns when expandedColumns is provided', () => {
    const docs = [{ _id: '1', address: { city: 'NYC', zip: '10001' } }]
    const expanded = new Set(['address'])
    const result = extractColumns(docs, expanded)
    expect(result).toEqual(['_id', 'address.city', 'address.zip'])
  })

  it('handles deeply nested expansion', () => {
    const docs = [{ _id: '1', user: { profile: { name: 'John', age: 30 } } }]
    const expanded = new Set(['user', 'user.profile'])
    const result = extractColumns(docs, expanded)
    expect(result).toEqual(['_id', 'user.profile.age', 'user.profile.name'])
  })

  it('keeps unexpanded columns as single entry', () => {
    const docs = [
      { _id: '1', address: { city: 'NYC' }, name: 'John' }
    ]
    const result = extractColumns(docs)
    expect(result).toEqual(['_id', 'address', 'name'])
  })

  it('handles mixed expanded and unexpanded columns', () => {
    const docs = [
      { _id: '1', address: { city: 'NYC' }, profile: { age: 30 } }
    ]
    const expanded = new Set(['address'])
    const result = extractColumns(docs, expanded)
    expect(result).toContain('address.city')
    expect(result).toContain('profile')
  })

  it('handles expansion of column with no sub-keys', () => {
    const docs = [{ _id: '1', value: 'simple' }]
    const expanded = new Set(['value'])
    const result = extractColumns(docs, expanded)
    expect(result).toEqual(['_id', 'value'])
  })

  it('does not expand BSON type columns', () => {
    const docs = [{ _id: '1', createdAt: { $date: '2023-01-01' } }]
    const expanded = new Set(['createdAt'])
    const result = extractColumns(docs, expanded)
    expect(result).toEqual(['_id', 'createdAt'])
  })
})

describe('getNestedKeys', () => {
  it('extracts keys from nested objects', () => {
    const docs = [{ address: { city: 'NYC', zip: '10001' } }]
    const result = getNestedKeys(docs, 'address')
    expect(result).toEqual(['city', 'zip'])
  })

  it('combines keys from multiple documents', () => {
    const docs = [
      { profile: { name: 'John' } },
      { profile: { age: 30 } },
      { profile: { name: 'Jane', email: 'jane@example.com' } },
    ]
    const result = getNestedKeys(docs, 'profile')
    expect(result).toEqual(['age', 'email', 'name'])
  })

  it('returns sorted keys', () => {
    const docs = [{ data: { z: 1, a: 2, m: 3 } }]
    const result = getNestedKeys(docs, 'data')
    expect(result).toEqual(['a', 'm', 'z'])
  })

  it('returns empty array for primitive column', () => {
    const docs = [{ name: 'John' }]
    const result = getNestedKeys(docs, 'name')
    expect(result).toEqual([])
  })

  it('returns empty array for missing column', () => {
    const docs = [{ name: 'John' }]
    const result = getNestedKeys(docs, 'address')
    expect(result).toEqual([])
  })

  it('returns empty array for BSON type column', () => {
    const docs = [{ _id: { $oid: '507f1f77bcf86cd799439011' } }]
    const result = getNestedKeys(docs, '_id')
    expect(result).toEqual([])
  })

  it('returns empty array for array column', () => {
    const docs = [{ items: [1, 2, 3] }]
    const result = getNestedKeys(docs, 'items')
    expect(result).toEqual([])
  })

  it('handles nested paths', () => {
    const docs = [{ level1: { level2: { a: 1, b: 2 } } }]
    const result = getNestedKeys(docs, 'level1.level2')
    expect(result).toEqual(['a', 'b'])
  })

  it('skips documents without the column', () => {
    const docs = [
      { profile: { name: 'John' } },
      { other: 'data' },
      { profile: { age: 30 } },
    ]
    const result = getNestedKeys(docs, 'profile')
    expect(result).toEqual(['age', 'name'])
  })
})

describe('columnHasExpandableObjects', () => {
  it('returns true when column has plain objects', () => {
    const docs = [{ address: { city: 'NYC' } }]
    expect(columnHasExpandableObjects(docs, 'address')).toBe(true)
  })

  it('returns true when any document has expandable object', () => {
    const docs = [
      { address: 'simple string' },
      { address: { city: 'NYC' } },
      { address: null },
    ]
    expect(columnHasExpandableObjects(docs, 'address')).toBe(true)
  })

  it('returns false when column has primitives', () => {
    const docs = [
      { name: 'John' },
      { name: 'Jane' },
    ]
    expect(columnHasExpandableObjects(docs, 'name')).toBe(false)
  })

  it('returns false when column has arrays', () => {
    const docs = [{ items: [1, 2, 3] }]
    expect(columnHasExpandableObjects(docs, 'items')).toBe(false)
  })

  it('returns false when column has BSON types', () => {
    const docs = [{ _id: { $oid: '507f1f77bcf86cd799439011' } }]
    expect(columnHasExpandableObjects(docs, '_id')).toBe(false)
  })

  it('returns false for $date BSON type', () => {
    const docs = [{ createdAt: { $date: '2023-01-01' } }]
    expect(columnHasExpandableObjects(docs, 'createdAt')).toBe(false)
  })

  it('returns false when column is missing in all documents', () => {
    const docs = [{ name: 'John' }, { name: 'Jane' }]
    expect(columnHasExpandableObjects(docs, 'address')).toBe(false)
  })

  it('returns false for empty documents array', () => {
    expect(columnHasExpandableObjects([], 'address')).toBe(false)
  })

  it('returns true for empty objects', () => {
    const docs = [{ metadata: {} }]
    expect(columnHasExpandableObjects(docs, 'metadata')).toBe(true)
  })

  it('handles nested column paths', () => {
    const docs = [{ user: { profile: { settings: { theme: 'dark' } } } }]
    expect(columnHasExpandableObjects(docs, 'user.profile.settings')).toBe(true)
  })

  it('returns false for nested BSON types', () => {
    const docs = [{ user: { createdAt: { $date: '2023-01-01' } } }]
    expect(columnHasExpandableObjects(docs, 'user.createdAt')).toBe(false)
  })
})
