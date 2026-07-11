import { NextResponse } from "next/server";

/**
 * GET /api/config
 *
 * Returns non-sensitive environment configuration for the frontend.
 * Used by the Sidebar to hide dev-only features in production.
 */
export async function GET() {
  return NextResponse.json({
    isProduction:
      process.env.NODE_ENV === "production" ||
      process.env.APP_ENV === "production",
  });
}
