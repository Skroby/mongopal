import { describe, it, expect } from 'vitest'
import { parseError, errorHasAction, getErrorSummary } from './errorParser'

describe('parseError', () => {
  describe('connection errors', () => {
    it('recognizes connection refused errors', () => {
      const result = parseError('connection refused at localhost:27017')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Unable to connect to MongoDB server')
      expect(result.action).toBe('editConnection')
      expect(result.actionLabel).toBe('Edit Connection')
    })

    it('recognizes ECONNREFUSED', () => {
      const result = parseError('Error: connect ECONNREFUSED 127.0.0.1:27017')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Unable to connect to MongoDB server')
    })

    it('recognizes server selection timeout', () => {
      const result = parseError('server selection timeout: context deadline exceeded')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toContain('connect')
    })

    it('recognizes failed to connect', () => {
      const result = parseError('failed to connect to mongodb.example.com:27017')
      expect(result.isKnown).toBe(true)
      expect(result.action).toBe('editConnection')
    })
  })

  describe('authentication errors', () => {
    it('recognizes authentication failed', () => {
      const result = parseError('authentication failed: wrong password')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Authentication failed')
      expect(result.action).toBe('editConnection')
    })

    it('recognizes not authorized', () => {
      const result = parseError('not authorized on admin to execute command')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Authentication failed')
    })

    it('recognizes SCRAM authentication errors', () => {
      const result = parseError('SCRAM authentication failed')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Authentication failed')
    })
  })

  describe('timeout errors', () => {
    it('recognizes timeout', () => {
      const result = parseError('operation timeout')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Operation timed out')
      expect(result.action).toBe('openSettings')
      expect(result.actionLabel).toBe('Open Settings')
    })

    it('recognizes context deadline exceeded', () => {
      const result = parseError('context deadline exceeded')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Operation timed out')
    })
  })

  describe('permission errors', () => {
    it('recognizes not authorized on database', () => {
      const result = parseError('not authorized on mydb to execute command')
      // Note: This could match both authentication and permission patterns
      expect(result.isKnown).toBe(true)
    })

    it('recognizes requires authentication', () => {
      const result = parseError('command requires authentication')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Permission denied')
    })

    it('recognizes insufficient privileges', () => {
      const result = parseError('user has insufficient privileges')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Permission denied')
    })
  })

  describe('JSON syntax errors', () => {
    it('recognizes invalid JSON', () => {
      const result = parseError('Invalid JSON: Unexpected token } at position 15')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Invalid JSON syntax')
      expect(result.hint).toContain('syntax')
    })

    it('recognizes Unexpected token', () => {
      const result = parseError("SyntaxError: Unexpected token 'x' at position 5")
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Invalid JSON syntax')
    })

    it('recognizes JSON.parse errors', () => {
      const result = parseError('JSON.parse: unexpected character')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Invalid JSON syntax')
    })
  })

  describe('query syntax errors', () => {
    it('recognizes invalid query', () => {
      const result = parseError('invalid query: missing closing brace')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Invalid query syntax')
    })

    it('recognizes unknown operator', () => {
      const result = parseError('unknown operator: $invalidop')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Invalid query operator')
    })

    it('recognizes operator not allowed', () => {
      const result = parseError('$where operator not allowed in this context')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Invalid query operator')
    })
  })

  describe('document errors', () => {
    it('recognizes duplicate key error', () => {
      const result = parseError('E11000 duplicate key error collection: test.users')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Duplicate key error')
      expect(result.hint).toContain('_id')
    })

    it('recognizes document not found', () => {
      const result = parseError('document not found')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Document not found')
    })

    it('recognizes document too large', () => {
      const result = parseError('document is too large (exceeds 16MB limit)')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Document too large')
      expect(result.hint).toContain('16MB')
    })
  })

  describe('mongosh errors', () => {
    it('recognizes mongosh not available', () => {
      const result = parseError('mongosh is not available on this system')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('mongosh is not installed')
      expect(result.action).toBe('openLink')
      expect(result.actionData).toContain('mongodb.com')
    })

    it('recognizes install mongosh message', () => {
      const result = parseError('Please install mongosh to run scripts')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('mongosh is not installed')
    })

    it('recognizes ReferenceError', () => {
      const result = parseError('ReferenceError: unknownVar is not defined')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Script execution error')
    })
  })

  describe('collection/database errors', () => {
    it('recognizes collection not found', () => {
      const result = parseError('ns not found: mydb.mycoll')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Collection not found')
    })

    it('recognizes namespace not found', () => {
      const result = parseError('namespace not found')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Collection not found')
    })
  })

  describe('SSL/TLS errors', () => {
    it('recognizes certificate errors', () => {
      const result = parseError('certificate verification failed')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('SSL/TLS connection error')
      expect(result.action).toBe('editConnection')
    })

    it('recognizes SSL errors', () => {
      const result = parseError('SSL handshake failed')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('SSL/TLS connection error')
    })
  })

  describe('import/export errors', () => {
    it('recognizes invalid archive', () => {
      const result = parseError('invalid archive format')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Invalid or corrupt file')
    })

    it('recognizes corrupt file', () => {
      const result = parseError('corrupt zip file detected')
      expect(result.isKnown).toBe(true)
      expect(result.friendlyMessage).toBe('Invalid or corrupt file')
    })
  })

  describe('unknown errors', () => {
    it('returns generic response for unknown errors', () => {
      const result = parseError('some completely unknown error xyz123')
      expect(result.isKnown).toBe(false)
      expect(result.friendlyMessage).toBe('An error occurred')
      expect(result.raw).toBe('some completely unknown error xyz123')
    })

    it('handles Error objects', () => {
      const error = new Error('test error message')
      const result = parseError(error)
      expect(result.raw).toBe('test error message')
    })

    it('handles null/undefined', () => {
      expect(parseError(null).raw).toBe('')
      expect(parseError(undefined).raw).toBe('')
    })
  })
})

describe('errorHasAction', () => {
  it('returns true when error has matching action', () => {
    expect(errorHasAction('connection refused', 'editConnection')).toBe(true)
    expect(errorHasAction('operation timeout', 'openSettings')).toBe(true)
    expect(errorHasAction('mongosh not available', 'openLink')).toBe(true)
  })

  it('returns false when error has different action', () => {
    expect(errorHasAction('connection refused', 'openSettings')).toBe(false)
    expect(errorHasAction('operation timeout', 'editConnection')).toBe(false)
  })

  it('returns false when error has no action', () => {
    expect(errorHasAction('duplicate key error', 'editConnection')).toBe(false)
    expect(errorHasAction('unknown error', 'openSettings')).toBe(false)
  })
})

describe('getErrorSummary', () => {
  it('returns friendly message for known errors', () => {
    expect(getErrorSummary('connection refused')).toBe('Unable to connect to MongoDB server')
    expect(getErrorSummary('authentication failed')).toBe('Authentication failed')
  })

  it('returns raw message for unknown short errors', () => {
    expect(getErrorSummary('short error')).toBe('short error')
  })

  it('truncates long unknown errors', () => {
    const longError = 'a'.repeat(150)
    const summary = getErrorSummary(longError, 100)
    expect(summary.length).toBe(100)
    expect(summary.endsWith('...')).toBe(true)
  })

  it('respects custom maxLength', () => {
    const error = 'a'.repeat(50)
    expect(getErrorSummary(error, 30).length).toBe(30)
    expect(getErrorSummary(error, 60)).toBe(error) // Not truncated
  })
})
