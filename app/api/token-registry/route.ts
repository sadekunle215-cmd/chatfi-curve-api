import { NextRequest, NextResponse } from "next/server";

// In production use a real DB (Supabase/Postgres)
// For now using in-memory store
const tokenRegistry: Record<string, any> = {};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mint = searchParams.get("mint");
  if (mint) {
    const token = tokenRegistry[mint] || null;
    if (!token) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(token);
  }
  return NextResponse.json(Object.values(tokenRegistry));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mint, creatorWallet, feeBps, name, symbol, imageUrl, description } = body;
    if (!mint || !creatorWallet) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    tokenRegistry[mint] = {
      mint,
      creatorWallet,
      feeBps: feeBps || 100,
      name: name || "",
      symbol: symbol || "",
      imageUrl: imageUrl || "",
      description: description || "",
      createdAt: Date.now(),
    };
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
