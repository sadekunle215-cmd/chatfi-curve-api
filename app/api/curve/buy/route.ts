import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
const CURVE_PROGRAM_ID = new PublicKey("HRvfUT6rQV7ZpWs3Fenf1RWkRABU4bjPHhVeRckxabBG");
const CURVE_SEED = Buffer.from("bonding_curve");
const PLATFORM_TREASURY = new PublicKey("7tsf2T6S9bPPVSwT4AqaWRTDuneeiy5362BgQnA3shcL");

export async function POST(req: NextRequest) {
  try {
    const { mint, buyer, solAmount, slippageBps = 100 } = await req.json();
    if (!mint || !buyer || !solAmount) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const connection = new Connection(HELIUS_RPC, "confirmed");
    const mintPubkey = new PublicKey(mint);
    const buyerPubkey = new PublicKey(buyer);

    const [curvePDA] = PublicKey.findProgramAddressSync(
      [CURVE_SEED, mintPubkey.toBytes()],
      CURVE_PROGRAM_ID
    );

    // Get curve state to calculate min tokens out
    const account = await connection.getAccountInfo(curvePDA);
    if (!account) return NextResponse.json({ error: "Curve not found" }, { status: 404 });

    // Get ATAs
    const buyerATA = await getAssociatedTokenAddress(
      mintPubkey, buyerPubkey, false, TOKEN_2022_PROGRAM_ID
    );
    const curveATA = await getAssociatedTokenAddress(
      mintPubkey, curvePDA, true, TOKEN_2022_PROGRAM_ID
    );

    // Build buy instruction data
    // discriminator for "buy" = first 8 bytes of sha256("global:buy")
    const discriminator = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]); // already correct
    const solAmountBuf = Buffer.alloc(8);
    solAmountBuf.writeBigUInt64LE(BigInt(solAmount));
    const minTokensOut = Buffer.alloc(8);
    minTokensOut.writeBigUInt64LE(0n); // 0 = no slippage check for now

    const data = Buffer.concat([discriminator, solAmountBuf, minTokensOut]);

    const instruction = new TransactionInstruction({
      programId: CURVE_PROGRAM_ID,
      keys: [
        { pubkey: curvePDA, isSigner: false, isWritable: true },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: curveATA, isSigner: false, isWritable: true },
        { pubkey: buyerPubkey, isSigner: true, isWritable: true },
        { pubkey: buyerATA, isSigner: false, isWritable: true },
        { pubkey: curvePDA, isSigner: false, isWritable: true }, // vault
        { pubkey: PLATFORM_TREASURY, isSigner: false, isWritable: true },
        { pubkey: new PublicKey(account.data.slice(32, 64)), isSigner: false, isWritable: true }, // creator
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = buyerPubkey;
    tx.add(instruction);

    const serialized = tx.serialize({ requireAllSignatures: false });
    return NextResponse.json({ transaction: serialized.toString("base64") });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
