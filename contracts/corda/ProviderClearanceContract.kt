package com.consortium.health.contracts

import net.corda.core.contracts.CommandData
import net.corda.core.contracts.Contract
import net.corda.core.contracts.requireThat
import net.corda.core.transactions.LedgerTransaction

/**
 * Verifies state transitions for [ProviderClearanceState].
 *
 * Commands:
 *   - **ApproveClearance** — the provider meets all credential requirements.
 *   - **RejectClearance** — one or more credentials are missing or expired.
 *   - **RevokeClearance** — a previously approved clearance is withdrawn.
 */
class ProviderClearanceContract : Contract {

    companion object {
        const val ID = "com.consortium.health.contracts.ProviderClearanceContract"
    }

    interface Commands : CommandData {
        class ApproveClearance : Commands
        class RejectClearance : Commands
        class RevokeClearance : Commands
    }

    override fun verify(tx: LedgerTransaction) {
        val command = tx.commands.requireSingleCommand<Commands>()

        when (command.value) {
            is Commands.ApproveClearance -> verifyApproval(tx)
            is Commands.RejectClearance -> verifyRejection(tx)
            is Commands.RevokeClearance -> verifyRevocation(tx)
            else -> throw IllegalArgumentException("Unrecognised command: ${command.value}")
        }
    }

    private fun verifyApproval(tx: LedgerTransaction) {
        requireThat {
            "No input states for a new clearance issuance" using (tx.inputStates.isEmpty())
            "Exactly one output state" using (tx.outputStates.size == 1)

            val output = tx.outputsOfType<ProviderClearanceState>().single()
            "Clearance must be approved" using output.approved
            "Provider ID must not be blank" using output.providerId.isNotBlank()
            "Facility must not be blank" using output.facility.isNotBlank()
            "At least one participant" using output.participants.isNotEmpty()
        }
    }

    private fun verifyRejection(tx: LedgerTransaction) {
        requireThat {
            "No input states for a rejection" using (tx.inputStates.isEmpty())
            "Exactly one output state" using (tx.outputStates.size == 1)

            val output = tx.outputsOfType<ProviderClearanceState>().single()
            "Clearance must not be approved" using !output.approved
            "At least one reason required" using output.reasons.isNotEmpty()
        }
    }

    private fun verifyRevocation(tx: LedgerTransaction) {
        requireThat {
            "Exactly one input state" using (tx.inputStates.size == 1)
            "Exactly one output state" using (tx.outputStates.size == 1)

            val input = tx.inputsOfType<ProviderClearanceState>().single()
            val output = tx.outputsOfType<ProviderClearanceState>().single()

            "Previous clearance must have been approved" using input.approved
            "Revoked clearance must not be approved" using !output.approved
            "Linear IDs must match" using (input.linearId == output.linearId)
            "At least one revocation reason" using output.reasons.isNotEmpty()
        }
    }
}
