import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

async function supabase(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Prefer": "return=representation",
      ...(options.headers || {}),
    },
  });
  return res;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mint = searchParams.get("mint");

  if (mint) {
    const res = await supabase(`/tokens?mint=eq.${mint}&limit=1`);
    const data = await res.json();
    if (!data || data.length === 0) return NextResponse.json(null, { status: 404 });
    const t = data[0];
    return NextResponse.json({
      mint: t.mint,
      creatorWallet: t.creator_wallet,
      feeBps: t.fee_bps,
      name: t.name,
      symbol: t.symbol,
      imageUrl: t.image_url,
      description: t.description,
      createdAt: t.created_at,
    });
  }

  const creatorWallet = searchParams.get("creatorWallet");
  const filter = creatorWallet ? `/tokens?creator_wallet=eq.${creatorWallet}&order=created_at.desc&limit=100` : `/tokens?order=created_at.desc&limit=100`;
  const res = await supabase(filter);
  const data = await res.json();
  if (!Array.isArray(data)) return NextResponse.json([]);
  return NextResponse.json(data.map(t => ({
    mint: t.mint,
    creatorWallet: t.creator_wallet,
    feeBps: t.fee_bps,
    name: t.name,
    symbol: t.symbol,
    imageUrl: t.image_url,
    description: t.description,
    createdAt: t.created_at,
  })));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mint, creatorWallet, feeBps, name, symbol, imageUrl, description } = body;
    if (!mint || !creatorWallet) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const res = await supabase("/tokens", {
      method: "POST",
      body: JSON.stringify({
        mint,
        creator_wallet: creatorWallet,
        fee_bps: feeBps || 100,
        name: name || "",
        symbol: symbol || "",
        image_url: imageUrl || "",
        description: description || "",
      }),
      headers: { "Prefer": "resolution=merge-duplicates" },
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
