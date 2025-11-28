import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { SEEDS } from "./constants";
import type { PdaResult } from "./types";
import BN from "bn.js";

export function getConfigPda(programId: PublicKey): PdaResult {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.CONFIG)],
    programId
  );
  return { address, bump };
}

export function getGatewayPda(
  gatewayAuthority: PublicKey,
  programId: PublicKey
): PdaResult {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.GATEWAY), gatewayAuthority.toBuffer()],
    programId
  );
  return { address, bump };
}

export function getUserPaymentPda(
  user: PublicKey,
  tokenMint: PublicKey,
  programId: PublicKey
): PdaResult {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.USER_PAYMENT), user.toBuffer(), tokenMint.toBuffer()],
    programId
  );
  return { address, bump };
}

export function getPaymentPolicyPda(
  userPayment: PublicKey,
  policyId: number,
  programId: PublicKey
): PdaResult {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(SEEDS.PAYMENT_POLICY),
      userPayment.toBuffer(),
      new BN(policyId).toArrayLike(Buffer, "le", 4),
    ],
    programId
  );
  return { address, bump };
}

/**
 * Derives the Payments Delegate PDA.
 * This PDA acts as the delegate authority for token accounts, allowing the program to pull funds for recurring payments.
 * @param programId The PublicKey of the Tributary program.
 * @returns An object containing the address and bump seed for the Payments Delegate PDA.
 */
export function getPaymentsDelegatePda(programId: PublicKey): PdaResult {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.PAYMENTS)],
    programId
  );
  return { address, bump };
}
