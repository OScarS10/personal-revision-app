import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/auth";
import { registerSchema } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const result = await registerUser(parsed.data);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const response = NextResponse.json({
      user: result.user,
      accessToken: result.accessToken,
    });

    // Set refresh token as httpOnly cookie
    response.cookies.set("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}