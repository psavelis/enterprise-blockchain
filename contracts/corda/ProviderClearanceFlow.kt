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
 * collects signatures from all required participants.
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
    private val observer: Party,
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
            participants = listOf(ourIdentity, observer)
        )

        val command = if (approved) {
            ProviderClearanceContract.Commands.ApproveClearance()
        } else {
            ProviderClearanceContract.Commands.RejectClearance()
        }

        val txBuilder = TransactionBuilder(notary)
            .addOutputState(outputState, ProviderClearanceContract.ID)
            .addCommand(Command(command, listOf(ourIdentity.owningKey, observer.owningKey)))

        progressTracker.currentStep = VERIFYING_TRANSACTION
        txBuilder.verify(serviceHub)

        progressTracker.currentStep = SIGNING_TRANSACTION
        val partiallySignedTx = serviceHub.signInitialTransaction(txBuilder)

        progressTracker.currentStep = GATHERING_SIGNATURES
        val observerSession = initiateFlow(observer)
        val fullySignedTx = subFlow(
            CollectSignaturesFlow(partiallySignedTx, listOf(observerSession), GATHERING_SIGNATURES.childProgressTracker())
        )

        progressTracker.currentStep = FINALISING_TRANSACTION
        return subFlow(FinalityFlow(fullySignedTx, listOf(observerSession), FINALISING_TRANSACTION.childProgressTracker()))
    }
}

@InitiatedBy(IssueProviderClearanceFlow::class)
class IssueProviderClearanceResponder(private val counterpartySession: FlowSession) : FlowLogic<SignedTransaction>() {

    @Suspendable
    override fun call(): SignedTransaction {
        val signTransactionFlow = object : SignTransactionFlow(counterpartySession) {
            override fun checkTransaction(stx: SignedTransaction) {
                // Additional validation can be applied here by the observer node
            }
        }

        val txId = subFlow(signTransactionFlow).id
        return subFlow(ReceiveFinalityFlow(counterpartySession, expectedTxId = txId))
    }
}
