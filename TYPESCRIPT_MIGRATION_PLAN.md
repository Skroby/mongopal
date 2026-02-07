# Plan: TypeScript Migration for MongoPal Frontend

## Overview

Migrate the MongoPal frontend from JavaScript to TypeScript to achieve type safety for Wails API calls and prevent signature mismatch bugs. The migration is designed for parallel execution across multiple agents where beneficial.

**Key Motivation**: Prevent API call signature mismatches (e.g., wrong argument counts) that can cause runtime errors. TypeScript will catch these at compile time, especially important given the 32 Wails API functions with varying signatures.

**Current State Analysis:**
- **Pure JavaScript**: No TypeScript infrastructure exists (but `@types/react` already installed)
- **File counts**: 88 source files total
  - 55 components (.jsx)
  - 11 contexts (.jsx)
  - 2 hooks (.js)
  - 7 utilities (.js) with 100% test coverage
  - 3 root files
- **Wails bindings**: TypeScript definitions already exist (`App.d.ts`, `models.ts`, `runtime.d.ts`)
- **Dependencies**: NotificationContext → ConnectionContext → TabContext → Components

---

## Migration Strategy: 7 Phases

### Phase 1: TypeScript Infrastructure Setup
**Goal**: Install TypeScript tooling without changing any code

**Actions**:
1. Install dependencies:
   ```bash
   cd frontend
   npm install --save-dev typescript
   ```

2. Create `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "target": "ES2020",
       "useDefineForClassFields": true,
       "lib": ["ES2020", "DOM", "DOM.Iterable"],
       "module": "ESNext",
       "skipLibCheck": true,

       /* Bundler mode */
       "moduleResolution": "bundler",
       "allowImportingTsExtensions": true,
       "resolveJsonModule": true,
       "isolatedModules": true,
       "noEmit": true,
       "jsx": "react-jsx",

       /* Linting - start lenient, tighten later */
       "strict": false,
       "noUnusedLocals": false,
       "noUnusedParameters": false,
       "noFallthroughCasesInSwitch": true,

       /* Gradual migration */
       "allowJs": true,
       "checkJs": false
     },
     "include": ["src"],
     "references": [{ "path": "./tsconfig.node.json" }]
   }
   ```

3. Create `tsconfig.node.json`:
   ```json
   {
     "compilerOptions": {
       "composite": true,
       "skipLibCheck": true,
       "module": "ESNext",
       "moduleResolution": "bundler",
       "allowSyntheticDefaultImports": true
     },
     "include": ["vite.config.js"]
   }
   ```

4. Create `src/vite-env.d.ts`:
   ```typescript
   /// <reference types="vite/client" />
   ```

5. Verify build still works: `npm run build`
6. Run tests: `npm test`

**Parallel**: No (single setup task)
**Risk**: Low - configuration only, no code changes
**Rollback**: Delete `tsconfig.json`, `tsconfig.node.json`, uninstall TypeScript

---

### Phase 2: Wails TypeScript Adapter
**Goal**: Create type-safe wrapper for Wails API calls

**Actions**:
1. The Wails bindings already have TypeScript definitions at:
   - `frontend/wailsjs/go/main/App.d.ts` (32 functions)
   - `frontend/wailsjs/go/models.ts` (9 model classes)

2. Current usage pattern in code:
   ```javascript
   const go = window.go?.main?.App
   await go.FindDocuments(connId, dbName, collName, filter, projection)
   ```

3. No additional adapter needed - TypeScript will use existing `.d.ts` files automatically

4. Update imports from:
   ```javascript
   import { FindDocuments } from '../wailsjs/go/main/App'
   ```
   To use typed versions (works automatically once files are .tsx)

**Parallel**: No (verification only)
**Risk**: Very Low - types already exist
**Rollback**: N/A

---

### Phase 3: Utilities (Foundation Layer)
**Goal**: Convert standalone utility modules with no React dependencies

**Files** (7 files - all have 100% test coverage):
1. `frontend/src/utils/errorParser.js` → `.ts` (8 usages, most used)
2. `frontend/src/utils/queryParser.js` → `.ts` (2 usages)
3. `frontend/src/utils/queryValidator.js` → `.ts` (2 usages)
4. `frontend/src/utils/fieldValidator.js` → `.ts` (2 usages)
5. `frontend/src/utils/mongoshParser.js` → `.ts` (2 usages)
6. `frontend/src/utils/schemaUtils.js` → `.ts` (3 usages)
7. `frontend/src/utils/tableViewUtils.js` → `.ts` (3 usages)

**Actions per file**:
1. Rename `.js` → `.ts`
2. Add type annotations for function parameters and return types
3. Add interfaces for complex objects (e.g., `ParsedQuery`, `SchemaField`)
4. Fix any type errors
5. Update corresponding test files (`.test.js` → `.test.ts`)
6. Verify tests pass: `npm test -- <filename>`

**Example conversion** (`errorParser.js` → `errorParser.ts`):
```typescript
// Before (errorParser.js)
export function parseError(error) {
  return {
    message: error.message,
    hints: extractHints(error)
  }
}

// After (errorParser.ts)
interface ParsedError {
  message: string
  hints: string[]
}

export function parseError(error: Error | string): ParsedError {
  const message = typeof error === 'string' ? error : error.message
  return {
    message,
    hints: extractHints(message)
  }
}
```

**Parallel**: Yes - all 7 files can be converted simultaneously (1 agent per file or group into 2-3 agents)
**Risk**: Low - pure functions, no dependencies, 100% tested
**Rollback**: Revert individual file renames
**Verification**: `npm test` must pass for all utility tests

---

### Phase 4: Hooks
**Goal**: Convert custom hooks to TypeScript

**Files** (2 files):
1. `frontend/src/hooks/useProgressETA.js` → `.ts` (has test)
2. Any other hooks discovered

**Actions per file**:
1. Rename `.js` → `.ts`
2. Type hook parameters
3. Type return value (especially important for hooks)
4. Update test file
5. Verify tests pass

**Example**:
```typescript
// Before
export function useProgressETA(completed, total) {
  const [eta, setEta] = useState(null)
  // ...
  return eta
}

// After
export function useProgressETA(completed: number, total: number): number | null {
  const [eta, setEta] = useState<number | null>(null)
  // ...
  return eta
}
```

**Parallel**: Yes - files are independent
**Risk**: Low - small surface area
**Rollback**: Revert renames
**Verification**: Hook tests pass

---

### Phase 5: Contexts (Critical Infrastructure)
**Goal**: Convert context providers to TypeScript - must follow dependency order

**Dependency Order** (must respect):
```
Level 1 (no context dependencies):
├── DebugContext.jsx
├── StatusContext.jsx
├── OperationContext.jsx
├── ExportQueueContext.jsx
└── SchemaContext.jsx

Level 2 (depends on Level 1):
├── NotificationContext.jsx (foundation for notifications)
└── ConnectionContext.jsx (depends on Notification, Debug)

Level 3 (depends on Level 2):
└── TabContext.jsx (depends on Connection)
```

**Files** (11 contexts total):

**Batch 1** (5 contexts - parallel, no dependencies):
1. `DebugContext.jsx` → `.tsx`
2. `StatusContext.jsx` → `.tsx`
3. `OperationContext.jsx` → `.tsx`
4. `ExportQueueContext.jsx` → `.tsx`
5. `SchemaContext.jsx` → `.tsx`

**Batch 2** (2 contexts - parallel after Batch 1):
6. `NotificationContext.jsx` → `.tsx` (CRITICAL - blocks many components)
7. `ConnectionContext.jsx` → `.tsx` (15+ Wails calls, needs NotificationContext)

**Batch 3** (1 context - after Batch 2):
8. `TabContext.jsx` → `.tsx` (depends on ConnectionContext)

**Actions per context**:
1. Rename `.jsx` → `.tsx`
2. Define context value interface:
   ```typescript
   interface ConnectionContextValue {
     connections: Connection[]
     activeConnectionId: string | null
     connect: (connection: Connection) => Promise<void>
     disconnect: (connectionId: string) => Promise<void>
     // ... all context methods
   }
   ```
3. Type provider component props
4. Type the `useState` and `useEffect` hooks
5. Add types to Wails API calls
6. Type custom hook return value
7. Update any tests
8. Verify compile and tests pass

**Example** (`ConnectionContext.jsx` → `.tsx`):
```typescript
// Before
const ConnectionContext = createContext()

export function ConnectionProvider({ children }) {
  const [connections, setConnections] = useState([])

  const connect = async (connection) => {
    const go = window.go?.main?.App
    await go.Connect(connection)
  }

  return <ConnectionContext.Provider value={{ connections, connect }}>
    {children}
  </ConnectionContext.Provider>
}

// After
interface Connection {
  id: string
  name: string
  uri: string
  // ... other fields
}

interface ConnectionContextValue {
  connections: Connection[]
  activeConnectionId: string | null
  connect: (connection: Connection) => Promise<void>
  disconnect: (connectionId: string) => Promise<void>
  // ... other methods
}

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined)

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)

  const connect = async (connection: Connection): Promise<void> => {
    const { Connect } = await import('../../wailsjs/go/main/App')
    await Connect(connection.id)
  }

  const value: ConnectionContextValue = { connections, activeConnectionId, connect, disconnect }

  return <ConnectionContext.Provider value={value}>
    {children}
  </ConnectionContext.Provider>
}

export function useConnection(): ConnectionContextValue {
  const context = useContext(ConnectionContext)
  if (!context) {
    throw new Error('useConnection must be used within ConnectionProvider')
  }
  return context
}
```

**Parallel Strategy**:
- **Batch 1**: 5 agents in parallel (or 2 agents with 2-3 contexts each)
- **Batch 2**: 2 agents in parallel
- **Batch 3**: 1 agent

**Risk**: High - contexts are critical infrastructure, ConnectionContext has many Wails calls
**Rollback**: Revert entire batch if any context fails
**Verification**:
- App starts: `npm run dev`
- All features work (connect, open tabs, etc.)
- Tests pass: `npm test`

---

### Phase 6: Root Files
**Goal**: Convert main application entry points

**Files** (3 files):
1. `frontend/src/main.jsx` → `.tsx` (React entry point)
2. `frontend/src/App.jsx` → `.tsx` (main app with 20+ imports)
3. `frontend/src/monacoConfig.js` → `.ts` (Monaco editor config)

**Actions**:
1. Rename each file
2. Add types for all imports
3. Type component props
4. Type state variables
5. Fix any errors

**App.jsx is complex** (20+ imports):
- Uses all contexts
- Main application router/orchestrator
- Should be done carefully, not rushed

**Parallel**: No (do sequentially: monacoConfig → main → App)
**Risk**: Medium - App.jsx is the root component
**Rollback**: Revert all 3 files
**Verification**: Full app must work

---

### Phase 7: Components (55 files)
**Goal**: Convert all React components to TypeScript

**Strategy**: Group by complexity and dependencies

#### **Group A: Simple Components** (9 files - parallel)
Pure presentational, no Wails calls:
- `ConfirmDialog.jsx`
- `ActionableError.jsx`
- `KeyboardShortcuts.jsx`
- `ColumnVisibilityDropdown.jsx`
- `MonacoErrorBoundary.jsx`
- `BulkActionBar.jsx`
- `TabBar.jsx`
- `MonacoDiffEditor.jsx`
- `DocumentDiffView.jsx`

**Parallel**: 3 agents × 3 components each

#### **Group B: Medium Components** (12 files - parallel after Group A)
Use contexts, minimal Wails:
- `Settings.jsx`
- `ErrorBoundary.jsx`
- `CSVExportButton.jsx`
- `CSVExportDialog.jsx`
- `SavedQueriesDropdown.jsx`
- `SavedQueriesManager.jsx`
- `SaveQueryModal.jsx`
- `CollectionStatsModal.jsx`
- `ExplainPanel.jsx`
- `PerformancePanel.jsx`
- `ConnectionForm.jsx`
- `TableView.jsx`

**Parallel**: 3-4 agents × 3 components each

#### **Group C: Complex Components** (8 files - sequential or careful parallel)
Heavy Wails integration, complex state:
- `Sidebar.jsx` (24 Wails calls, complex tree)
- `CollectionView.jsx` (30+ Wails calls, MOST COMPLEX)
- `DocumentEditView.jsx` (20+ Wails calls, editor integration)
- `SchemaView.jsx` (10+ Wails calls, EventsOn usage)
- `IndexView.jsx` (10+ Wails calls)
- `IndexManagerModal.jsx`
- `ExportManager.jsx`
- `NotificationContext.jsx` (notification history)

**Parallel**: 2-3 agents, careful coordination

#### **Group D: Import/Export Modals** (4 files - parallel)
Similar patterns, EventsOn usage:
- `ExportDatabasesModal.jsx` (15+ Wails calls, progress tracking)
- `ExportCollectionsModal.jsx` (similar to above)
- `ImportDatabasesModal.jsx` (preview, dry-run)
- `ImportCollectionsModal.jsx` (conflict resolution)

**Parallel**: 2 agents × 2 modals each

**Actions per component**:
1. Rename `.jsx` → `.tsx`
2. Define prop interfaces:
   ```typescript
   interface CollectionViewProps {
     connectionId: string
     database: string
     collection: string
   }
   ```
3. Type all useState and useEffect
4. Type event handlers: `(e: React.ChangeEvent<HTMLInputElement>) => void`
5. Type Wails API calls (use imported types)
6. Update tests if they exist
7. Verify component renders and works

**Component Migration Pattern**:
```typescript
// Before (Component.jsx)
export default function CollectionView({ connectionId, database, collection }) {
  const [documents, setDocuments] = useState([])
  const { showNotification } = useNotification()

  const handleSearch = (e) => {
    // ...
  }

  useEffect(() => {
    loadDocuments()
  }, [connectionId, database, collection])

  return <div>...</div>
}

// After (Component.tsx)
interface CollectionViewProps {
  connectionId: string
  database: string
  collection: string
}

interface Document {
  _id: string
  [key: string]: any
}

export default function CollectionView({
  connectionId,
  database,
  collection
}: CollectionViewProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const { showNotification } = useNotification()

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>): void => {
    // ...
  }

  useEffect(() => {
    loadDocuments()
  }, [connectionId, database, collection])

  return <div>...</div>
}
```

**Total Component Effort**:
- Group A: 9 files, 3 agents × 2h = 2h calendar time
- Group B: 12 files, 4 agents × 3h = 3h calendar time
- Group C: 8 files, 3 agents × 5h = 5h calendar time
- Group D: 4 files, 2 agents × 3h = 3h calendar time

**Total**: ~13h calendar time with parallelization

**Risk**: Low-Medium (large volume, but pattern-based)
**Rollback**: Revert by group
**Verification**:
- Build succeeds: `npm run build`
- All tests pass: `npm test`
- Manual smoke test of each feature

---

## Parallel Execution Summary

| Phase | Files | Parallelizable | Max Agents | Strategy |
|-------|-------|----------------|------------|----------|
| 1 | Config | No | 1 | Single setup |
| 2 | Wails | No | 1 | Verify only |
| 3 | 7 utilities | **Yes** | **7** | 1 agent per file |
| 4 | 2 hooks | Yes | 2 | 1 agent per file |
| 5 | 11 contexts | Partial | 5 | Respect dependency order |
| 6 | 3 root | No | 1 | Sequential |
| 7A | 9 components | **Yes** | **3** | 3 components per agent |
| 7B | 12 components | **Yes** | **4** | 3 components per agent |
| 7C | 8 components | Partial | 3 | Careful coordination |
| 7D | 4 modals | **Yes** | **2** | 2 modals per agent |

**Phase 3 and 7A-7D are highest-value parallel opportunities** - independent files, clear patterns.

---

## Risk Mitigation

1. **Incremental commits**: Commit after each phase
2. **Build verification**: Run `npm run build` after each phase
3. **Test suite**: Run `npm test` after each phase
4. **Manual testing**: Smoke test critical flows after Phases 5, 6, 7
5. **Rollback strategy**: Each phase independently revertible
6. **Type safety wins**: Even partial migration provides value
7. **Existing type definitions**: Wails already has `.d.ts` files - low risk

---

## Critical Files Reference

### Phase 1: Configuration
- `frontend/tsconfig.json` (create)
- `frontend/tsconfig.node.json` (create)
- `frontend/src/vite-env.d.ts` (create)
- `frontend/package.json` (modify - add typescript)

### Phase 2: Wails Types (Already Exist)
- `frontend/wailsjs/go/main/App.d.ts` (32 functions with types)
- `frontend/wailsjs/go/models.ts` (9 model classes)
- `frontend/wailsjs/runtime/runtime.d.ts` (Wails runtime types)

### Phase 3: Utilities (All Have Tests)
- `frontend/src/utils/errorParser.js` → `.ts`
- `frontend/src/utils/queryParser.js` → `.ts`
- `frontend/src/utils/queryValidator.js` → `.ts`
- `frontend/src/utils/fieldValidator.js` → `.ts`
- `frontend/src/utils/mongoshParser.js` → `.ts`
- `frontend/src/utils/schemaUtils.js` → `.ts`
- `frontend/src/utils/tableViewUtils.js` → `.ts`

### Phase 4: Hooks
- `frontend/src/hooks/useProgressETA.js` → `.ts`

### Phase 5: Contexts (Dependency Order)
**Batch 1** (parallel):
- `frontend/src/components/contexts/DebugContext.jsx` → `.tsx`
- `frontend/src/components/contexts/StatusContext.jsx` → `.tsx`
- `frontend/src/components/contexts/OperationContext.jsx` → `.tsx`
- `frontend/src/components/contexts/ExportQueueContext.jsx` → `.tsx`
- `frontend/src/components/contexts/SchemaContext.jsx` → `.tsx`

**Batch 2** (parallel after Batch 1):
- `frontend/src/components/contexts/NotificationContext.jsx` → `.tsx` **CRITICAL**
- `frontend/src/components/contexts/ConnectionContext.jsx` → `.tsx` (15+ Wails calls)

**Batch 3** (after Batch 2):
- `frontend/src/components/contexts/TabContext.jsx` → `.tsx`

### Phase 6: Root Files
- `frontend/src/monacoConfig.js` → `.ts`
- `frontend/src/main.jsx` → `.tsx`
- `frontend/src/App.jsx` → `.tsx` (20+ imports)

### Phase 7: Components (by group)
See Phase 7 details above for full list grouped by complexity.

---

## Verification Steps

### After Each Phase
1. `npm run build` - must succeed
2. Check for TypeScript errors in terminal output
3. Verify no new runtime errors in browser console
4. Run `npm test` to ensure no test regressions

### After Phase 3 (Utilities)
1. All utility tests must pass: `npm test src/utils/`
2. No import errors in components using utilities

### After Phase 5 (Contexts)
1. Start app: `npm run dev`
2. Test connection flow (connect to MongoDB)
3. Test tab switching
4. Verify notifications appear
5. Check debug logging works (toggle in Settings)

### After Phase 6 (Root Files)
1. App starts without errors
2. All UI elements render correctly
3. Console shows no type-related warnings

### After Phase 7 (Components - Complete)
1. Full test suite: `npm test`
2. Production build: `npm run build`
3. Comprehensive smoke test:
   - Connect to MongoDB
   - Browse databases/collections
   - Execute queries
   - View/edit documents
   - Export/import databases
   - View schema
   - Check performance panel
   - Test all modals
   - Verify keyboard shortcuts

---

## Success Criteria

1. **Zero `.js`/`.jsx` files** in `frontend/src` (except config files if needed)
2. **All TypeScript files compile** with no errors
3. **All tests pass** including utility and component tests
4. **Type safety for Wails calls** - IDE autocomplete works
5. **No runtime regressions** - app functions identically to before
6. **Developer experience improved** - IntelliSense for Wails APIs
7. **Strict mode ready** - can enable `strict: true` in tsconfig later

---

## Estimated Effort

| Phase | Files | Agent-Hours (parallel) | Calendar Time |
|-------|-------|------------------------|---------------|
| 1 | Config | 0.5 | 0.5h |
| 2 | Verify | 0.25 | 0.25h |
| 3 | 7 | 2 (7 agents × 0.5h) | 0.5h |
| 4 | 2 | 0.5 (2 agents × 0.25h) | 0.25h |
| 5 | 11 | 12 (batched) | 4h |
| 6 | 3 | 4 | 4h |
| 7A | 9 | 6 (3 agents × 2h) | 2h |
| 7B | 12 | 12 (4 agents × 3h) | 3h |
| 7C | 8 | 15 (3 agents × 5h) | 5h |
| 7D | 4 | 6 (2 agents × 3h) | 3h |
| **Total** | **88** | **58** | **22.5h** |

With parallelization: **~22.5 hours calendar time** vs ~58 hours sequential.

---

## Optional: Phase 8 - Strict Mode (Future Enhancement)

Once all files are migrated and stable:

1. Update `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "strict": true,
       "noImplicitAny": true,
       "strictNullChecks": true,
       "strictFunctionTypes": true,
       "strictBindCallApply": true,
       "strictPropertyInitialization": true,
       "noImplicitThis": true,
       "alwaysStrict": true
     }
   }
   ```

2. Fix all strict mode errors revealed
3. Run full test suite
4. Verify production build

This phase can be deferred - the migration is complete and valuable without strict mode.

---

## Next Steps After Plan Approval

1. **Execute Phase 1** (setup) - single session, ~30 minutes
2. **Execute Phase 2** (verify Wails types) - single session, ~15 minutes
3. **Launch 7 agents for Phase 3** (utilities) - highest test coverage, lowest risk
4. **Execute Phase 4** (hooks) - quick wins
5. **Execute Phase 5** in batches (contexts) - critical path
6. **Execute Phase 6** (root files) - careful sequential work
7. **Execute Phase 7** in groups (components) - largest effort, most parallelizable

---

## MongoPal-Specific Notes

**Advantages for Migration:**
- Wails TypeScript bindings already exist (`.d.ts` files)
- Utilities have 100% test coverage
- Clear dependency hierarchy (contexts → components)
- No Redux or complex state management - contexts only
- Vite already supports TypeScript out of the box

**Challenges:**
- CollectionView is very complex (30+ Wails calls)
- ConnectionContext has 15+ Wails calls - needs careful typing
- EventsOn/EventsOff usage in export/import requires proper typing
- Monaco editor integration may need additional types

**Key Differences from KubeKonfig:**
- MongoPal: 88 files vs KubeKonfig: 169+ files (smaller scope)
- MongoPal: Simpler context hierarchy (3 levels vs more in KubeKonfig)
- MongoPal: Utilities already well-tested (100% coverage)
- MongoPal: Wails types already exist (no generation needed)

This makes MongoPal's migration **easier and faster** than KubeKonfig's.