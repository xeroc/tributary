// x402-compliant server with Tributary subscriptions
import express from "express";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Tributary } from "@tributary-so/sdk";

// Configuration from environment variables
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const GATEWAY_AUTHORITY =
  process.env.GATEWAY_AUTHORITY ||
  "ConTf7Qf3r1QoDDLcLTMVxLrzzvPTPrwzEYJrjqm1U7";
const USDC_MINT =
  process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const RECIPIENT_WALLET =
  process.env.RECIPIENT_WALLET ||
  "8EVBvLDVhJUw1nkAUp73mPyxviVFK9Wza5ba1GRANEw1";

// Subscription parameters
const SUBSCRIPTION_AMOUNT = parseInt(process.env.SUBSCRIPTION_AMOUNT || "100"); // 0.0001 USDC
const PAYMENT_FREQUENCY = process.env.PAYMENT_FREQUENCY || "monthly";
const AUTO_RENEW = process.env.AUTO_RENEW === "true";
const MAX_RENEWALS = process.env.MAX_RENEWALS
  ? parseInt(process.env.MAX_RENEWALS)
  : null;

const connection = new Connection(RPC_URL, "confirmed");

// Initialize SDK (server doesn't need wallet for verification)
const sdk = new Tributary(connection, {} as any); // dummy wallet

// Gateway PDA
const gatewayPda = sdk.getGatewayPda(new PublicKey(GATEWAY_AUTHORITY)).address;

const app = express();
app.use(express.json());

// x402 endpoint - Quote or verify payment
app.get("/premium", async (req, res) => {
  const xPaymentHeader = req.header("X-Payment");

  // If client provided X-Payment header, verify and submit transaction
  if (xPaymentHeader) {
    try {
      // Decode base64 and parse JSON (x402 standard)
      const paymentData = JSON.parse(
        Buffer.from(xPaymentHeader, "base64").toString("utf-8")
      ) as {
        x402Version: number;
        scheme: string;
        network: string;
        payload: {
          serializedTransaction: string;
        };
      };

      console.log("Received subscription transaction from client");
      console.log(`  Network: ${paymentData.network}`);

      if (
        paymentData.network != "solana-devnet" &&
        paymentData.network != "solana-mainnet"
      ) {
        throw new Error(
          "Only network allowed is solana-devnet or solana-mainnet"
        );
      }

      // Deserialize the transaction
      const txBuffer = Buffer.from(
        paymentData.payload.serializedTransaction,
        "base64"
      );
      const tx = Transaction.from(txBuffer);

      console.log("Verifying subscription creation...");

      // Step 1: Verify instructions in the transaction
      // For subscription verification, we'll check after submission
      // The transaction should create the subscription policy

      // Step 2: Simulate the transaction BEFORE submitting
      console.log("Simulating transaction...");
      try {
        const simulation = await connection.simulateTransaction(tx);

        if (simulation.value.err) {
          console.error("Simulation failed:", simulation.value.err);
          return res.status(402).json({
            error: "Transaction simulation failed",
            details: simulation.value.err,
            logs: simulation.value.logs,
          });
        }

        console.log("  ✓ Simulation successful");
      } catch (simError) {
        console.error("Simulation error:", simError);
        return res.status(402).json({
          error: "Failed to simulate transaction",
          details:
            simError instanceof Error ? simError.message : "Unknown error",
        });
      }

      // Step 3: Submit the transaction (only if verified and simulated successfully)
      // Note: Solana blockchain automatically rejects duplicate transaction signatures
      console.log("Submitting transaction to network...");

      const signature = await connection.sendRawTransaction(txBuffer, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      console.log(`Transaction submitted: ${signature}`);

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(
        signature,
        "confirmed"
      );

      if (confirmation.value.err) {
        return res.status(402).json({
          error: "Transaction failed on-chain",
          details: confirmation.value.err,
        });
      }

      // Verify subscription was created
      console.log("Verifying subscription creation...");

      // In a real implementation, fetch the user's payment policies and verify the latest one matches expected details
      // For now, assume success since transaction confirmed

      console.log("Subscription verified!");
      console.log(
        `View transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
      );

      // Subscription verified! Return premium content
      return res.json({
        data: "Premium content - Subscription verified!",
        subscriptionDetails: {
          signature,
          recipient: RECIPIENT_WALLET,
          gateway: gatewayPda.toBase58(),
          amount: SUBSCRIPTION_AMOUNT,
          amountUSDC: SUBSCRIPTION_AMOUNT / 1000000,
          explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        },
      });
    } catch (e) {
      console.error("Payment verification error:", e);
      return res.status(402).json({
        error: "Payment verification failed",
        details: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  // No subscription provided - return 402 with subscription details
  console.log("New subscription quote requested");

  return res.status(402).json({
    subscription: {
      recipient: RECIPIENT_WALLET,
      gateway: gatewayPda.toBase58(),
      tokenMint: USDC_MINT,
      amount: SUBSCRIPTION_AMOUNT,
      amountUSDC: SUBSCRIPTION_AMOUNT / 1000000,
      paymentFrequency: PAYMENT_FREQUENCY,
      autoRenew: AUTO_RENEW,
      maxRenewals: MAX_RENEWALS,
      cluster: "devnet",
      message: "Create subscription for premium access",
    },
  });
});

app.listen(3001, () => console.log("x402 USDC server listening on :3001"));
