import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
const CURVE_PROGRAM_ID = new PublicKey("HRvfUT6rQV7ZpWs3Fenf1RWkRABU4bjPHhVeRckxabBG");
const CURVE_SEED = Buffer.from("bonding_curve");
const PLATFORM_TREASURY = new PublicKey("7tsf2T6S9bPPVSwT4AqaWRTDuneeiy5362BgQnA3shcL");

export async function POST(req: NextRequest) {
  try {
    const { mint, seller, tokenAmount, slippageBps = 100 } = await req.json();
    if (!mint || !seller || !tokenAmount) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const connection = new Connection(HELIUS_RPC, "confirmed");
    const mintPubkey = new PublicKey(mint);
    const sellerPubkey = new PublicKey(seller);

    const [curvePDA] = PublicKey.findProgramAddressSync(
      [CURVE_SEED, mintPubkey.toBytes()],
      CURVE_PROGRAM_ID
    );

    const account = await connection.getAccountInfo(curvePDA);
    if (!account) return NextResponse.json({ error: "Curve not found" }, { status: 404 });

    const sellerATA = await getAssociatedTokenAddress(
      mintPubkey, sellerPubkey, false, TOKEN_2022_PROGRAM_ID
    );
    const curveATA = await getAssociatedTokenAddress(
      mintPubkey, curvePDA, true, TOKEN_2022_PROGRAM_ID
    );

    // discriminator for "sell"
    const discriminator = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]); // already correct
    const tokenAmountBuf = Buffer.alloc(8);
    tokenAmountBuf.writeBigUInt64LE(BigInt(tokenAmount));
    const minSolOut = Buffer.alloc(8);
    minSolOut.writeBigUInt64LE(0n);

    const data = Buffer.concat([discriminator, tokenAmountBuf, minSolOut]);

    const instruction = new TransactionInstruction({
      programId: CURVE_PROGRAM_ID,
      keys: [
        { pubkey: curvePDA, isSigner: false, isWritable: true },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: curveATA, isSigner: false, isWritable: true },
        { pubkey: sellerPubkey, isSigner: true, isWritable: true },
        { pubkey: sellerATA, isSigner: false, isWritable: true },
        { pubkey: curvePDA, isSigner: false, isWritable: true },
        { pubkey: PLATFORM_TREASURY, isSigner: false, isWritable: true },
        { pubkey: new PublicKey(account.data.slice(32, 64)), isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = sellerPubkey;
    tx.add(instruction);

    const serialized = tx.serialize({ requireAllSignatures: false });
    return NextResponse.json({ transaction: serialized.toString("base64") });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
