import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Button } from "@heroui/button";
import { useWallet, WalletContextState } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  useCreateSubscription,
  PaymentInterval,
  CreateSubscriptionResult,
} from "../";
import { Loader2 } from "lucide-react";

interface SubscriptionButtonProps {
  amount: BN;
  token: PublicKey;
  recipient: PublicKey;
  gateway: PublicKey;
  interval: PaymentInterval;
  custom_interval?: number;
  maxRenewals?: number;
  memo?: string;
  startTime?: Date;
  approvalAmount?: BN;
  executeImmediately?: boolean;
  label?: string;
  className?: string;
  disabled?: boolean;
  radius?: "none" | "sm" | "md" | "lg" | "full" | undefined;
  size?: "sm" | "md" | "lg" | undefined;
  wallet?: WalletContextState | undefined;
  onSuccess?: (result: CreateSubscriptionResult) => void;
  onError?: (error: Error) => void;
}

export function SubscriptionButton({
  amount,
  token,
  recipient,
  gateway,
  interval,
  custom_interval,
  maxRenewals,
  memo,
  startTime,
  approvalAmount,
  wallet,
  executeImmediately = true,
  label = "Subscribe",
  className = "",
  disabled = false,
  radius = "none",
  size = "lg",
  onSuccess,
  onError,
}: SubscriptionButtonProps) {
  wallet = wallet ?? useWallet();
  const { createSubscription, loading } = useCreateSubscription();

  const handleClick = async () => {
    try {
      const result = await createSubscription({
        amount,
        token,
        recipient,
        gateway,
        interval,
        custom_interval,
        maxRenewals,
        memo,
        startTime,
        approvalAmount,
        executeImmediately,
      });
      onSuccess?.(result);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error("Unknown error"));
    }
  };

  const isDisabled = disabled || loading;

  // If wallet is not connected, show connect wallet button
  if (!wallet.connected) {
    return <WalletMultiButton />;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        onClick={handleClick}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md border border-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        radius={radius}
        size={size}
      >
        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {loading ? "Creating Subscription..." : label}
      </Button>
      {wallet.publicKey && (
        <button
          onClick={() => wallet.disconnect()}
          className="text-sm text-gray-500 hover:text-gray-700 underline cursor-pointer"
        >
          Change wallet
        </button>
      )}
    </div>
  );
}
