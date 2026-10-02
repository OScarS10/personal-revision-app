import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, getUserById, updateUserProfile } from "@/lib/auth";

export async function PATCH(request: NextRequest) {
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
    const { name, avatar_url } = body;

    const updates: { name?: string; avatar_url?: string } = {};
    if (name !== undefined) updates.name = String(name).slice(0, 100);
    if (avatar_url !== undefined) updates.avatar_url = String(avatar_url).slice(0, 500);

    const user = await updateUserProfile(sessionUser.id, updates);
    if (!user) {
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Profile update failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
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

    const user = await getUserById(sessionUser.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
