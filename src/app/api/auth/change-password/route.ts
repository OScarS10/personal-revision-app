import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, changePassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionUser = await verifyAccessToken(token);
    if (!sessionUser) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current password and new password are required" }, { status: 400 });
    }

    const result = await changePassword(sessionUser.id, currentPassword, newPassword);

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Failed to change password" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
