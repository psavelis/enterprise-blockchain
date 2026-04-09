"use client";

import { Shield, Key, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SecurityStatusProps {
  pqVerified: boolean;
  mpcActive: boolean;
}

export function SecurityStatus({ pqVerified, mpcActive }: SecurityStatusProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card
        className={cn(
          "border",
          pqVerified ? "border-green-500/30 bg-green-500/5" : "border-border"
        )}
      >
        <CardContent className="py-4 flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              pqVerified ? "bg-green-500/20" : "bg-secondary"
            )}
          >
            <Shield
              className={cn(
                "w-5 h-5",
                pqVerified ? "text-green-400" : "text-muted-foreground"
              )}
            />
          </div>
          <div>
            <p className="text-sm font-medium">Post-Quantum Signature</p>
            <p
              className={cn(
                "text-xs flex items-center gap-1",
                pqVerified ? "text-green-400" : "text-muted-foreground"
              )}
            >
              {pqVerified && <Check className="w-3 h-3" />}
              {pqVerified ? "Verified (ML-DSA-65)" : "Pending"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card
        className={cn(
          "border",
          mpcActive ? "border-green-500/30 bg-green-500/5" : "border-border"
        )}
      >
        <CardContent className="py-4 flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              mpcActive ? "bg-green-500/20" : "bg-secondary"
            )}
          >
            <Key
              className={cn(
                "w-5 h-5",
                mpcActive ? "text-green-400" : "text-muted-foreground"
              )}
            />
          </div>
          <div>
            <p className="text-sm font-medium">MPC/HSM Status</p>
            <p
              className={cn(
                "text-xs flex items-center gap-1",
                mpcActive ? "text-green-400" : "text-muted-foreground"
              )}
            >
              {mpcActive && <Check className="w-3 h-3" />}
              {mpcActive ? "Active" : "Inactive"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
