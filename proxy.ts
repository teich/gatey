import { NextResponse, type NextRequest } from "next/server";
import { rejectsCrossOriginMutation } from "@/lib/request-origin";

export function proxy(request: NextRequest) {
  if (rejectsCrossOriginMutation(request)) {
    return NextResponse.json({ error: "Open Gatey to make this change." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
