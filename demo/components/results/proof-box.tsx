"use client";

import {
  Copy,
  Check,
  Cpu,
  Zap,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCopyClipboard } from "@/hooks/use-copy-clipboard";
import { truncateHash } from "@/lib/utils";
import type { ProofReport } from "@/services/types";

interface ProofBoxProps {
  proof: {
    id: string;
    txCount: number;
    stateRoot: string;
    proof: string;
  };
  proofReport?: ProofReport | null;
}

export function ProofBox({ proof, proofReport }: ProofBoxProps) {
  const { copied, copy } = useCopyClipboard();

  const isRealProver = proofReport?.proverType === "stone";
  const isValid = proofReport?.verificationResult === "VALID";

  return (
    <Card className="border-primary/30" data-testid="proof-box">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            STARK Block Proof
            {proofReport && (
              <Badge
                variant={isRealProver ? "default" : "secondary"}
                className="text-xs"
              >
                {isRealProver ? (
                  <>
                    <Cpu className="w-3 h-3 mr-1" />
                    ZKP
                  </>
                ) : (
                  <>
                    <Zap className="w-3 h-3 mr-1" />
                    Mock
                  </>
                )}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copy(proof.proof)}
            className="h-8"
            data-testid="copy-proof-button"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Proof Verification Status */}
        {proofReport && (
          <div
            className={`flex items-center justify-between p-3 rounded-md ${
              isValid
                ? "bg-green-500/10 border border-green-500/20"
                : "bg-red-500/10 border border-red-500/20"
            }`}
            data-testid="proof-verification-status"
          >
            <div className="flex items-center gap-2">
              {isValid ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              <span className="font-medium">
                Proof Verification: {proofReport.verificationResult}
              </span>
            </div>
            {proofReport.proverLatencyMs && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span data-testid="proof-latency">
                  {proofReport.proverLatencyMs}ms
                </span>
              </div>
            )}
          </div>
        )}

        <div className="p-3 bg-secondary rounded-md font-mono text-sm break-all">
          {truncateHash(proof.proof, 24)}
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Block Proof ID</p>
            <p className="font-mono" data-testid="proof-id">
              {truncateHash(proof.id, 8)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Transactions</p>
            <p className="font-mono" data-testid="proof-tx-count">
              {proof.txCount}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-muted-foreground">State Root</p>
            <p className="font-mono" data-testid="proof-state-root">
              {truncateHash(proof.stateRoot, 16)}
            </p>
          </div>
          {proofReport && (
            <div className="col-span-2">
              <p className="text-muted-foreground">Prover Type</p>
              <p
                className="font-mono capitalize"
                data-testid="proof-prover-type"
              >
                {proofReport.proverType === "stone"
                  ? "Stone STARK Prover"
                  : "Mock Prover"}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
