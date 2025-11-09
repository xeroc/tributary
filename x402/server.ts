// x402-compliant server with Tributary subscriptions
import express from "express";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Tributary, PaymentStatus } from "@tributary-so/sdk";
import jwt from "jsonwebtoken";

// Configuration from environment variables
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const GATEWAY_AUTHORITY =
  process.env.GATEWAY_AUTHORITY ||
  "ConTf7Qf3r1QoDDLcLTMVxLrzzvPTPrwzEYJrjqm1U7";
const TOKEN_MINT =
  process.env.TOKEN_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
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

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || "tributary-x402-secret";

const connection = new Connection(RPC_URL, "confirmed");

// Initialize SDK (server doesn't need wallet for verification)
const sdk = new Tributary(connection, {} as any); // dummy wallet

// Gateway PDA
const gatewayPda = sdk.getGatewayPda(new PublicKey(GATEWAY_AUTHORITY)).address;

// Verification function for subscription creation
async function verifySubscriptionCreation(
  userPublicKey: PublicKey,
  expectedAmount: number,
  expectedTokenMint: PublicKey,
  expectedGateway: PublicKey,
  expectedRecipient: PublicKey
): Promise<{ success: boolean; error?: string; policyAddress?: PublicKey }> {
  try {
    // Get user's payment policies
    const userPaymentPolicies = await sdk.getPaymentPoliciesByUser(
      sdk.getUserPaymentPda(userPublicKey, expectedTokenMint).address
    );

    if (userPaymentPolicies.length === 0) {
      return { success: false, error: "No payment policies found for user" };
    }

    // Get the most recent policy (assuming it's the one just created)
    const latestPolicy = userPaymentPolicies.sort((a, b) =>
      b.account.createdAt.sub(a.account.createdAt).toNumber()
    )[0];

    const policy = latestPolicy.account;
    const policyAddress = latestPolicy.publicKey;

    console.log(`Found policy: ${policyAddress.toBase58()}`);

    // 1. Check that status is active
    if (Object.keys(policy.status)[0] !== "active") {
      return {
        success: false,
        error: `Policy status is ${policy.status}, expected active`,
      };
    }

    // 2. Check that start_time lies in the past (within reasonable tolerance)
    // const now = Math.floor(Date.now() / 1000);
    // const startTime =
    //   policy.policyType.subscription?.nextPaymentDue.toNumber() || 0;
    // const tolerance = 300; // 5 minutes tolerance
    // if (startTime > now + tolerance) {
    //   return {
    //     success: false,
    //     error: `Start time ${startTime} is in the future (current: ${now})`,
    //   };
    // }

    // 3. Check that the amount is the expected amount
    const policyAmount = policy.policyType.subscription?.amount.toNumber() || 0;
    if (policyAmount !== expectedAmount) {
      return {
        success: false,
        error: `Policy amount ${policyAmount} does not match expected ${expectedAmount}`,
      };
    }

    // 4. Check that the mint is the expected mint
    const policyTokenMint = policy.userPayment; // Get from userPayment account
    const userPayment = await sdk.getUserPayment(policyTokenMint);

    if (
      !userPayment ||
      userPayment.tokenMint.toBase58() !== expectedTokenMint.toBase58()
    ) {
      return {
        success: false,
        error: `Token mint ${userPayment?.tokenMint.toBase58()} does not match expected ${expectedTokenMint.toBase58()}`,
      };
    }

    // 5. Additional checks: gateway and recipient
    if (policy.gateway.toBase58() !== expectedGateway.toBase58()) {
      return {
        success: false,
        error: `Gateway ${policy.gateway.toBase58()} does not match expected ${expectedGateway.toBase58()}`,
      };
    }

    if (policy.recipient.toBase58() !== expectedRecipient.toBase58()) {
      return {
        success: false,
        error: `Recipient ${policy.recipient.toBase58()} does not match expected ${expectedRecipient.toBase58()}`,
      };
    }

    console.log("✓ Subscription verification successful");
    return { success: true, policyAddress };
  } catch (error) {
    console.error("Subscription verification error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown verification error",
    };
  }
}

const app = express();
app.use(express.json());

// x402 endpoint - Quote or verify payment
app.get("/premium", async (req, res) => {
  const authHeader = req.header("Authorization");

  // Check for JWT authorization
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
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
        return res.json({
          data: "Premium content - Subscription verified!",
          subscriptionDetails: {
            policyAddress: decoded.policyAddress,
            subscriptionId: decoded.subscriptionId,
            amount: decoded.amount,
            recipient: decoded.recipient,
            gateway: decoded.gateway,
          },
        });
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
        id: string;
        payload: {
          serializedTransaction: string;
        };
      };

      console.log("Received deferred subscription transaction from client");
      console.log(`  Network: ${paymentData.network}`);
      console.log(`  Scheme: ${paymentData.scheme}`);
      console.log(`  ID: ${paymentData.id}`);

      if (paymentData.scheme !== "deferred") {
        throw new Error("Only deferred scheme is supported");
      }

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

      // Extract the signer (user) from the transaction
      // NOTE: this is technically not accurate because the PDA can be owned by someone else!
      // How would we extract the owner of the payment policy from a signed transaction?
      // Guess we would have to deserialize the tx and extract from position of accounts
      // For demo-ing, we go an easy route
      const userPublicKey = tx.feePayer!; // Fee payer is the signer

      console.log("Pre-Verifying subscription creation...");
      const preVerification = await verifySubscriptionCreation(
        userPublicKey,
        SUBSCRIPTION_AMOUNT,
        new PublicKey(TOKEN_MINT),
        gatewayPda,
        new PublicKey(RECIPIENT_WALLET)
      );

      if (preVerification.success) {
        console.log("✓ Existing subscription found, returning JWT early");

        // Create JWT for existing subscription
        const token = jwt.sign(
          {
            policyAddress: preVerification.policyAddress?.toBase58(),
            subscriptionId: paymentData.id,
            amount: SUBSCRIPTION_AMOUNT,
            recipient: RECIPIENT_WALLET,
            gateway: gatewayPda.toBase58(),
            tokenMint: TOKEN_MINT,
            paymentFrequency: PAYMENT_FREQUENCY,
            autoRenew: AUTO_RENEW,
          },
          JWT_SECRET,
          { expiresIn: "1y" }
        );

        res.set(
          "Payment-Response",
          `scheme="deferred", network="${paymentData.network}", id="${
            paymentData.id
          }", timestamp=${Date.now()}`
        );
        return res.json({
          jwt: token,
          message:
            "Existing deferred subscription verified. Use JWT for future access.",
          subscriptionDetails: {
            policyAddress: preVerification.policyAddress?.toBase58(),
            subscriptionId: paymentData.id,
          },
        });
      }

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
      const verification = await verifySubscriptionCreation(
        userPublicKey,
        SUBSCRIPTION_AMOUNT,
        new PublicKey(TOKEN_MINT),
        gatewayPda,
        new PublicKey(RECIPIENT_WALLET)
      );

      if (!verification.success) {
        return res.status(402).json({
          error: "Subscription verification failed",
          details: verification.error,
        });
      }

      console.log("Subscription verified!");
      console.log(
        `View transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
      );

      // Create JWT with subscription details
      const token = jwt.sign(
        {
          policyAddress: verification.policyAddress?.toBase58(),
          subscriptionId: paymentData.id,
          amount: SUBSCRIPTION_AMOUNT,
          recipient: RECIPIENT_WALLET,
          gateway: gatewayPda.toBase58(),
          tokenMint: TOKEN_MINT,
          paymentFrequency: PAYMENT_FREQUENCY,
          autoRenew: AUTO_RENEW,
        },
        JWT_SECRET,
        { expiresIn: "1y" }
      );

      // Return JWT as proof of deferred subscription
      res.set(
        "Payment-Response",
        `scheme="deferred", network="${paymentData.network}", id="${
          paymentData.id
        }", timestamp=${Date.now()}`
      );
      return res.json({
        jwt: token,
        message:
          "Deferred subscription created successfully. Use JWT for future access.",
        subscriptionDetails: {
          signature,
          policyAddress: verification.policyAddress?.toBase58(),
          subscriptionId: paymentData.id,
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

  // No subscription provided - return 402 with deferred scheme offer
  console.log("New deferred subscription quote requested");

  const subscriptionId = `sub_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  return res.status(402).json({
    accepts: [
      {
        scheme: "deferred",
        network: "solana-devnet",
        resource: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        id: subscriptionId,
        termsUrl: "https://tributary.so/terms",
        amount: SUBSCRIPTION_AMOUNT,
        currency: "USDC",
        recipient: RECIPIENT_WALLET,
        gateway: gatewayPda.toBase58(),
        tokenMint: TOKEN_MINT,
        paymentFrequency: PAYMENT_FREQUENCY,
        autoRenew: AUTO_RENEW,
        maxRenewals: MAX_RENEWALS,
      },
    ],
  });
});

app.listen(3001, () => console.log("x402 USDC server listening on :3001"));
