import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, revokeAllSessions } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (token) {
      const user = await verifyAccessToken(token);
      if (user) {
        await revokeAllSessions(user.id);
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete("refreshToken");
    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}