import { NextRequest, NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/auth";
import { resetRequestSchema } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = resetRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const result = await requestPasswordReset(parsed.data);
    return NextResponse.json({ success: result.success });
  } catch (error) {
    console.error("Password reset request error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}