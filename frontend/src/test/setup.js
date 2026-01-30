import '@testing-library/jest-dom'

// Mock window.go for Wails bindings
window.go = {
  main: {
    App: {}
  }
}
