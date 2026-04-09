"use client";

import { Copy, Check, CheckCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCopyClipboard } from "@/hooks/use-copy-clipboard";
import type { SettlementResult } from "@/services/types";

interface RailConfirmationProps {
  rail: "solana" | "bitcoin" | "fiat";
  data: NonNullable<SettlementResult["rails"][keyof SettlementResult["rails"]]>;
}

const railConfig = {
  solana: {
    title: "Solana Transaction",
    icon: "◎",
  },
  bitcoin: {
    title: "Bitcoin PSBT",
    icon: "₿",
  },
  fiat: {
    title: "Fiat ISO 20022",
    icon: "$",
  },
};

export function RailConfirmation({ rail, data }: RailConfirmationProps) {
  const { copied, copy } = useCopyClipboard();
  const config = railConfig[rail];

  const getCopyValue = () => {
    if ("signature" in data) return data.signature;
    if ("txid" in data) return data.txid;
    if ("messageId" in data) return data.messageId;
    return "";
  };

  const getMainValue = () => {
    if ("signature" in data) return data.signature;
    if ("txid" in data) return data.txid;
    if ("messageId" in data) return data.messageId;
    return "";
  };

  const getSecondaryInfo = () => {
    if ("slot" in data) return `Slot: ${data.slot.toLocaleString()}`;
    if ("confirmations" in data) return `Confirmations: ${data.confirmations}`;
    if ("date" in data) return `Settlement Date: ${data.date}`;
    return "";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="text-xl">{config.icon}</span>
          {config.title}
          <CheckCircle className="w-4 h-4 text-green-400 ml-auto" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <code className="flex-1 p-2 bg-secondary rounded text-xs font-mono truncate">
            {getMainValue()}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => copy(getCopyValue())}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{getSecondaryInfo()}</p>
      </CardContent>
    </Card>
  );
}
