# Cairo Circuit Build System
#
# Compiles Cairo circuits for STARK proof generation using Scarb.
# Outputs Sierra and CASM artifacts to the artifacts/ directory.
#
# Prerequisites:
# - Scarb (Cairo package manager): https://docs.swmansion.com/scarb/
# - Cairo 2.9+
#
# Usage:
#   make build     - Compile all circuits
#   make test      - Run Cairo tests
#   make clean     - Remove build artifacts
#   make fmt       - Format Cairo source files

.PHONY: all build test clean fmt check

SCARB := scarb
ARTIFACTS_DIR := artifacts

all: build

build:
	@echo "Compiling Cairo circuits..."
	$(SCARB) build
	@mkdir -p $(ARTIFACTS_DIR)
	@cp -r target/dev/*.json $(ARTIFACTS_DIR)/ 2>/dev/null || true
	@echo "Artifacts written to $(ARTIFACTS_DIR)/"

test:
	@echo "Running Cairo tests..."
	$(SCARB) test

clean:
	@echo "Cleaning build artifacts..."
	$(SCARB) clean
	@rm -rf $(ARTIFACTS_DIR)

fmt:
	@echo "Formatting Cairo source..."
	$(SCARB) fmt

check:
	@echo "Checking Cairo source..."
	$(SCARB) check

# Development helpers
.PHONY: watch install-deps

watch:
	@echo "Watching for changes..."
	@while true; do \
		$(SCARB) build; \
		inotifywait -qre modify src/; \
	done

install-deps:
	@echo "Installing Scarb..."
	@curl --proto '=https' --tlsv1.2 -sSf https://docs.swmansion.com/scarb/install.sh | sh
