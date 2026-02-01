.PHONY: help dev build clean install test test-frontend test-go test-watch test-integration test-integration-frontend test-integration-go test-all setup setup-quick install-hooks install-frontend generate doctor fmt lint

# Ensure Go bin is in PATH
GOBIN := $(shell go env GOPATH)/bin
export PATH := $(GOBIN):$(PATH)

# Default target
.DEFAULT_GOAL := help

# ===========================================
# Help
# ===========================================

help:
	@echo ""
	@echo "MongoPal - MongoDB GUI Explorer"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Setup:"
	@echo "  setup          Full setup (system deps, Go, Node, Wails, npm, hooks)"
	@echo "  setup-quick    Setup without system dependencies"
	@echo "  install        Install Go and npm dependencies"
	@echo "  install-hooks  Install git pre-commit hooks"
	@echo "  install-frontend  Install frontend npm dependencies only"
	@echo ""
	@echo "Development:"
	@echo "  dev            Start development server with hot-reload"
	@echo "  generate       Generate Wails bindings"
	@echo "  doctor         Run Wails doctor to verify setup"
	@echo ""
	@echo "Build:"
	@echo "  build          Build for current platform"
	@echo "  build-prod     Build optimized for production"
	@echo "  build-darwin   Build for macOS (universal)"
	@echo "  build-windows  Build for Windows (amd64)"
	@echo "  build-linux    Build for Linux (amd64)"
	@echo ""
	@echo "Testing:"
	@echo "  test           Run unit tests (frontend + Go) - used by commit hook"
	@echo "  test-frontend  Run frontend unit tests"
	@echo "  test-go        Run Go unit tests"
	@echo "  test-watch     Run frontend tests in watch mode"
	@echo "  test-integration          Run all integration tests (requires Docker)"
	@echo "  test-integration-frontend Run frontend integration tests only"
	@echo "  test-integration-go       Run Go integration tests only (requires Docker)"
	@echo "  test-all                  Run all tests (unit + integration)"
	@echo ""
	@echo "Utilities:"
	@echo "  fmt            Format Go and frontend code"
	@echo "  lint           Lint Go and frontend code"
	@echo "  clean          Remove build artifacts and node_modules"
	@echo ""

# ===========================================
# Setup
# ===========================================

# Full setup: system deps, Go, Node, Wails, frontend, hooks
setup:
	@./scripts/setup.sh

# Setup without system dependencies (if you already have GTK/WebKit)
setup-quick:
	@./scripts/setup.sh --skip-system-deps

# Install git hooks from tracked .githooks directory
install-hooks:
	@echo "Installing git hooks..."
	@cp .githooks/* .git/hooks/
	@chmod +x .git/hooks/*
	@echo "Git hooks installed successfully."

# Install frontend dependencies only
install-frontend:
	cd frontend && npm install

# Install all dependencies
install:
	cd frontend && npm install
	go mod download

# ===========================================
# Development
# ===========================================

dev: generate
	$(GOBIN)/wails dev

# ===========================================
# Build
# ===========================================

# Build for current platform
build: generate
	$(GOBIN)/wails build

# Build for production (optimized)
build-prod: generate
	$(GOBIN)/wails build -production

# Build for specific platforms
build-darwin: generate
	$(GOBIN)/wails build -platform darwin/universal

build-windows: generate
	$(GOBIN)/wails build -platform windows/amd64

build-linux: generate
	$(GOBIN)/wails build -platform linux/amd64

# ===========================================
# Testing
# ===========================================

# Run all tests
test: test-frontend test-go

# Run frontend tests
test-frontend: generate
	cd frontend && npm test

# Run frontend tests in watch mode
test-watch:
	cd frontend && npm run test:watch

# Run Go tests
test-go:
	go test -v ./...

# Run frontend integration tests (not in commit hook)
test-integration-frontend: generate
	cd frontend && npm run test:integration

# Run Go integration tests (requires Docker)
test-integration-go:
	go test -v -tags=integration -timeout=5m ./...

# Run all integration tests
test-integration: test-integration-frontend test-integration-go

# Run all tests (unit + integration)
test-all: test test-integration

# Run Go tests with coverage
test-coverage-go:
	go test -v -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

# Run frontend tests with coverage
test-coverage-frontend: generate
	cd frontend && npm run test:coverage

# Run all tests with coverage
test-coverage: test-coverage-go test-coverage-frontend

# ===========================================
# Utilities
# ===========================================

# Clean build artifacts
clean:
	rm -rf build/bin
	rm -rf frontend/dist
	rm -rf frontend/node_modules

# Generate Wails bindings
generate:
	$(GOBIN)/wails generate module

# Check Wails doctor
doctor:
	$(GOBIN)/wails doctor

# Format code
fmt:
	go fmt ./...
	cd frontend && npm run format 2>/dev/null || true

# Lint
lint:
	go vet ./...
	cd frontend && npm run lint 2>/dev/null || true
