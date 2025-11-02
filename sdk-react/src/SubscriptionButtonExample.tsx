import React from "react";
import { SubscriptionButton } from "./components/SubscriptionButton";
import { PaymentInterval } from "./types";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// Default configuration constants
const DEFAULT_CONFIG = {
  // USDC token mint (mainnet)
  TOKEN: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  // Example recipient (replace with actual recipient)
  RECIPIENT: new PublicKey("8EVBvLDVhJUw1nkAUp73mPyxviVFK9Wza5ba1GRANEw1"),
  // Example gateway (replace with actual gateway)
  GATEWAY: new PublicKey("CwNybLVQ3sVmcZ3Q1veS6x99gUZcAF2duNDe3qbcEMGr"),
  // Amount: 10 USDC (6 decimals)
  AMOUNT: new BN(1_000),
  // Approval amount: 120 USDC for 12 months
  APPROVAL_AMOUNT: new BN(120_000_000),
} as const;

const SubscriptionButtonExample: React.FC = () => {
  const handleSuccess = (result: any) => {
    console.log("Subscription created successfully:", result);
    alert("Subscription created! Check console for details.");
  };

  const handleError = (error: Error) => {
    console.error("Subscription creation failed:", error);
    alert(`Error: ${error.message}`);
  };

  return (
    <div className="max-w-4xl mx-auto mt-8">
      <div className="text-center">
        <SubscriptionButton
          amount={DEFAULT_CONFIG.AMOUNT}
          token={DEFAULT_CONFIG.TOKEN}
          recipient={DEFAULT_CONFIG.RECIPIENT}
          gateway={DEFAULT_CONFIG.GATEWAY}
          interval={PaymentInterval.Monthly}
          maxRenewals={12}
          memo="Example subscription - Landing page demo"
          approvalAmount={DEFAULT_CONFIG.APPROVAL_AMOUNT}
          executeImmediately={true}
          label="Subscribe for $0.001/month"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all"
          onSuccess={handleSuccess}
          onError={handleError}
        />
      </div>
    </div>
  );
};

export default SubscriptionButtonExample;
