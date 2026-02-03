// Configure Monaco Editor to use local files instead of CDN
// This is required for airgapped environments
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// Tell the loader to use our local monaco-editor package
loader.config({ monaco })

// Export monaco for direct access if needed
export { monaco }
