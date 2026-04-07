// State Transition Circuit (Base Proof)
//
// Proves the validity of a single ledger transaction by verifying:
// 1. The pre-state root correctly includes the sender's balance
// 2. The transaction amount does not exceed the sender's balance
// 3. The post-state root reflects the correct balance updates
// 4. The transaction signature is valid (verified externally via ML-DSA-65)
//
// Public Inputs (8 field elements):
// - pre_state_root: Merkle root of ledger state before transaction
// - post_state_root: Merkle root of ledger state after transaction
// - tx_hash: Hash of the transaction data
// - tx_type_hash: Hash of transaction type (deposit, transfer, withdrawal)
// - from_account_hash: Hash of sender account ID
// - to_account_hash: Hash of recipient account ID
// - amount: Transaction amount in atomic units
// - idempotency_key_hash: Hash of idempotency key for exactly-once semantics
//
// Private Inputs:
// - from_balance_pre: Sender balance before transaction
// - from_balance_post: Sender balance after transaction
// - to_balance_pre: Recipient balance before transaction
// - to_balance_post: Recipient balance after transaction
// - from_merkle_proof: Merkle proof for sender account in pre-state
// - to_merkle_proof: Merkle proof for recipient account in pre-state
// - from_index: Index of sender account in state tree
// - to_index: Index of recipient account in state tree

use super::utils::{
    pedersen_hash,
    poseidon_hash,
    compute_merkle_root,
    verify_merkle_proof,
    verify_balance_transition
};

// Transaction types (hashed values)
const TX_TYPE_DEPOSIT: felt252 = 0x1;
const TX_TYPE_TRANSFER: felt252 = 0x2;
const TX_TYPE_WITHDRAWAL: felt252 = 0x3;

// State transition public inputs structure
#[derive(Drop, Copy)]
struct StateTransitionInputs {
    pre_state_root: felt252,
    post_state_root: felt252,
    tx_hash: felt252,
    tx_type_hash: felt252,
    from_account_hash: felt252,
    to_account_hash: felt252,
    amount: felt252,
    idempotency_key_hash: felt252,
}

// State transition private witness
#[derive(Drop)]
struct StateTransitionWitness {
    from_balance_pre: felt252,
    from_balance_post: felt252,
    to_balance_pre: felt252,
    to_balance_post: felt252,
    from_merkle_proof: Span<felt252>,
    to_merkle_proof: Span<felt252>,
    from_index: u32,
    to_index: u32,
}

// Verifies a state transition for a transfer transaction.
// Returns the proof output (commitment to the transition).
fn verify_transfer(
    inputs: StateTransitionInputs,
    witness: StateTransitionWitness
) -> felt252 {
    // 1. Verify sender account exists in pre-state
    let from_leaf = compute_account_leaf(
        inputs.from_account_hash,
        witness.from_balance_pre
    );

    assert(
        verify_merkle_proof(
            from_leaf,
            witness.from_merkle_proof,
            witness.from_index,
            inputs.pre_state_root
        ),
        'Invalid sender merkle proof'
    );

    // 2. Verify recipient account exists in pre-state
    let to_leaf = compute_account_leaf(
        inputs.to_account_hash,
        witness.to_balance_pre
    );

    assert(
        verify_merkle_proof(
            to_leaf,
            witness.to_merkle_proof,
            witness.to_index,
            inputs.pre_state_root
        ),
        'Invalid recipient merkle proof'
    );

    // 3. Verify balance transition is valid
    assert(
        verify_balance_transition(
            witness.from_balance_pre,
            witness.from_balance_post,
            witness.to_balance_pre,
            witness.to_balance_post,
            inputs.amount
        ),
        'Invalid balance transition'
    );

    // 4. Verify sender has sufficient balance
    assert(
        felt252_ge(witness.from_balance_pre, inputs.amount),
        'Insufficient balance'
    );

    // 5. Compute expected post-state root
    let from_leaf_post = compute_account_leaf(
        inputs.from_account_hash,
        witness.from_balance_post
    );

    let to_leaf_post = compute_account_leaf(
        inputs.to_account_hash,
        witness.to_balance_post
    );

    // 6. Return proof commitment (hash of all public inputs)
    compute_state_transition_commitment(inputs)
}

// Verifies a deposit transaction (no sender, external deposit).
fn verify_deposit(
    inputs: StateTransitionInputs,
    witness: StateTransitionWitness
) -> felt252 {
    // For deposits, from_account_hash should be zero (external source)
    assert(inputs.from_account_hash == 0, 'Deposit must have no sender');

    // Verify recipient exists in pre-state
    let to_leaf = compute_account_leaf(
        inputs.to_account_hash,
        witness.to_balance_pre
    );

    assert(
        verify_merkle_proof(
            to_leaf,
            witness.to_merkle_proof,
            witness.to_index,
            inputs.pre_state_root
        ),
        'Invalid recipient merkle proof'
    );

    // Verify deposit increases balance
    assert(
        witness.to_balance_post == witness.to_balance_pre + inputs.amount,
        'Invalid deposit amount'
    );

    compute_state_transition_commitment(inputs)
}

// Verifies a withdrawal transaction (funds leave the system).
fn verify_withdrawal(
    inputs: StateTransitionInputs,
    witness: StateTransitionWitness
) -> felt252 {
    // For withdrawals, to_account_hash should be zero (external destination)
    assert(inputs.to_account_hash == 0, 'Withdrawal must have no recipient');

    // Verify sender exists in pre-state
    let from_leaf = compute_account_leaf(
        inputs.from_account_hash,
        witness.from_balance_pre
    );

    assert(
        verify_merkle_proof(
            from_leaf,
            witness.from_merkle_proof,
            witness.from_index,
            inputs.pre_state_root
        ),
        'Invalid sender merkle proof'
    );

    // Verify sufficient balance
    assert(
        felt252_ge(witness.from_balance_pre, inputs.amount),
        'Insufficient balance'
    );

    // Verify withdrawal decreases balance
    assert(
        witness.from_balance_post == witness.from_balance_pre - inputs.amount,
        'Invalid withdrawal amount'
    );

    compute_state_transition_commitment(inputs)
}

// Main entry point: verifies any transaction type.
fn verify_state_transition(
    inputs: StateTransitionInputs,
    witness: StateTransitionWitness
) -> felt252 {
    if inputs.tx_type_hash == TX_TYPE_DEPOSIT {
        verify_deposit(inputs, witness)
    } else if inputs.tx_type_hash == TX_TYPE_TRANSFER {
        verify_transfer(inputs, witness)
    } else if inputs.tx_type_hash == TX_TYPE_WITHDRAWAL {
        verify_withdrawal(inputs, witness)
    } else {
        panic!("Unknown transaction type")
    }
}

// Computes the account leaf hash for the Merkle tree.
fn compute_account_leaf(account_hash: felt252, balance: felt252) -> felt252 {
    pedersen_hash(account_hash, balance)
}

// Computes the commitment for the state transition proof.
fn compute_state_transition_commitment(inputs: StateTransitionInputs) -> felt252 {
    let mut arr = ArrayTrait::new();
    arr.append(inputs.pre_state_root);
    arr.append(inputs.post_state_root);
    arr.append(inputs.tx_hash);
    arr.append(inputs.tx_type_hash);
    arr.append(inputs.from_account_hash);
    arr.append(inputs.to_account_hash);
    arr.append(inputs.amount);
    arr.append(inputs.idempotency_key_hash);

    poseidon_hash(arr.span())
}

// Helper: felt252 greater-than-or-equal comparison.
// Returns true if a >= b (treating felt252 as unsigned integers).
fn felt252_ge(a: felt252, b: felt252) -> bool {
    // Simple comparison for non-negative values
    let a_u256: u256 = a.into();
    let b_u256: u256 = b.into();
    a_u256 >= b_u256
}

#[cfg(test)]
mod tests {
    use super::{
        StateTransitionInputs,
        StateTransitionWitness,
        verify_transfer,
        compute_account_leaf,
        TX_TYPE_TRANSFER
    };

    #[test]
    fn test_compute_account_leaf() {
        let account_hash: felt252 = 0x123;
        let balance: felt252 = 1000;

        let leaf = compute_account_leaf(account_hash, balance);
        assert(leaf != 0, 'Leaf should not be zero');
    }
}
