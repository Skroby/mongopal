import { describe, it, expect } from 'vitest'
import {
  extractFieldNamesFromObject,
  extractFieldNamesFromFilter,
  validateFieldNames,
  validateFilter,
  fieldWarningsToMonacoDiagnostics
} from './fieldValidator'

describe('fieldValidator', () => {
  describe('extractFieldNamesFromObject', () => {
    it('extracts simple field names', () => {
      const query = { name: 'test', age: 25 }
      const fields = extractFieldNamesFromObject(query)
      expect(fields).toEqual(new Set(['name', 'age']))
    })

    it('extracts fields with operators', () => {
      const query = { age: { $gt: 18, $lt: 65 } }
      const fields = extractFieldNamesFromObject(query)
      expect(fields).toEqual(new Set(['age']))
    })

    it('extracts fields from $and conditions', () => {
      const query = {
        $and: [
          { name: 'test' },
          { age: { $gt: 18 } }
        ]
      }
      const fields = extractFieldNamesFromObject(query)
      expect(fields).toEqual(new Set(['name', 'age']))
    })

    it('extracts fields from $or conditions', () => {
      const query = {
        $or: [
          { status: 'active' },
          { status: 'pending' }
        ]
      }
      const fields = extractFieldNamesFromObject(query)
      expect(fields).toEqual(new Set(['status']))
    })

    it('extracts nested field paths (dot notation)', () => {
      const query = { 'address.city': 'NYC', 'address.zip': 10001 }
      const fields = extractFieldNamesFromObject(query)
      expect(fields).toEqual(new Set(['address.city', 'address.zip']))
    })

    it('extracts fields from $elemMatch', () => {
      const query = {
        items: {
          $elemMatch: {
            name: 'test',
            quantity: { $gt: 5 }
          }
        }
      }
      const fields = extractFieldNamesFromObject(query)
      expect(fields.has('items')).toBe(true)
      expect(fields.has('items.name')).toBe(true)
      expect(fields.has('items.quantity')).toBe(true)
    })

    it('handles empty query', () => {
      const fields = extractFieldNamesFromObject({})
      expect(fields).toEqual(new Set())
    })

    it('handles null/undefined', () => {
      expect(extractFieldNamesFromObject(null)).toEqual(new Set())
      expect(extractFieldNamesFromObject(undefined)).toEqual(new Set())
    })

    it('ignores all MongoDB operators', () => {
      const query = {
        $and: [{ field1: 1 }],
        $or: [{ field2: 2 }],
        field3: { $in: [1, 2, 3] },
        field4: { $exists: true },
        field5: { $regex: 'test', $options: 'i' }
      }
      const fields = extractFieldNamesFromObject(query)
      expect(fields.has('$and')).toBe(false)
      expect(fields.has('$or')).toBe(false)
      expect(fields.has('$in')).toBe(false)
      expect(fields.has('$exists')).toBe(false)
      expect(fields.has('$regex')).toBe(false)
      expect(fields.has('$options')).toBe(false)
      expect(fields).toEqual(new Set(['field1', 'field2', 'field3', 'field4', 'field5']))
    })

    it('extracts fields from complex nested query', () => {
      const query = {
        $and: [
          { 'user.name': 'John' },
          {
            $or: [
              { 'user.age': { $gte: 18 } },
              { 'user.verified': true }
            ]
          }
        ]
      }
      const fields = extractFieldNamesFromObject(query)
      expect(fields).toEqual(new Set(['user.name', 'user.age', 'user.verified']))
    })
  })

  describe('extractFieldNamesFromFilter', () => {
    it('parses JSON filter string', () => {
      const filter = '{ "name": "test", "age": 25 }'
      const fields = extractFieldNamesFromFilter(filter)
      expect(fields).toEqual(new Set(['name', 'age']))
    })

    it('handles empty filter', () => {
      expect(extractFieldNamesFromFilter('')).toEqual(new Set())
      expect(extractFieldNamesFromFilter('{}')).toEqual(new Set())
    })

    it('returns empty set for invalid JSON', () => {
      const fields = extractFieldNamesFromFilter('not valid json')
      expect(fields).toEqual(new Set())
    })

    it('handles whitespace-only input', () => {
      expect(extractFieldNamesFromFilter('   ')).toEqual(new Set())
    })

    it('parses filter with operators', () => {
      const filter = '{ "price": { "$gt": 100, "$lt": 500 } }'
      const fields = extractFieldNamesFromFilter(filter)
      expect(fields).toEqual(new Set(['price']))
    })
  })

  describe('validateFieldNames', () => {
    it('returns empty array when all fields are known', () => {
      const queryFields = new Set(['name', 'age'])
      const schemaFields = new Set(['name', 'age', 'email'])
      const warnings = validateFieldNames(queryFields, schemaFields)
      expect(warnings).toEqual([])
    })

    it('returns warnings for unknown fields', () => {
      const queryFields = new Set(['name', 'unknownField'])
      const schemaFields = new Set(['name', 'age'])
      const warnings = validateFieldNames(queryFields, schemaFields)
      expect(warnings).toHaveLength(1)
      expect(warnings[0].field).toBe('unknownField')
    })

    it('allows prefix matches for nested fields', () => {
      const queryFields = new Set(['address'])
      const schemaFields = new Set(['address.city', 'address.street', 'name'])
      const warnings = validateFieldNames(queryFields, schemaFields)
      expect(warnings).toEqual([])
    })

    it('warns for nested paths not in schema but parent exists', () => {
      const queryFields = new Set(['address.zip'])
      const schemaFields = new Set(['address', 'name'])
      const warnings = validateFieldNames(queryFields, schemaFields)
      expect(warnings).toHaveLength(1)
      expect(warnings[0].field).toBe('address.zip')
      expect(warnings[0].message).toContain('not found in sampled')
    })

    it('handles empty schema fields', () => {
      const queryFields = new Set(['name'])
      const schemaFields = new Set()
      const warnings = validateFieldNames(queryFields, schemaFields)
      expect(warnings).toEqual([])
    })

    it('handles null/undefined inputs', () => {
      expect(validateFieldNames(null, new Set(['a']))).toEqual([])
      expect(validateFieldNames(new Set(['a']), null)).toEqual([])
    })

    it('returns warnings for completely unknown fields', () => {
      const queryFields = new Set(['totallyUnknown'])
      const schemaFields = new Set(['name', 'age'])
      const warnings = validateFieldNames(queryFields, schemaFields)
      expect(warnings).toHaveLength(1)
      expect(warnings[0].field).toBe('totallyUnknown')
      expect(warnings[0].message).toBe("Unknown field 'totallyUnknown'")
    })

    it('handles multiple unknown fields', () => {
      const queryFields = new Set(['unknown1', 'known', 'unknown2'])
      const schemaFields = new Set(['known'])
      const warnings = validateFieldNames(queryFields, schemaFields)
      expect(warnings).toHaveLength(2)
      expect(warnings.map(w => w.field).sort()).toEqual(['unknown1', 'unknown2'])
    })
  })

  describe('validateFilter', () => {
    it('validates filter string against schema', () => {
      const filter = '{ "name": "test", "unknownField": "value" }'
      const schemaFields = new Set(['name', 'age'])
      const warnings = validateFilter(filter, schemaFields)
      expect(warnings).toHaveLength(1)
      expect(warnings[0].field).toBe('unknownField')
    })

    it('returns empty for valid filter', () => {
      const filter = '{ "name": "test" }'
      const schemaFields = new Set(['name', 'age'])
      const warnings = validateFilter(filter, schemaFields)
      expect(warnings).toEqual([])
    })

    it('handles empty filter', () => {
      const warnings = validateFilter('{}', new Set(['name']))
      expect(warnings).toEqual([])
    })

    it('handles complex filter with $and/$or', () => {
      const filter = JSON.stringify({
        $and: [
          { validField: 'a' },
          { invalidField: 'b' }
        ]
      })
      const schemaFields = new Set(['validField'])
      const warnings = validateFilter(filter, schemaFields)
      expect(warnings).toHaveLength(1)
      expect(warnings[0].field).toBe('invalidField')
    })
  })

  describe('fieldWarningsToMonacoDiagnostics', () => {
    it('returns empty array for no warnings', () => {
      const diagnostics = fieldWarningsToMonacoDiagnostics('db.collection.find({})', [])
      expect(diagnostics).toEqual([])
    })

    it('returns empty array for null/undefined inputs', () => {
      expect(fieldWarningsToMonacoDiagnostics(null, [])).toEqual([])
      expect(fieldWarningsToMonacoDiagnostics('', [])).toEqual([])
      expect(fieldWarningsToMonacoDiagnostics('query', null)).toEqual([])
    })

    it('finds quoted field in query and returns position', () => {
      const query = 'db.collection.find({"unknownField": "value"})'
      const warnings = [{ field: 'unknownField', message: "Unknown field 'unknownField'" }]
      const diagnostics = fieldWarningsToMonacoDiagnostics(query, warnings)

      expect(diagnostics).toHaveLength(1)
      expect(diagnostics[0].message).toBe("Unknown field 'unknownField'")
      expect(diagnostics[0].severity).toBe(4) // Warning
      expect(diagnostics[0].startLine).toBe(1)
      expect(diagnostics[0].startCol).toBeGreaterThan(0)
    })

    it('finds unquoted field in query', () => {
      const query = 'db.collection.find({unknownField: "value"})'
      const warnings = [{ field: 'unknownField', message: "Unknown field 'unknownField'" }]
      const diagnostics = fieldWarningsToMonacoDiagnostics(query, warnings)

      expect(diagnostics).toHaveLength(1)
      expect(diagnostics[0].severity).toBe(4)
    })

    it('handles multiple warnings', () => {
      const query = 'db.collection.find({"field1": "a", "field2": "b"})'
      const warnings = [
        { field: 'field1', message: 'Unknown field field1' },
        { field: 'field2', message: 'Unknown field field2' }
      ]
      const diagnostics = fieldWarningsToMonacoDiagnostics(query, warnings)

      expect(diagnostics).toHaveLength(2)
    })

    it('handles multiline query', () => {
      const query = `db.collection.find({
        "unknownField": "value"
      })`
      const warnings = [{ field: 'unknownField', message: "Unknown field 'unknownField'" }]
      const diagnostics = fieldWarningsToMonacoDiagnostics(query, warnings)

      expect(diagnostics).toHaveLength(1)
      expect(diagnostics[0].startLine).toBe(2)
    })
  })
})
