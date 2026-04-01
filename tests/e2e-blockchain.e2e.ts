/**
 * End-to-End Blockchain Tests
 *
 * Tests that run against actual Besu nodes to verify real blockchain interactions.
 * Requires Docker Compose stack to be running: docker compose up -d besu-validator-0 besu-validator-1
 *
 * These tests validate:
 * - Besu node connectivity and health
 * - Block production and chain progression
 * - JSON-RPC API functionality
 * - Cross-module integration with live nodes
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

import {
  BesuHealthChecker,
  BesuProviderFactory,
  BesuProfileFactory,
  type BesuRpcProfile,
} from "../modules/integrations/besu-client/src/index";

// Test configuration — uses local Docker Compose Besu nodes
const BESU_VALIDATOR_0: BesuRpcProfile = {
  rpcUrl: "http://127.0.0.1:8545",
  chainId: 1337,
  contractAddress: "0x0000000000000000000000000000000000000000",
};

const BESU_VALIDATOR_1: BesuRpcProfile = {
  rpcUrl: "http://127.0.0.1:8546",
  chainId: 1337,
  contractAddress: "0x0000000000000000000000000000000000000000",
};

// Skip E2E tests if SKIP_E2E_TESTS env var is set (for unit test runs)
const SKIP_E2E = process.env.SKIP_E2E_TESTS === "true";

// Helper to check if Besu nodes are available
async function isBesuAvailable(profile: BesuRpcProfile): Promise<boolean> {
  const providerFactory = new BesuProviderFactory();
  const healthChecker = new BesuHealthChecker(providerFactory);
  try {
    const status = await healthChecker.checkHealth(profile);
    return status.healthy;
  } catch {
    return false;
  }
}

describe("E2E: Besu Blockchain Integration", { skip: SKIP_E2E }, () => {
  const providerFactory = new BesuProviderFactory();
  const profileFactory = new BesuProfileFactory();
  const healthChecker = new BesuHealthChecker(providerFactory);

  let besuAvailable = false;

  before(async () => {
    // Check if Besu nodes are available
    besuAvailable = await isBesuAvailable(BESU_VALIDATOR_0);
    if (!besuAvailable) {
      console.log(
        "⚠ Besu nodes not available. Run: docker compose up -d besu-validator-0 besu-validator-1",
      );
    }
  });

  describe("Node Health & Connectivity", () => {
    it("validator-0 responds to health check", async (t) => {
      if (!besuAvailable) {
        t.skip("Besu nodes not available");
        return;
      }

      const status = await healthChecker.checkHealth(BESU_VALIDATOR_0);

      assert.equal(status.healthy, true, "Node should be healthy");
      assert.equal(status.chainId, 1337, "Chain ID should be 1337 (dev mode)");
      assert.ok(
        status.blockNumber !== undefined && status.blockNumber >= 0n,
        "Block number should be defined",
      );
      assert.ok(
        status.latencyMs !== undefined && status.latencyMs < 5000,
        "Latency should be reasonable",
      );
    });

    it("validator-1 responds to health check", async (t) => {
      if (!besuAvailable) {
        t.skip("Besu nodes not available");
        return;
      }

      const status = await healthChecker.checkHealth(BESU_VALIDATOR_1);

      assert.equal(status.healthy, true, "Node should be healthy");
      assert.equal(status.chainId, 1337, "Chain ID should be 1337 (dev mode)");
      assert.ok(
        status.blockNumber !== undefined && status.blockNumber >= 0n,
        "Block number should be defined",
      );
    });

    it("both validators are on the same chain", async (t) => {
      if (!besuAvailable) {
        t.skip("Besu nodes not available");
        return;
      }

      const status0 = await healthChecker.checkHealth(BESU_VALIDATOR_0);
      const status1 = await healthChecker.checkHealth(BESU_VALIDATOR_1);

      assert.equal(status0.chainId, status1.chainId, "Chain IDs should match");
      // Block numbers should be within a reasonable range of each other
      const diff =
        (status0.blockNumber ?? 0n) > (status1.blockNumber ?? 0n)
          ? (status0.blockNumber ?? 0n) - (status1.blockNumber ?? 0n)
          : (status1.blockNumber ?? 0n) - (status0.blockNumber ?? 0n);
      assert.ok(diff < 10n, "Block numbers should be within 10 blocks");
    });
  });

  describe("Block Production", () => {
    it("blocks are being produced", async (t) => {
      if (!besuAvailable) {
        t.skip("Besu nodes not available");
        return;
      }

      const provider = providerFactory.createProvider(BESU_VALIDATOR_0);
      const blockBefore = await provider.getBlockNumber();

      // Wait for new blocks (Besu dev mode produces blocks every ~1s)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const blockAfter = await provider.getBlockNumber();

      assert.ok(
        blockAfter > blockBefore,
        `Blocks should advance: ${blockBefore} → ${blockAfter}`,
      );
    });

    it("can retrieve block details", async (t) => {
      if (!besuAvailable) {
        t.skip("Besu nodes not available");
        return;
      }

      const provider = providerFactory.createProvider(BESU_VALIDATOR_0);
      const blockNumber = await provider.getBlockNumber();
      const block = await provider.getBlock(blockNumber);

      assert.ok(block !== null, "Block should exist");
      assert.equal(block.number, blockNumber, "Block number should match");
      assert.ok(block.hash !== null, "Block should have a hash");
      assert.ok(block.timestamp > 0, "Block should have a timestamp");
    });
  });

  describe("JSON-RPC API", () => {
    it("eth_chainId returns correct chain ID", async (t) => {
      if (!besuAvailable) {
        t.skip("Besu nodes not available");
        return;
      }

      const provider = providerFactory.createProvider(BESU_VALIDATOR_0);
      const network = await provider.getNetwork();

      assert.equal(
        Number(network.chainId),
        1337,
        "Chain ID should be 1337 (dev mode)",
      );
    });

    it("eth_gasPrice returns a value", async (t) => {
      if (!besuAvailable) {
        t.skip("Besu nodes not available");
        return;
      }

      const provider = providerFactory.createProvider(BESU_VALIDATOR_0);
      const feeData = await provider.getFeeData();

      assert.ok(feeData.gasPrice !== null, "Gas price should be available");
      assert.ok(feeData.gasPrice > 0n, "Gas price should be positive");
    });

    it("eth_syncing returns false (not syncing)", async (t) => {
      if (!besuAvailable) {
        t.skip("Besu nodes not available");
        return;
      }

      const provider = providerFactory.createProvider(BESU_VALIDATOR_0);
      // In ethers v6, we need to use send() for eth_syncing
      const syncing = (await provider.send("eth_syncing", [])) as boolean;

      // Dev mode should not be syncing (returns false)
      assert.equal(syncing, false, "Node should not be syncing in dev mode");
    });

    it("net_version returns the network ID", async (t) => {
      if (!besuAvailable) {
        t.skip("Besu nodes not available");
        return;
      }

      const provider = providerFactory.createProvider(BESU_VALIDATOR_0);
      const netVersion = (await provider.send("net_version", [])) as string;

      // Dev mode network ID is typically "1337"
      assert.ok(
        netVersion !== null && netVersion !== undefined,
        "net_version should return a value",
      );
    });

    it("eth_accounts returns available accounts", async (t) => {
      if (!besuAvailable) {
        t.skip("Besu nodes not available");
        return;
      }

      const provider = providerFactory.createProvider(BESU_VALIDATOR_0);
      const accounts = (await provider.send("eth_accounts", [])) as string[];

      // Dev mode should have pre-funded accounts
      assert.ok(Array.isArray(accounts), "Should return an array of accounts");
    });
  });

  describe("Profile Factory", () => {
    it("creates valid profile from manual configuration", () => {
      const profile = profileFactory.createProfile({
        rpcUrl: "http://localhost:8545",
        chainId: 1337,
        contractAddress: "0x0000000000000000000000000000000000001001",
      });

      assert.equal(profile.rpcUrl, "http://localhost:8545");
      assert.equal(profile.chainId, 1337);
      assert.equal(
        profile.contractAddress,
        "0x0000000000000000000000000000000000001001",
      );
    });

    it("rejects invalid RPC URL", () => {
      assert.throws(
        () =>
          profileFactory.createProfile({
            rpcUrl: "not-a-url",
            chainId: 1337,
            contractAddress: "0x0000000000000000000000000000000000001001",
          }),
        /must be an HTTP/,
      );
    });

    it("rejects invalid chain ID", () => {
      assert.throws(
        () =>
          profileFactory.createProfile({
            rpcUrl: "http://localhost:8545",
            chainId: 0,
            contractAddress: "0x0000000000000000000000000000000000001001",
          }),
        /must be a positive integer/,
      );
    });
  });

  describe("Cross-Node Consistency", () => {
    it("both validators report consistent chain state", async (t) => {
      if (!besuAvailable) {
        t.skip("Besu nodes not available");
        return;
      }

      const provider0 = providerFactory.createProvider(BESU_VALIDATOR_0);
      const provider1 = providerFactory.createProvider(BESU_VALIDATOR_1);

      // In dev mode, each validator mines independently, so we verify:
      // 1. Both can retrieve blocks
      // 2. Both have the same chain ID
      // 3. Both are making progress

      const [network0, network1] = await Promise.all([
        provider0.getNetwork(),
        provider1.getNetwork(),
      ]);

      assert.equal(
        Number(network0.chainId),
        Number(network1.chainId),
        "Chain IDs should match",
      );

      // Get block numbers
      const blockNum0 = await provider0.getBlockNumber();
      const blockNum1 = await provider1.getBlockNumber();

      // Both should have blocks (dev mode produces blocks continuously)
      assert.ok(blockNum0 > 0, "Validator-0 should have blocks");
      assert.ok(blockNum1 > 0, "Validator-1 should have blocks");

      // Get a historical block that should exist on both (e.g., block 1)
      const [block0, block1] = await Promise.all([
        provider0.getBlock(1),
        provider1.getBlock(1),
      ]);

      assert.ok(block0 !== null, "Block 1 should exist on validator-0");
      assert.ok(block1 !== null, "Block 1 should exist on validator-1");
    });
  });
});

describe(
  "E2E: Integration Module Tests with Live Nodes",
  { skip: SKIP_E2E },
  () => {
    let besuAvailable = false;

    before(async () => {
      besuAvailable = await isBesuAvailable(BESU_VALIDATOR_0);
    });

    describe("BesuEthersClient Live Operations", () => {
      it("health check works with real node", async (t) => {
        if (!besuAvailable) {
          t.skip("Besu nodes not available");
          return;
        }

        const providerFactory = new BesuProviderFactory();
        const healthChecker = new BesuHealthChecker(providerFactory);

        const health = await healthChecker.checkHealth(BESU_VALIDATOR_0);

        assert.equal(health.healthy, true);
        assert.ok(health.blockNumber !== undefined);
        assert.ok(health.latencyMs !== undefined && health.latencyMs >= 0);
      });
    });
  },
);

// Export test utilities for use in other E2E tests
export { isBesuAvailable, BESU_VALIDATOR_0, BESU_VALIDATOR_1 };
