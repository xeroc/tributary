import { Request, Response, NextFunction } from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { Transaction } from "@solana/web3.js";
import { Tributary } from "@tributary-so/sdk";
import jwt from "jsonwebtoken";

export interface X402Options {
  scheme: "deferred";
  network: string;
  amount: number;
  recipient: string;
  gateway: string;
  tokenMint: string;
  paymentFrequency: string;
  autoRenew: boolean;
  maxRenewals?: number | null;
  jwtSecret: string;
  sdk: Tributary;
  connection: Connection;
}

export function createX402Middleware(options: X402Options) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const {
      scheme,
      network,
      amount,
      recipient,
      gateway,
      tokenMint,
      paymentFrequency,
      autoRenew,
      maxRenewals,
      jwtSecret,
      sdk,
      connection,
    } = options;

    // 1. Check for JWT in Authorization header
    const authHeader = req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, jwtSecret) as {
          policyAddress: string;
          subscriptionId: string;
          amount: number;
          recipient: string;
          gateway: string;
        };

        // Verify policy exists and is valid
        const policy = await sdk.getPaymentPolicy(
          new PublicKey(decoded.policyAddress)
        );
        if (policy && Object.keys(policy.status)[0] === "active") {
          return next(); // Proceed to route handler
        } else {
          return res
            .status(402)
            .json({ error: "Invalid or inactive subscription" });
        }
      } catch (e) {
        console.error("JWT verification error:", e);
        return res.status(401).json({ error: "Invalid JWT token" });
      }
    }

    // 2. Check for X-Payment header
    const xPaymentHeader = req.header("X-Payment");
    if (xPaymentHeader) {
      try {
        // Decode base64 and parse JSON
        const paymentData = JSON.parse(
          Buffer.from(xPaymentHeader, "base64").toString("utf-8")
        ) as {
          x402Version: number;
          scheme: string;
          network: string;
          id: string;
          payload: {
            serializedTransaction: string;
          };
        };

        console.log(`Received ${scheme} payment from client`);
        console.log(`  Network: ${paymentData.network}`);
        console.log(`  Scheme: ${paymentData.scheme}`);
        console.log(`  ID: ${paymentData.id}`);

        if (paymentData.scheme !== scheme) {
          throw new Error(`Only ${scheme} scheme is supported`);
        }

        if (paymentData.network !== network) {
          throw new Error(`Only ${network} network is supported`);
        }

        // Deserialize the transaction
        const txBuffer = Buffer.from(
          paymentData.payload.serializedTransaction,
          "base64"
        );
        const tx = Transaction.from(txBuffer);

        // Extract the signer (user)
        const userPublicKey = tx.feePayer!;

        // Pre-verify existing subscription
        const preVerification = await verifySubscriptionCreation(
          sdk,
          userPublicKey,
          amount,
          new PublicKey(tokenMint),
          new PublicKey(gateway),
          new PublicKey(recipient)
        );

        if (preVerification.success) {
          console.log("✓ Existing subscription found, returning JWT early");

          // Create JWT for existing subscription
          const token = jwt.sign(
            {
              policyAddress: preVerification.policyAddress?.toBase58(),
              subscriptionId: paymentData.id,
              amount,
              recipient,
              gateway,
              tokenMint,
              paymentFrequency,
              autoRenew,
            },
            jwtSecret,
            { expiresIn: "1y" }
          );

          res.set(
            "Payment-Response",
            `scheme="${scheme}", network="${network}", id="${
              paymentData.id
            }", timestamp=${Date.now()}`
          );
          return res.json({
            jwt: token,
            message: `Existing ${scheme} subscription verified. Use JWT for future access.`,
            subscriptionDetails: {
              policyAddress: preVerification.policyAddress?.toBase58(),
              subscriptionId: paymentData.id,
            },
          });
        }

        // Simulate the transaction
        console.log("Simulating transaction...");
        const simulation = await connection.simulateTransaction(tx);
        if (simulation.value.err) {
          console.error("Simulation failed:", simulation.value.err);
          return res.status(402).json({
            error: "Transaction simulation failed",
            details: simulation.value.err,
          });
        }
        console.log("  ✓ Simulation successful");

        // Submit the transaction
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
        const verification = await verifySubscriptionCreation(
          sdk,
          userPublicKey,
          amount,
          new PublicKey(tokenMint),
          new PublicKey(gateway),
          new PublicKey(recipient)
        );

        if (!verification.success) {
          return res.status(402).json({
            error: "Subscription verification failed",
            details: verification.error,
          });
        }

        console.log("✓ Subscription verified");

        // Create JWT
        const token = jwt.sign(
          {
            policyAddress: verification.policyAddress?.toBase58(),
            subscriptionId: paymentData.id,
            amount,
            recipient,
            gateway,
            tokenMint,
            paymentFrequency,
            autoRenew,
          },
          jwtSecret,
          { expiresIn: "1y" }
        );

        res.set(
          "Payment-Response",
          `scheme="${scheme}", network="${network}", id="${
            paymentData.id
          }", timestamp=${Date.now()}`
        );
        return res.json({
          jwt: token,
          message: `${scheme} subscription created successfully. Use JWT for future access.`,
          subscriptionDetails: {
            signature,
            policyAddress: verification.policyAddress?.toBase58(),
            subscriptionId: paymentData.id,
            explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
          },
        });
      } catch (e) {
        console.error("Payment processing error:", e);
        return res.status(402).json({
          error: "Payment processing failed",
          details: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    // 3. Return 402 offer
    console.log(`New ${scheme} subscription quote requested`);

    // We use some random subscription ID to referr to. We don't yet know anything about a potential subscription.
    // Also, we don't put anything into the database because the requests costs an attacker nothing.
    const randomString = Math.random().toString(36).slice(2);
    const subscriptionId = `sub_${Date.now()}_${randomString}`;

    return res.status(402).json({
      accepts: [
        {
          scheme,
          network,
          resource: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
          id: subscriptionId,
          termsUrl: "https://tributary.so/terms",
          amount,
          currency: "USDC",
          recipient,
          gateway,
          tokenMint,
          paymentFrequency,
          autoRenew,
          maxRenewals,
        },
      ],
    });
  };
}

// Helper function for subscription verification
async function verifySubscriptionCreation(
  sdk: Tributary,
  userPublicKey: PublicKey,
  expectedAmount: number,
  expectedTokenMint: PublicKey,
  expectedGateway: PublicKey,
  expectedRecipient: PublicKey
): Promise<{ success: boolean; error?: string; policyAddress?: PublicKey }> {
  try {
    const userPaymentPolicies = await sdk.getPaymentPoliciesByUser(
      sdk.getUserPaymentPda(userPublicKey, expectedTokenMint).address
    );

    if (userPaymentPolicies.length === 0) {
      return { success: false, error: "No payment policies found for user" };
    }

    const latestPolicy = userPaymentPolicies.sort((a, b) =>
      b.account.createdAt.sub(a.account.createdAt).toNumber()
    )[0];

    const policy = latestPolicy.account;
    const policyAddress = latestPolicy.publicKey;

    if (Object.keys(policy.status)[0] !== "active") {
      return {
        success: false,
        error: `Policy status is ${policy.status}, expected active`,
      };
    }

    const policyAmount = policy.policyType.subscription?.amount.toNumber() || 0;
    if (policyAmount !== expectedAmount) {
      return {
        success: false,
        error: `Policy amount ${policyAmount} does not match expected ${expectedAmount}`,
      };
    }

    const userPayment = await sdk.getUserPayment(policy.userPayment);
    if (!userPayment || !userPayment.tokenMint.equals(expectedTokenMint)) {
      return {
        success: false,
        error: `Token mint does not match expected`,
      };
    }

    if (!policy.gateway.equals(expectedGateway)) {
      return {
        success: false,
        error: `Gateway does not match expected`,
      };
    }

    if (!policy.recipient.equals(expectedRecipient)) {
      return {
        success: false,
        error: `Recipient does not match expected`,
      };
    }

    return { success: true, policyAddress };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown verification error",
    };
  }
}
