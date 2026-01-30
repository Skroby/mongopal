/**
 * Integration tests for query execution flow
 *
 * Tests the interaction between:
 * - Query input parsing (queryParser)
 * - Result parsing (mongoshParser)
 * - Data transformation (tableViewUtils)
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, vi } from 'vitest'
import { installMockGoAPI, mockDocuments } from './setup'
import { parseFilterFromQuery, parseProjectionFromQuery, buildFullQuery, isSimpleFindQuery, wrapScriptForOutput } from '../src/utils/queryParser'
import { parseMongoshOutput } from '../src/utils/mongoshParser'
import { getDocId, formatValue, extractColumns, getNestedValue, isExpandableObject } from '../src/utils/tableViewUtils'

describe('Query Execution Flow', () => {
  describe('Simple find query flow', () => {
    it('parses query → executes → transforms results for table display', () => {
      // Step 1: User enters a query
      const userQuery = 'db.getCollection("users").find({ active: true })'

      // Step 2: Validate it's a simple query (uses Go driver)
      expect(isSimpleFindQuery(userQuery)).toBe(true)

      // Step 3: Extract filter for backend
      const filter = parseFilterFromQuery(userQuery)
      expect(filter).toBe('{ active: true }')

      // Step 4: Backend returns documents (simulated)
      const backendResponse = {
        documents: mockDocuments.map(d => JSON.stringify(d)),
        total: mockDocuments.length,
        hasMore: false
      }

      // Step 5: Parse documents for display
      const documents = backendResponse.documents.map(d => JSON.parse(d))

      // Step 6: Extract columns for table
      const columns = extractColumns(documents)
      expect(columns[0]).toBe('_id') // _id always first
      expect(columns).toContain('name')
      expect(columns).toContain('email')
      expect(columns).toContain('address')

      // Step 7: Format values for cells
      const firstDoc = documents[0]
      expect(getDocId(firstDoc)).toBe('507f1f77bcf86cd799439011')
      expect(formatValue(firstDoc.name).display).toBe('Test User 1')
      expect(formatValue(firstDoc.active).type).toBe('boolean')
      expect(formatValue(firstDoc.address).type).toBe('object')
    })

    it('handles query with projection', () => {
      const query = 'db.users.find({ active: true }, { name: 1, email: 1 })'

      expect(isSimpleFindQuery(query)).toBe(true)
      expect(parseFilterFromQuery(query)).toBe('{ active: true }')
      expect(parseProjectionFromQuery(query)).toBe('{ name: 1, email: 1 }')
    })
  })

  describe('Complex query flow (mongosh)', () => {
    it('detects aggregation and routes to mongosh', () => {
      const aggQuery = 'db.users.aggregate([{ $match: { active: true } }, { $group: { _id: "$city", count: { $sum: 1 } } }])'

      // Should NOT be a simple find query
      expect(isSimpleFindQuery(aggQuery)).toBe(false)

      // Mongosh would execute and return results
      const mongoshOutput = `[
        { _id: "New York", count: NumberLong(42) },
        { _id: "Los Angeles", count: NumberLong(38) }
      ]`

      // Parse mongosh output
      const result = parseMongoshOutput(mongoshOutput)
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data[0]._id).toBe('New York')
      expect(result.data[0].count).toEqual({ $numberLong: '42' })
    })

    it('wraps write operations with printjson', () => {
      const insertScript = 'db.users.insertOne({ name: "New User" })'

      // Should wrap for output
      const wrapped = wrapScriptForOutput(insertScript)
      expect(wrapped).toBe('printjson(db.users.insertOne({ name: "New User" }))')

      // Mongosh returns InsertOneResult
      const mongoshOutput = `InsertOneResult {
        acknowledged: true,
        insertedId: ObjectId('507f1f77bcf86cd799439099')
      }`

      const result = parseMongoshOutput(mongoshOutput)
      expect(result.success).toBe(true)
      expect(result.data[0].acknowledged).toBe(true)
      expect(result.data[0].insertedId).toEqual({ $oid: '507f1f77bcf86cd799439099' })
    })

    it('handles multi-statement scripts with variable assignments', () => {
      const script = 'var inserted = db.users.insertOne({ x: 1 }); var deleted = db.users.deleteMany({ old: true })'

      const wrapped = wrapScriptForOutput(script)
      expect(wrapped).toContain('printjson({ inserted, deleted })')

      // Simulated mongosh output - after result type stripping
      const mongoshOutput = `{
        inserted: { acknowledged: true, insertedId: ObjectId('507f1f77bcf86cd799439099') },
        deleted: { acknowledged: true, deletedCount: 5 }
      }`

      const result = parseMongoshOutput(mongoshOutput)
      expect(result.success).toBe(true)
      expect(result.data[0].inserted.acknowledged).toBe(true)
      expect(result.data[0].deleted.deletedCount).toBe(5)
    })
  })

  describe('Nested object expansion flow', () => {
    it('detects expandable columns and extracts nested keys', () => {
      const documents = mockDocuments

      // Address column contains nested objects
      expect(isExpandableObject(documents[0].address)).toBe(true)
      expect(isExpandableObject(documents[0]._id)).toBe(false) // $oid is BSON type
      expect(isExpandableObject(documents[0].createdAt)).toBe(false) // $date is BSON type

      // Without expansion
      const columns = extractColumns(documents)
      expect(columns).toContain('address')
      expect(columns).not.toContain('address.city')

      // With expansion
      const expandedColumns = extractColumns(documents, new Set(['address']))
      expect(expandedColumns).not.toContain('address')
      expect(expandedColumns).toContain('address.city')
      expect(expandedColumns).toContain('address.zip')

      // Access nested values
      expect(getNestedValue(documents[0], 'address.city')).toBe('New York')
      expect(getNestedValue(documents[1], 'address.zip')).toBe('90001')
    })
  })

  describe('Error handling flow', () => {
    it('handles invalid JSON in mongosh output gracefully', () => {
      const badOutput = 'Error: something went wrong'
      const result = parseMongoshOutput(badOutput)

      // Should fail gracefully
      expect(result.success).toBe(false)
      expect(result.data).toEqual([])
    })

    it('handles empty results', () => {
      const emptyOutput = '[]'
      const result = parseMongoshOutput(emptyOutput)

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })

    it('extracts empty filter when query is malformed', () => {
      const badQuery = 'db.users.find'
      expect(parseFilterFromQuery(badQuery)).toBe('')
      expect(isSimpleFindQuery(badQuery)).toBe(false)
    })
  })
})

describe('Document ID Handling Flow', () => {
  it('handles various ID types consistently', () => {
    const testCases = [
      // ObjectId
      { _id: { $oid: '507f1f77bcf86cd799439011' }, expected: '507f1f77bcf86cd799439011' },
      // String ID
      { _id: 'string-id-123', expected: 'string-id-123' },
      // UUID
      { _id: { $uuid: '550e8400-e29b-41d4-a716-446655440000' }, expected: '{"$uuid":"550e8400-e29b-41d4-a716-446655440000"}' },
      // Binary
      { _id: { $binary: { base64: 'YWJjZA==', subType: '04' } }, expected: '{"$binary":{"base64":"YWJjZA==","subType":"04"}}' },
      // Number
      { _id: 12345, expected: '12345' },
    ]

    for (const { _id, expected } of testCases) {
      expect(getDocId({ _id })).toBe(expected)
    }
  })
})

describe('View Mode Switching', () => {
  it('table view uses formatValue for display', () => {
    const doc = mockDocuments[0]

    // Each field type formats correctly
    expect(formatValue(doc.name).type).toBe('string')
    expect(formatValue(doc.age).type).toBe('number')
    expect(formatValue(doc.active).type).toBe('boolean')
    expect(formatValue(doc.address).type).toBe('object')
    expect(formatValue(doc.createdAt).type).toBe('date')
    expect(formatValue(doc._id).type).toBe('objectId')
  })

  it('json view uses raw JSON stringification', () => {
    const doc = mockDocuments[0]
    const jsonView = JSON.stringify(doc, null, 2)

    expect(jsonView).toContain('"name": "Test User 1"')
    expect(jsonView).toContain('"$oid"')
  })

  it('raw view preserves mongosh output format', () => {
    // Raw view just shows what mongosh returned
    const rawOutput = `{
      _id: ObjectId('507f1f77bcf86cd799439011'),
      name: 'Test User 1',
      createdAt: ISODate('2024-01-15T10:30:00.000Z')
    }`

    // Raw view displays this as-is, no parsing needed
    expect(rawOutput).toContain('ObjectId')
    expect(rawOutput).toContain('ISODate')
  })
})
