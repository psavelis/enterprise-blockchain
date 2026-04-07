// STARK Settlement Layer - Cairo Circuits
//
// This module provides the Cairo circuits for generating cryptographically
// valid STARK proofs in the 3-tier recursive aggregation pipeline.
//
// Architecture:
// - state_transition: Proves single transaction validity (Base Proof)
// - tier1_aggregator: Recursively aggregates 128 base proofs (Tier-1 Proof)
// - tier2_block: Recursively aggregates 64 Tier-1 proofs (Block Proof)
//
// Each circuit verifies the state transition integrity and produces
// succinct proofs that can be efficiently verified on-chain or off-chain.
//
// References:
// - https://www.cairo-lang.org/
// - https://book.starknet.io/

mod state_transition;
mod tier1_aggregator;
mod tier2_block;
mod utils;
