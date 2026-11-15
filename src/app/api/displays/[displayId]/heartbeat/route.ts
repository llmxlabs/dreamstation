import { recordDisplayHeartbeat } from '@/lib/display-sync';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ displayId: string }> }) {
  let input;
  try { input = await request.json(); } catch { return Response.json({ success: false }, { status: 400 }); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return Response.json({ success: false }, { status: 400 });
  const { displayId } = await params;
  const result = await recordDisplayHeartbeat(displayId, input.battery, input.network);
  return Response.json(result, { status: result.success ? 200 : 400, headers: { 'Cache-Control': 'no-store' } });
}
