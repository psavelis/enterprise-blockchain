package com.consortium.health.flows

import co.paralleluniverse.fibers.Suspendable
import com.consortium.health.contracts.ProviderClearanceContract
import com.consortium.health.contracts.ProviderClearanceState
import net.corda.core.contracts.Command
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.flows.*
import net.corda.core.identity.Party
import net.corda.core.transactions.SignedTransaction
import net.corda.core.transactions.TransactionBuilder
import net.corda.core.utilities.ProgressTracker

/**
 * Issues a new provider clearance on-ledger.
 *
 * The initiating party (typically the facility) builds a transaction with
 * either an [ProviderClearanceContract.Commands.ApproveClearance] or
 * [ProviderClearanceContract.Commands.RejectClearance] command, then
 * collects signatures from the counterparty (e.g. regulator or credentialing authority).
 */
@InitiatingFlow
@StartableByRPC
class IssueProviderClearanceFlow(
    private val providerId: String,
    private val facility: String,
    private val jurisdiction: String,
    private val requiredCredentials: List<String>,
    private val approved: Boolean,
    private val reasons: List<String>,
    private val counterparty: Party,
    private val notary: Party
) : FlowLogic<SignedTransaction>() {

    override val progressTracker = ProgressTracker(
        GENERATING_TRANSACTION,
        VERIFYING_TRANSACTION,
        SIGNING_TRANSACTION,
        GATHERING_SIGNATURES,
        FINALISING_TRANSACTION
    )

    companion object {
        object GENERATING_TRANSACTION : ProgressTracker.Step("Generating transaction.")
        object VERIFYING_TRANSACTION : ProgressTracker.Step("Verifying contract constraints.")
        object SIGNING_TRANSACTION : ProgressTracker.Step("Signing transaction with our key.")
        object GATHERING_SIGNATURES : ProgressTracker.Step("Gathering counterparty signatures.") {
            override fun childProgressTracker() = CollectSignaturesFlow.tracker()
        }
        object FINALISING_TRANSACTION : ProgressTracker.Step("Recording transaction.") {
            override fun childProgressTracker() = FinalityFlow.tracker()
        }
    }

    @Suspendable
    override fun call(): SignedTransaction {
        progressTracker.currentStep = GENERATING_TRANSACTION

        val linearId = UniqueIdentifier(externalId = "$providerId-$facility")

        val outputState = ProviderClearanceState(
            providerId = providerId,
            facility = facility,
            jurisdiction = jurisdiction,
            requiredCredentials = requiredCredentials,
            approved = approved,
            reasons = reasons,
            linearId = linearId,
            participants = listOf(ourIdentity, counterparty)
        )

        val command = if (approved) {
            ProviderClearanceContract.Commands.ApproveClearance()
        } else {
            ProviderClearanceContract.Commands.RejectClearance()
        }

        val txBuilder = TransactionBuilder(notary)
            .addOutputState(outputState, ProviderClearanceContract.ID)
            .addCommand(Command(command, listOf(ourIdentity.owningKey, counterparty.owningKey)))

        progressTracker.currentStep = VERIFYING_TRANSACTION
        txBuilder.verify(serviceHub)

        progressTracker.currentStep = SIGNING_TRANSACTION
        val partiallySignedTx = serviceHub.signInitialTransaction(txBuilder)

        progressTracker.currentStep = GATHERING_SIGNATURES
        val counterpartySession = initiateFlow(counterparty)
        val fullySignedTx = subFlow(
            CollectSignaturesFlow(partiallySignedTx, listOf(counterpartySession), GATHERING_SIGNATURES.childProgressTracker())
        )

        progressTracker.currentStep = FINALISING_TRANSACTION
        return subFlow(FinalityFlow(fullySignedTx, listOf(counterpartySession), FINALISING_TRANSACTION.childProgressTracker()))
    }
}

@InitiatedBy(IssueProviderClearanceFlow::class)
class IssueProviderClearanceResponder(private val counterpartySession: FlowSession) : FlowLogic<SignedTransaction>() {

    @Suspendable
    override fun call(): SignedTransaction {
        val signTransactionFlow = object : SignTransactionFlow(counterpartySession) {
            override fun checkTransaction(stx: SignedTransaction) {
                val ledgerTx = stx.toLedgerTransaction(serviceHub, false)
                val output = ledgerTx.outputsOfType<ProviderClearanceState>().singleOrNull()
                    ?: throw FlowException("Expected exactly one ProviderClearanceState output")

                // (1) Provider ID must not be blank
                require(output.providerId.isNotBlank()) {
                    "Responder check failed: providerId is blank"
                }

                // (2) Jurisdiction must be within the responder's known scope.
                //     In production this would be checked against a local registry;
                //     here we require it to be non-blank as a minimum guard.
                require(output.jurisdiction.isNotBlank()) {
                    "Responder check failed: jurisdiction is blank"
                }

                // (3) If approved, reasons must be empty — a clean approval
                //     should carry no rejection reasons.
                if (output.approved) {
                    require(output.reasons.isEmpty()) {
                        "Responder check failed: approved clearance must not carry reasons"
                    }
                }

                // (4) If rejected, at least one reason must be provided so
                //     the provider knows why clearance was denied.
                if (!output.approved) {
                    require(output.reasons.isNotEmpty()) {
                        "Responder check failed: rejected clearance must include at least one reason"
                    }
                }

                // (5) Required credentials list must be non-empty — a clearance
                //     decision without specifying what was evaluated is meaningless.
                require(output.requiredCredentials.isNotEmpty()) {
                    "Responder check failed: requiredCredentials must not be empty"
                }
            }
        }

        val txId = subFlow(signTransactionFlow).id
        return subFlow(ReceiveFinalityFlow(counterpartySession, expectedTxId = txId))
    }
}

/**
 * Revokes a previously approved provider clearance.
 *
 * The initiating party (typically the credentialing authority) consumes the
 * existing approved [ProviderClearanceState] and produces a new output
 * with `approved = false` and at least one revocation reason.
 *
 * ## Trust model
 *
 * - **Initiator**: The party that originally co-signed the clearance (facility
 *   or credentialing authority). Must hold the input state.
 * - **Responder**: Validates that the revoked output meets contract rules and
 *   that the linear ID is preserved.
 * - **Notary**: Guarantees input state uniqueness (no double-revocation).
 */
@InitiatingFlow
@StartableByRPC
class RevokeClearanceFlow(
    private val linearId: UniqueIdentifier,
    private val reasons: List<String>,
    private val counterparty: Party,
    private val notary: Party
) : FlowLogic<SignedTransaction>() {

    override val progressTracker = ProgressTracker(
        GENERATING_TRANSACTION,
        VERIFYING_TRANSACTION,
        SIGNING_TRANSACTION,
        GATHERING_SIGNATURES,
        FINALISING_TRANSACTION
    )

    companion object {
        object GENERATING_TRANSACTION : ProgressTracker.Step("Generating revocation transaction.")
        object VERIFYING_TRANSACTION : ProgressTracker.Step("Verifying contract constraints.")
        object SIGNING_TRANSACTION : ProgressTracker.Step("Signing transaction with our key.")
        object GATHERING_SIGNATURES : ProgressTracker.Step("Gathering counterparty signatures.") {
            override fun childProgressTracker() = CollectSignaturesFlow.tracker()
        }
        object FINALISING_TRANSACTION : ProgressTracker.Step("Recording transaction.") {
            override fun childProgressTracker() = FinalityFlow.tracker()
        }
    }

    @Suspendable
    override fun call(): SignedTransaction {
        progressTracker.currentStep = GENERATING_TRANSACTION

        val stateAndRef = serviceHub.vaultService
            .queryBy(ProviderClearanceState::class.java)
            .states
            .find { it.state.data.linearId == linearId }
            ?: throw FlowException("Clearance state with linearId $linearId not found in vault")

        val inputState = stateAndRef.state.data

        require(inputState.approved) {
            "Cannot revoke a clearance that is not currently approved"
        }

        val revokedState = inputState.copy(
            approved = false,
            reasons = reasons
        )

        val command = ProviderClearanceContract.Commands.RevokeClearance()

        val txBuilder = TransactionBuilder(notary)
            .addInputState(stateAndRef)
            .addOutputState(revokedState, ProviderClearanceContract.ID)
            .addCommand(Command(command, listOf(ourIdentity.owningKey, counterparty.owningKey)))

        progressTracker.currentStep = VERIFYING_TRANSACTION
        txBuilder.verify(serviceHub)

        progressTracker.currentStep = SIGNING_TRANSACTION
        val partiallySignedTx = serviceHub.signInitialTransaction(txBuilder)

        progressTracker.currentStep = GATHERING_SIGNATURES
        val counterpartySession = initiateFlow(counterparty)
        val fullySignedTx = subFlow(
            CollectSignaturesFlow(partiallySignedTx, listOf(counterpartySession), GATHERING_SIGNATURES.childProgressTracker())
        )

        progressTracker.currentStep = FINALISING_TRANSACTION
        return subFlow(FinalityFlow(fullySignedTx, listOf(counterpartySession), FINALISING_TRANSACTION.childProgressTracker()))
    }
}

@InitiatedBy(RevokeClearanceFlow::class)
class RevokeClearanceResponder(private val counterpartySession: FlowSession) : FlowLogic<SignedTransaction>() {

    @Suspendable
    override fun call(): SignedTransaction {
        val signTransactionFlow = object : SignTransactionFlow(counterpartySession) {
            override fun checkTransaction(stx: SignedTransaction) {
                val ledgerTx = stx.toLedgerTransaction(serviceHub, false)

                val input = ledgerTx.inputsOfType<ProviderClearanceState>().singleOrNull()
                    ?: throw FlowException("Expected exactly one ProviderClearanceState input")
                val output = ledgerTx.outputsOfType<ProviderClearanceState>().singleOrNull()
                    ?: throw FlowException("Expected exactly one ProviderClearanceState output")

                // Linear ID must be preserved across the revocation
                require(input.linearId == output.linearId) {
                    "Responder check failed: linear ID mismatch"
                }

                // The input must have been an approved clearance
                require(input.approved) {
                    "Responder check failed: cannot revoke a non-approved clearance"
                }

                // The output must be a revocation
                require(!output.approved) {
                    "Responder check failed: revoked output must not be approved"
                }

                // At least one reason for revocation
                require(output.reasons.isNotEmpty()) {
                    "Responder check failed: revocation must include at least one reason"
                }
            }
        }

        val txId = subFlow(signTransactionFlow).id
        return subFlow(ReceiveFinalityFlow(counterpartySession, expectedTxId = txId))
    }
}
