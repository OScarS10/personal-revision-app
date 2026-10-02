import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/auth";
import { loginSchema } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const userAgent = request.headers.get("user-agent") ?? undefined;
    const ipAddress = request.headers.get("x-forwarded-for") ?? undefined;

    const result = await loginUser(parsed.data, userAgent, ipAddress);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 401 });
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
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}