"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProofBox } from "@/components/results/proof-box";
import { RailConfirmation } from "@/components/results/rail-confirmation";
import { SecurityStatus } from "@/components/results/security-status";
import { useSettlement } from "@/context/settlement-context";

export default function ResultsPage() {
  const router = useRouter();
  const { status, result, rail, proofReport, reset } = useSettlement();

  useEffect(() => {
    if (status !== "completed" || !result) {
      router.push("/");
    }
  }, [status, result, router]);

  const handleNewSettlement = () => {
    reset();
    router.push("/");
  };

  if (status !== "completed" || !result) {
    return (
      <Container>
        <div className="flex items-center justify-center py-16">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </Container>
    );
  }

  const railData = result.rails[rail];

  return (
    <Container>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Settlement Complete</h1>
              <p className="text-muted-foreground">
                All proofs verified and settlement confirmed
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="border-green-500/50 text-green-400"
          >
            Verified
          </Badge>
        </div>

        <ProofBox proof={result.blockProof} proofReport={proofReport} />

        {railData && <RailConfirmation rail={rail} data={railData} />}

        <SecurityStatus
          pqVerified={result.security.pqVerified}
          mpcActive={result.security.mpcActive}
        />

        <div className="flex justify-center pt-4">
          <Button onClick={handleNewSettlement} size="lg" className="gap-2">
            Start New Settlement
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Container>
  );
}
