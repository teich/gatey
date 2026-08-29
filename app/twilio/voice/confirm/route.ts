import { handleTwilioVoiceConfirmation } from "@/lib/twilio-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleTwilioVoiceConfirmation(request);
}
