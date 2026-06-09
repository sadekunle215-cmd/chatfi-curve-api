import { NextRequest, NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";
const MAX_ATTEMPTS = 5_000_000;
const TIMEOUT_MS   = 25000;

// Simple XOR encrypt — same key derivation as mobile app
function encryptSecret(secretKey: Uint8Array, creatorWallet: string): string {
  const keyBuf = Buffer.from(creatorWallet, "utf8");
  const enc    = Buffer.alloc(secretKey.length);
  for (let i = 0; i < secretKey.length; i++) {
    enc[i] = secretKey[i] ^ keyBuf[i % keyBuf.length];
  }
  return enc.toString("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { suffix, creatorWallet } = await req.json();

    if (!suffix || !creatorWallet) {
      return NextResponse.json({ error: "Missing suffix or creatorWallet" }, { status: 400 });
    }

    const clean = suffix.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (clean.length < 2 || clean.length > 5) {
      return NextResponse.json({ error: "Suffix must be 2-5 alphanumeric characters" }, { status: 400 });
    }

    const start = Date.now();
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
      if (Date.now() - start > TIMEOUT_MS) {
        return NextResponse.json({
          error: `Could not find ...${clean} address in time. Try a shorter suffix.`,
          attempts,
        }, { status: 408 });
      }

      const kp   = Keypair.generate();
      const addr = kp.publicKey.toBase58().toLowerCase();
      attempts++;

      if (addr.endsWith(clean)) {
        const encrypted = encryptSecret(kp.secretKey, creatorWallet);
        return NextResponse.json({
          publicKey:          kp.publicKey.toBase58(),
          encryptedSecretKey: encrypted,
          attempts,
          suffix:             clean,
        });
      }
    }

    return NextResponse.json({ error: "Max attempts reached", attempts }, { status: 408 });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
