/**
 * Fiat Settlement Adapter (ISO 20022 Mock)
 *
 * Implements FiatSettlementPort for mock fiat settlement.
 * Generates ISO 20022 pain.001 credit transfer messages.
 *
 * Features:
 * - ISO 20022 pain.001.001.03 XML generation
 * - Proof commitment in RemittanceInformation
 * - Batch credit transfers
 *
 * @see https://www.iso20022.org/ for ISO 20022 documentation
 * @see domain/ports.ts for FiatSettlementPort interface
 */

/* eslint-disable @typescript-eslint/require-await */

import { createHash } from "node:crypto";
import type {
  NetTransfer,
  Tier2BlockProof,
  FiatSettlementResult,
} from "../../domain/entities.js";
import type { FiatSettlementPort, ClockPort } from "../../domain/ports.js";
import { ProofCommitment } from "../../domain/value-objects.js";

/**
 * Configuration for Fiat adapter.
 */
export interface FiatAdapterConfig {
  /** Initiating party name */
  initiatingPartyName?: string;
  /** Initiating party identification */
  initiatingPartyId?: string;
  /** Bank BIC (SWIFT code) */
  bankBic?: string;
  /** Settlement date offset in days (default: 1 for T+1) */
  settlementDateOffsetDays?: number;
}

/**
 * Fiat mock adapter for settlement operations.
 */
export class FiatMockAdapter implements FiatSettlementPort {
  private readonly config: Required<FiatAdapterConfig>;
  private messageCounter = 0;

  constructor(
    private readonly clock: ClockPort,
    config?: FiatAdapterConfig,
  ) {
    this.config = {
      initiatingPartyName:
        config?.initiatingPartyName ?? "Enterprise Blockchain Settlement Corp",
      initiatingPartyId: config?.initiatingPartyId ?? "EBSC001",
      bankBic: config?.bankBic ?? "TESTUS33XXX",
      settlementDateOffsetDays: config?.settlementDateOffsetDays ?? 1,
    };
  }

  async executeTransfer(
    transfers: readonly NetTransfer[],
    blockProof: Tier2BlockProof,
  ): Promise<FiatSettlementResult> {
    // Compute proof commitment for RemittanceInformation
    const proofCommitment = ProofCommitment.create(
      blockProof.blockProofId,
      blockProof.finalProof,
      blockProof.publicInputs,
    );

    // Generate message ID
    const messageId = this.generateMessageId();

    // Calculate settlement date (T+1)
    const now = new Date(this.clock.now());
    const settlementDate = new Date(now);
    settlementDate.setDate(
      settlementDate.getDate() + this.config.settlementDateOffsetDays,
    );

    // Calculate total amount (absolute values)
    const totalAmount = transfers.reduce(
      (sum, t) => sum + (t.netAmount > 0n ? t.netAmount : -t.netAmount),
      0n,
    );

    // Generate ISO 20022 pain.001 XML
    const pain001Xml = this.generatePain001(
      messageId,
      transfers,
      proofCommitment.toString(),
      settlementDate,
    );

    const settlementDateStr = settlementDate.toISOString().split("T")[0] ?? "";

    console.log(`[Fiat] Generated pain.001 message: ${messageId}`);
    console.log(`[Fiat] Settlement date: ${settlementDateStr}`);
    console.log(`[Fiat] Total amount: ${totalAmount} cents`);
    console.log(`[Fiat] Transactions: ${transfers.length}`);

    return {
      iso20022MessageId: messageId,
      pain001Xml,
      settlementDate: settlementDateStr,
      totalAmount,
      transactionCount: transfers.length,
    };
  }

  async getHealth(): Promise<{ healthy: boolean }> {
    // Mock always healthy
    return { healthy: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private generateMessageId(): string {
    const timestamp = this.clock.now();
    const counter = this.messageCounter++;
    const hash = createHash("sha256")
      .update(`${timestamp}:${counter}`)
      .digest("hex")
      .slice(0, 16);

    return `EBSC-${new Date(timestamp)
      .toISOString()
      .replace(/[-:T.Z]/g, "")
      .slice(0, 14)}-${hash}`;
  }

  private generatePain001(
    messageId: string,
    transfers: readonly NetTransfer[],
    proofCommitment: string,
    settlementDate: Date,
  ): string {
    const creationDateTime = new Date(this.clock.now()).toISOString();
    const settlementDateStr = settlementDate.toISOString().split("T")[0];

    // Calculate control sum (total absolute amount)
    const controlSum = transfers.reduce(
      (sum, t) => sum + (t.netAmount > 0n ? t.netAmount : -t.netAmount),
      0n,
    );

    // Generate credit transfer transactions
    const creditTransferTxs = transfers
      .map((t, i) => this.generateCreditTransferTxInf(t, i, proofCommitment))
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${this.escapeXml(messageId)}</MsgId>
      <CreDtTm>${creationDateTime}</CreDtTm>
      <NbOfTxs>${transfers.length}</NbOfTxs>
      <CtrlSum>${this.formatAmount(controlSum)}</CtrlSum>
      <InitgPty>
        <Nm>${this.escapeXml(this.config.initiatingPartyName)}</Nm>
        <Id>
          <OrgId>
            <Othr>
              <Id>${this.escapeXml(this.config.initiatingPartyId)}</Id>
            </Othr>
          </OrgId>
        </Id>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${this.escapeXml(messageId)}-PMT</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${transfers.length}</NbOfTxs>
      <CtrlSum>${this.formatAmount(controlSum)}</CtrlSum>
      <ReqdExctnDt>${settlementDateStr}</ReqdExctnDt>
      <Dbtr>
        <Nm>${this.escapeXml(this.config.initiatingPartyName)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>US00EBSC0000000000000001</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>${this.config.bankBic}</BIC>
        </FinInstnId>
      </DbtrAgt>
${creditTransferTxs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
  }

  private generateCreditTransferTxInf(
    transfer: NetTransfer,
    index: number,
    proofCommitment: string,
  ): string {
    const amount =
      transfer.netAmount > 0n ? transfer.netAmount : -transfer.netAmount;

    return `      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>TX-${index.toString().padStart(6, "0")}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="USD">${this.formatAmount(amount)}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <BIC>${this.config.bankBic}</BIC>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>Account ${this.escapeXml(transfer.externalAddress.slice(0, 20))}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <Othr>
              <Id>${this.escapeXml(transfer.externalAddress)}</Id>
            </Othr>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>STARK-PROOF:${proofCommitment.slice(0, 32)}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`;
  }

  private formatAmount(cents: bigint): string {
    const dollars = cents / 100n;
    const remainingCents = cents % 100n;
    return `${dollars}.${remainingCents.toString().padStart(2, "0")}`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}

/**
 * Mock Fiat adapter for testing.
 */
export class MockFiatAdapter implements FiatSettlementPort {
  public readonly settlements: Array<{
    transfers: readonly NetTransfer[];
    blockProofId: string;
    result: FiatSettlementResult;
  }> = [];

  private messageCounter = 0;

  constructor(private readonly clock: ClockPort) {}

  async executeTransfer(
    transfers: readonly NetTransfer[],
    blockProof: Tier2BlockProof,
  ): Promise<FiatSettlementResult> {
    const messageId = `MOCK-${this.messageCounter++}`;
    const now = new Date(this.clock.now());
    const settlementDate = new Date(now);
    settlementDate.setDate(settlementDate.getDate() + 1);

    const totalAmount = transfers.reduce(
      (sum, t) => sum + (t.netAmount > 0n ? t.netAmount : -t.netAmount),
      0n,
    );

    const result: FiatSettlementResult = {
      iso20022MessageId: messageId,
      pain001Xml: "<mock-pain001/>",
      settlementDate: settlementDate.toISOString().split("T")[0] ?? "",
      totalAmount,
      transactionCount: transfers.length,
    };

    this.settlements.push({
      transfers,
      blockProofId: blockProof.blockProofId,
      result,
    });

    return result;
  }

  async getHealth(): Promise<{ healthy: boolean }> {
    return { healthy: true };
  }
}
