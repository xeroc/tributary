// x402-compliant server with Tributary subscriptions
import express from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { Tributary } from "@tributary-so/sdk";
import { createX402Middleware, X402Options } from "./middleware.js";

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

// x402 middleware configuration
const x402Config: X402Options = {
  scheme: "deferred",
  network: "solana-devnet",
  amount: SUBSCRIPTION_AMOUNT,
  recipient: RECIPIENT_WALLET,
  gateway: gatewayPda.toBase58(),
  tokenMint: TOKEN_MINT,
  paymentFrequency: PAYMENT_FREQUENCY,
  autoRenew: AUTO_RENEW,
  maxRenewals: MAX_RENEWALS,
  jwtSecret: JWT_SECRET,
  sdk,
  connection,
};

const x402Middleware = createX402Middleware(x402Config);

const app = express();
app.use(express.json());

// x402 endpoint - Premium content with deferred payment
app.get("/premium", x402Middleware, (req, res) => {
  res.json({
    data: "Premium content - Subscription verified!",
  });
});

app.listen(3001, () => console.log("x402 USDC server listening on :3001"));
