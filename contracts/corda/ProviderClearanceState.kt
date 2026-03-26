package com.consortium.health.contracts

import net.corda.core.contracts.BelongsToContract
import net.corda.core.contracts.LinearState
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.identity.AbstractParty

/**
 * Represents a provider clearance decision on the Corda ledger.
 *
 * Each state is uniquely identified by a [linearId] derived from
 * the provider ID and the scheduled assignment timestamp.
 */
@BelongsToContract(ProviderClearanceContract::class)
data class ProviderClearanceState(
    val providerId: String,
    val facility: String,
    val jurisdiction: String,
    val requiredCredentials: List<String>,
    val approved: Boolean,
    val reasons: List<String>,
    override val linearId: UniqueIdentifier = UniqueIdentifier(),
    override val participants: List<AbstractParty> = emptyList()
) : LinearState
