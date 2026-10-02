import { NextRequest, NextResponse } from "next/server";
import { resetPassword } from "@/lib/auth";
import { resetPasswordSchema } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const result = await resetPassword(parsed.data);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Password reset error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}