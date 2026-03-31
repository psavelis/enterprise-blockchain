# Makefile for enterprise-blockchain reference infrastructure.
#
# This provides a unified interface for common development operations.
# All targets are designed to work on macOS and Linux.
#
# Ref: https://www.gnu.org/software/make/manual/

.PHONY: help up down smoke verify clean logs ps terraform-init terraform-plan terraform-apply

# Default target
.DEFAULT_GOAL := help

# ── Help ─────────────────────────────────────────────────────────────

help: ## Show this help message
	@echo "Enterprise Blockchain - Infrastructure Commands"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
	@echo ""
	@echo "Examples:"
	@echo "  make up              # Start all blockchain services"
	@echo "  make smoke           # Run smoke tests"
	@echo "  make verify          # Run full CI validation"

# ── Prerequisites check ──────────────────────────────────────────────

.PHONY: check-docker check-node check-terraform

check-docker:
	@command -v docker >/dev/null 2>&1 || { echo "Error: docker is required but not installed."; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "Error: docker daemon is not running."; exit 1; }

check-node:
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required but not installed."; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "Error: npm is required but not installed."; exit 1; }

check-terraform:
	@command -v terraform >/dev/null 2>&1 || { echo "Error: terraform is required but not installed."; exit 1; }

# ── Docker Compose Operations ────────────────────────────────────────

up: check-docker ## Start all blockchain and observability services
	docker compose up -d
	@echo ""
	@echo "Services started. Endpoints:"
	@echo "  Besu RPC:      http://localhost:8545"
	@echo "  Fabric Peer:   localhost:7051"
	@echo "  Corda RPC:     localhost:10006"
	@echo "  Jaeger UI:     http://localhost:16686"
	@echo "  Prometheus:    http://localhost:9090"

down: check-docker ## Stop and remove all containers and volumes
	docker compose down -v
	@echo "All services stopped and volumes removed."

ps: check-docker ## Show status of all containers
	docker compose ps

logs: check-docker ## Tail logs from all services (Ctrl+C to stop)
	docker compose logs -f

# ── Smoke Testing ────────────────────────────────────────────────────

smoke: check-docker ## Run smoke tests against running services
	@echo "Running smoke tests..."
	@bash scripts/smoke-test-local.sh

# ── CI Validation ────────────────────────────────────────────────────

verify: check-node ## Run full CI verification (format, lint, typecheck, test, examples)
	npm run verify

install: check-node ## Install npm dependencies
	npm ci

test: check-node ## Run unit and property tests
	npm test

lint: check-node ## Run ESLint
	npm run lint

typecheck: check-node ## Run TypeScript type checking
	npm run typecheck

format: check-node ## Format code with Prettier
	npm run format

# ── Terraform Operations ─────────────────────────────────────────────

terraform-init: check-terraform ## Initialize Terraform in infra/
	cd infra && terraform init

terraform-plan: check-terraform ## Plan Terraform changes
	cd infra && terraform plan

terraform-apply: check-terraform ## Apply Terraform changes
	cd infra && terraform apply

terraform-destroy: check-terraform ## Destroy Terraform resources
	cd infra && terraform destroy

# ── Cleanup ──────────────────────────────────────────────────────────

clean: ## Remove all containers, volumes, and node_modules
	-docker compose down -v --remove-orphans 2>/dev/null
	-docker system prune -f 2>/dev/null
	rm -rf node_modules
	@echo "Cleanup complete."
