import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";
const CURVE_PROGRAM_ID = new PublicKey("HRvfUT6rQV7ZpWs3Fenf1RWkRABU4bjPHhVeRckxabBG");
const CURVE_SEED = Buffer.from("bonding_curve");

function decodeCurveState(data: Buffer) {
  let offset = 8; // skip discriminator
  const mint = new PublicKey(data.slice(offset, offset + 32)).toBase58(); offset += 32;
  const creator = new PublicKey(data.slice(offset, offset + 32)).toBase58(); offset += 32;
  const platformTreasury = new PublicKey(data.slice(offset, offset + 32)).toBase58(); offset += 32;
  const virtualSolReserves = data.readBigUInt64LE(offset); offset += 8;
  const virtualTokenReserves = data.readBigUInt64LE(offset); offset += 8;
  const realSolReserves = data.readBigUInt64LE(offset); offset += 8;
  const realTokenReserves = data.readBigUInt64LE(offset); offset += 8;
  const tokenTotalSupply = data.readBigUInt64LE(offset); offset += 8;
  const platformFeeBps = data.readBigUInt64LE(offset); offset += 8;
  const creatorFeeBps = data.readBigUInt64LE(offset); offset += 8;
  const graduationSolThreshold = data.readBigUInt64LE(offset); offset += 8;
  const complete = data[offset] === 1; offset += 1;
  const hasPool = data[offset] === 1; offset += 1;
  const meteoraPool = hasPool ? new PublicKey(data.slice(offset, offset + 32)).toBase58() : null;

  return {
    mint, creator, platformTreasury,
    virtualSolReserves: virtualSolReserves.toString(),
    virtualTokenReserves: virtualTokenReserves.toString(),
    realSolReserves: realSolReserves.toString(),
    realTokenReserves: realTokenReserves.toString(),
    tokenTotalSupply: tokenTotalSupply.toString(),
    platformFeeBps: platformFeeBps.toString(),
    creatorFeeBps: creatorFeeBps.toString(),
    graduationSolThreshold: graduationSolThreshold.toString(),
    complete, meteoraPool,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mint = searchParams.get("mint");
    if (!mint) return NextResponse.json({ error: "Missing mint" }, { status: 400 });

    const mintPubkey = new PublicKey(mint);
    const [curvePDA] = PublicKey.findProgramAddressSync(
      [CURVE_SEED, mintPubkey.toBytes()],
      CURVE_PROGRAM_ID
    );

    const connection = new Connection(HELIUS_RPC, "confirmed");
    const account = await connection.getAccountInfo(curvePDA);
    if (!account) return NextResponse.json(null, { status: 404 });

    const state = decodeCurveState(Buffer.from(account.data));
    return NextResponse.json(state);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
