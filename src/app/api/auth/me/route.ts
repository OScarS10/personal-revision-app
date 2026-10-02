import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, getUserById } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ user: null });
    }

    const sessionUser = await verifyAccessToken(token);
    if (!sessionUser) {
      return NextResponse.json({ user: null });
    }

    const user = await getUserById(sessionUser.id);
    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Me endpoint error:", error);
    return NextResponse.json({ user: null });
  }
}