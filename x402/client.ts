import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import fetch from "node-fetch";
import { readFileSync } from "fs";
import {
  createMemoBuffer,
  getPaymentFrequency,
  PaymentFrequencyString,
  Tributary,
} from "@tributary-so/sdk";
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";

// Configuration from environment variables
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const KEYPAIR_PATH = process.env.KEYPAIR_PATH;

if (!KEYPAIR_PATH) {
  throw new Error(`KEYPAIR_PATH required!`);
}

const connection = new Connection(RPC_URL, "confirmed");
const keypairData = JSON.parse(readFileSync(KEYPAIR_PATH, "utf-8"));
const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
console.log(`Signer: ${payer.publicKey.toString()}`);

// Initialize SDK
const wallet = new anchor.Wallet(payer);
const sdk = new Tributary(connection, wallet);

async function run() {
  // 1) Request subscription quote from server
  const quote = await fetch("http://localhost:3001/premium");
  const q = (await quote.json()) as {
    subscription: {
      recipient: string;
      gateway: string;
      tokenMint: string;
      amount: number;
      paymentFrequency: string;
      paymentFrequencyCustom: number;
      autoRenew: boolean;
      maxRenewals: number | null;
      cluster: string;
    };
  };
  if (quote.status !== 402) throw new Error("Expected 402 quote");

  const recipient = new PublicKey(q.subscription.recipient);
  const gateway = new PublicKey(q.subscription.gateway);
  const tokenMint = new PublicKey(q.subscription.tokenMint);
  const amount = new BN(q.subscription.amount);
  const paymentFrequency = q.subscription.paymentFrequency;
  const paymentFrequencyCustom = q.subscription
    .paymentFrequencyCustom as number;
  const autoRenew = q.subscription.autoRenew;
  const maxRenewals = q.subscription.maxRenewals;

  console.log("Subscription required:");
  console.log(`  Recipient: ${q.subscription.recipient}`);
  console.log(`  Gateway: ${q.subscription.gateway}`);
  console.log(`  Token Mint: ${q.subscription.tokenMint}`);
  console.log(
    `  Amount: ${
      q.subscription.amount / 1000000
    } USDC (${amount.toString()} smallest units)`
  );
  console.log(`  Frequency: ${paymentFrequency}`);
  console.log(`  Auto Renew: ${autoRenew}`);
  console.log(`  Max Renewals: ${maxRenewals}`);

  // 2) Get or create the payer's associated token account
  console.log("\nChecking/creating associated token account...");
  const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    tokenMint,
    payer.publicKey
  );

  console.log(`  Payer Token Account: ${payerTokenAccount.address.toBase58()}`);

  // Check if payer has enough USDC
  const balance = await connection.getTokenAccountBalance(
    payerTokenAccount.address
  );
  console.log(`  Current Balance: ${balance.value.uiAmountString} USDC`);

  if (Number(balance.value.amount) < amount.toNumber()) {
    throw new Error(
      `Insufficient USDC balance. Have: ${
        balance.value.uiAmountString
      }, Need: ${q.subscription.amount / 100000}`
    );
  }

  // 3) Create subscription transaction using SDK
  console.log("\nCreating subscription transaction...");
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: payer.publicKey,
    blockhash,
    lastValidBlockHeight: (await connection.getLatestBlockhash())
      .lastValidBlockHeight,
  });

  // Create subscription instructions
  const subscriptionIxs = await sdk.createSubscriptionInstruction(
    tokenMint,
    recipient,
    gateway,
    amount,
    autoRenew,
    maxRenewals,
    getPaymentFrequency(
      paymentFrequency as PaymentFrequencyString,
      paymentFrequencyCustom
    ),
    createMemoBuffer("x402 subscription"), // memo
    undefined, // startTime
    amount, // approvalAmount
    true // executeImmediately
  );

  tx.add(...subscriptionIxs);

  // Sign the transaction (but don't send it, the server will do that)
  tx.sign(payer);

  // Serialize the signed transaction
  const serializedTx = tx.serialize().toString("base64");

  console.log("\nTransaction created and signed (not submitted yet)");
  console.log(`  Instructions: ${tx.instructions.length}`);

  // 4) Send X-Payment header with serialized transaction (x402 standard)
  const paymentProof = {
    x402Version: 1,
    scheme: "subscription",
    network:
      q.subscription.cluster === "devnet" ? "solana-devnet" : "solana-mainnet",
    payload: {
      serializedTransaction: serializedTx,
    },
  };

  // Base64 encode the payment proof
  const xPaymentHeader = Buffer.from(JSON.stringify(paymentProof)).toString(
    "base64"
  );

  console.log(
    "\nSending payment proof to server (server will submit transaction)..."
  );
  const paid = await fetch("http://localhost:3001/premium", {
    headers: {
      "X-Payment": xPaymentHeader,
    },
  });

  const result = (await paid.json()) as {
    data?: string;
    error?: string;
    subscriptionDetails?: {
      recipient: string;
      gateway: string;
      amount: number;
      signature?: string;
      explorerUrl?: string;
    };
  };

  console.log("\nServer response:");
  console.log(result);

  // Verify subscription locally if server confirmed
  if (result.subscriptionDetails) {
    console.log("\nVerifying subscription locally...");

    // Get user's payment policies
    const userPolicies = await sdk.getPaymentPoliciesByUser(payer.publicKey);
    const latestPolicy = userPolicies[userPolicies.length - 1];

    if (latestPolicy) {
      const policy = await sdk.getPaymentPolicy(latestPolicy.publicKey);
      if (policy) {
        const expectedAmount = new BN(q.subscription.amount);
        const matches =
          policy.recipient.equals(recipient) &&
          policy.gateway.equals(gateway) &&
          policy.policyType.subscription?.amount.eq(expectedAmount);

        if (matches) {
          console.log("✓ Subscription verified locally");
        } else {
          console.log("⚠ Subscription details don't match expected values");
        }
      }
    }

    if (result.subscriptionDetails.explorerUrl) {
      // Not available if subscription already existed
      console.log("\n🔗 View transaction on Solana Explorer:");
      console.log(result.subscriptionDetails.explorerUrl);
    }
  }
}

run().catch(console.error);
