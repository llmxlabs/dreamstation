import prisma from '@/lib/prisma';
import { createDisplayEventStream } from '@/lib/display-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ displayId: string }> }) {
  const { displayId } = await params;
  const display = await prisma.display.findUnique({
    where: { id: displayId, userId: '00000000-0000-0000-0000-000000000000' }, select: { id: true },
  });
  if (!display) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(createDisplayEventStream(request.signal), {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
