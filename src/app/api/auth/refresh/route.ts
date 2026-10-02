import { NextRequest, NextResponse } from "next/server";
import { verifyAndRotateRefreshToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get("refreshToken")?.value;

    if (!refreshToken) {
      return NextResponse.json({ error: "No refresh token" }, { status: 401 });
    }

    const userAgent = request.headers.get("user-agent") ?? undefined;
    const ipAddress = request.headers.get("x-forwarded-for") ?? undefined;

    const result = await verifyAndRotateRefreshToken(refreshToken, userAgent, ipAddress);

    if (!result) {
      const response = NextResponse.json({ error: "Invalid refresh token" }, { status: 401 });
      response.cookies.delete("refreshToken");
      return response;
    }

    const response = NextResponse.json({
      user: result.user,
      accessToken: result.accessToken,
    });

    response.cookies.set("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Token refresh error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}