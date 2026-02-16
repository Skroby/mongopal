import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useQueryHistory,
  loadQueryHistory,
  saveQueryHistory,
  addToQueryHistoryList,
  QueryHistoryItem,
} from './useQueryHistory'

describe('useQueryHistory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('loadQueryHistory', () => {
    it('should return empty array when no stored history', () => {
      expect(loadQueryHistory()).toEqual([])
    })

    it('should parse stored history', () => {
      const items: QueryHistoryItem[] = [
        { query: '{ name: "test" }', collection: 'db.users', timestamp: 1000 },
      ]
      localStorage.setItem('mongopal_query_history', JSON.stringify(items))
      expect(loadQueryHistory()).toEqual(items)
    })

    it('should return empty array on invalid JSON', () => {
      localStorage.setItem('mongopal_query_history', 'invalid')
      expect(loadQueryHistory()).toEqual([])
    })
  })

  describe('saveQueryHistory', () => {
    it('should save history to localStorage', () => {
      const items: QueryHistoryItem[] = [
        { query: '{ name: "test" }', collection: 'db.users', timestamp: 1000 },
      ]
      saveQueryHistory(items)
      const stored = JSON.parse(localStorage.getItem('mongopal_query_history') || '[]')
      expect(stored).toEqual(items)
    })

    it('should limit to 20 items', () => {
      const items: QueryHistoryItem[] = Array.from({ length: 25 }, (_, i) => ({
        query: `query_${i}`,
        collection: 'db.test',
        timestamp: i,
      }))
      saveQueryHistory(items)
      const stored = JSON.parse(localStorage.getItem('mongopal_query_history') || '[]')
      expect(stored.length).toBe(20)
    })
  })

  describe('addToQueryHistoryList', () => {
    it('should add new item at the beginning', () => {
      const existing: QueryHistoryItem[] = [
        { query: 'old_query', collection: 'db.test', timestamp: 1000 },
      ]
      const result = addToQueryHistoryList(existing, 'new_query', 'mydb', 'users')
      expect(result[0].query).toBe('new_query')
      expect(result[0].collection).toBe('mydb.users')
      expect(result.length).toBe(2)
    })

    it('should deduplicate queries', () => {
      const existing: QueryHistoryItem[] = [
        { query: 'same_query', collection: 'db.test', timestamp: 1000 },
        { query: 'other_query', collection: 'db.test', timestamp: 500 },
      ]
      const result = addToQueryHistoryList(existing, 'same_query', 'mydb', 'users')
      expect(result.length).toBe(2)
      expect(result[0].query).toBe('same_query')
      expect(result[0].collection).toBe('mydb.users')
    })

    it('should limit to 20 items', () => {
      const existing: QueryHistoryItem[] = Array.from({ length: 20 }, (_, i) => ({
        query: `query_${i}`,
        collection: 'db.test',
        timestamp: i,
      }))
      const result = addToQueryHistoryList(existing, 'brand_new', 'mydb', 'users')
      expect(result.length).toBe(20)
      expect(result[0].query).toBe('brand_new')
    })
  })

  describe('useQueryHistory hook', () => {
    it('should initialize with empty history', () => {
      const { result } = renderHook(() =>
        useQueryHistory({ connectionId: 'conn1', database: 'mydb', collection: 'users' })
      )
      expect(result.current.queryHistory).toEqual([])
      expect(result.current.showHistory).toBe(false)
    })

    it('should load existing history from localStorage', () => {
      const items: QueryHistoryItem[] = [
        { query: '{ status: "active" }', collection: 'mydb.users', timestamp: 1000 },
      ]
      localStorage.setItem('mongopal_query_history', JSON.stringify(items))

      const { result } = renderHook(() =>
        useQueryHistory({ connectionId: 'conn1', database: 'mydb', collection: 'users' })
      )
      expect(result.current.queryHistory).toEqual(items)
    })

    it('should toggle showHistory', () => {
      const { result } = renderHook(() =>
        useQueryHistory({ connectionId: 'conn1', database: 'mydb', collection: 'users' })
      )

      act(() => {
        result.current.setShowHistory(true)
      })
      expect(result.current.showHistory).toBe(true)

      act(() => {
        result.current.setShowHistory(false)
      })
      expect(result.current.showHistory).toBe(false)
    })

    it('should add to history and persist', () => {
      const { result } = renderHook(() =>
        useQueryHistory({ connectionId: 'conn1', database: 'mydb', collection: 'users' })
      )

      act(() => {
        result.current.addToHistory('{ status: "active" }')
      })

      expect(result.current.queryHistory.length).toBe(1)
      expect(result.current.queryHistory[0].query).toBe('{ status: "active" }')
      expect(result.current.queryHistory[0].collection).toBe('mydb.users')

      // Verify persistence
      const stored = JSON.parse(localStorage.getItem('mongopal_query_history') || '[]')
      expect(stored.length).toBe(1)
    })

    it('should provide a ref for dropdown container', () => {
      const { result } = renderHook(() =>
        useQueryHistory({ connectionId: 'conn1', database: 'mydb', collection: 'users' })
      )
      expect(result.current.historyRef).toBeDefined()
    })
  })
})
