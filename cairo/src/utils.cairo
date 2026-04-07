// Utility functions for STARK circuit computations
//
// Provides common operations used across all proof circuits:
// - Field element arithmetic
// - Merkle tree operations
// - State commitment hashing
// - Proof commitment generation

use core::pedersen::pedersen;
use core::poseidon::poseidon_hash_span;

// STARK prime field: 2^251 + 17 * 2^192 + 1
const STARK_PRIME: felt252 = 0x800000000000011000000000000000000000000000000000000000000000001;

// Computes a Pedersen hash of two field elements.
// Used for Merkle tree node computation and state commitments.
fn pedersen_hash(a: felt252, b: felt252) -> felt252 {
    pedersen(a, b)
}

// Computes the Poseidon hash of a span of field elements.
// More efficient than Pedersen for multiple inputs.
fn poseidon_hash(inputs: Span<felt252>) -> felt252 {
    poseidon_hash_span(inputs)
}

// Computes a Merkle root from an array of leaf hashes.
// Handles odd-length arrays by duplicating the last leaf.
fn compute_merkle_root(leaves: Span<felt252>) -> felt252 {
    let len = leaves.len();

    if len == 0 {
        return 0;
    }

    if len == 1 {
        return *leaves.at(0);
    }

    // Build tree level by level
    let mut current_level = ArrayTrait::new();
    let mut i: u32 = 0;

    // Copy leaves to mutable array
    loop {
        if i >= len {
            break;
        }
        current_level.append(*leaves.at(i));
        i += 1;
    };

    // Reduce until single root
    loop {
        let level_len = current_level.len();
        if level_len <= 1 {
            break;
        }

        let mut next_level = ArrayTrait::new();
        let mut j: u32 = 0;

        loop {
            if j >= level_len {
                break;
            }

            let left = *current_level.at(j);
            let right = if j + 1 < level_len {
                *current_level.at(j + 1)
            } else {
                left  // Duplicate last if odd
            };

            next_level.append(pedersen_hash(left, right));
            j += 2;
        };

        current_level = next_level;
    };

    *current_level.at(0)
}

// Verifies a Merkle proof for a leaf at a given index.
// Returns true if the proof reconstructs the expected root.
fn verify_merkle_proof(
    leaf: felt252,
    proof: Span<felt252>,
    index: u32,
    root: felt252
) -> bool {
    let mut current = leaf;
    let mut idx = index;
    let mut i: u32 = 0;
    let proof_len = proof.len();

    loop {
        if i >= proof_len {
            break;
        }

        let sibling = *proof.at(i);

        current = if idx % 2 == 0 {
            pedersen_hash(current, sibling)
        } else {
            pedersen_hash(sibling, current)
        };

        idx = idx / 2;
        i += 1;
    };

    current == root
}

// Computes the commitment for a proof (hash of proof data and public inputs).
fn compute_proof_commitment(
    proof_id: felt252,
    public_inputs: Span<felt252>
) -> felt252 {
    let mut inputs = ArrayTrait::new();
    inputs.append(proof_id);

    let mut i: u32 = 0;
    let len = public_inputs.len();
    loop {
        if i >= len {
            break;
        }
        inputs.append(*public_inputs.at(i));
        i += 1;
    };

    poseidon_hash(inputs.span())
}

// Verifies state transition integrity between pre and post states.
// Checks that the balance changes are consistent with the transaction.
fn verify_balance_transition(
    from_balance_pre: felt252,
    from_balance_post: felt252,
    to_balance_pre: felt252,
    to_balance_post: felt252,
    amount: felt252
) -> bool {
    // Verify sender balance decreased by amount
    let sender_valid = from_balance_pre - amount == from_balance_post;

    // Verify receiver balance increased by amount
    let receiver_valid = to_balance_pre + amount == to_balance_post;

    sender_valid && receiver_valid
}

#[cfg(test)]
mod tests {
    use super::{pedersen_hash, compute_merkle_root, verify_merkle_proof};

    #[test]
    fn test_pedersen_hash_deterministic() {
        let a: felt252 = 123;
        let b: felt252 = 456;

        let hash1 = pedersen_hash(a, b);
        let hash2 = pedersen_hash(a, b);

        assert(hash1 == hash2, 'Hash should be deterministic');
    }

    #[test]
    fn test_merkle_root_single_leaf() {
        let mut leaves = ArrayTrait::new();
        leaves.append(42);

        let root = compute_merkle_root(leaves.span());
        assert(root == 42, 'Single leaf should be root');
    }

    #[test]
    fn test_merkle_root_two_leaves() {
        let mut leaves = ArrayTrait::new();
        leaves.append(1);
        leaves.append(2);

        let root = compute_merkle_root(leaves.span());
        let expected = pedersen_hash(1, 2);

        assert(root == expected, 'Root should be hash of leaves');
    }
}
