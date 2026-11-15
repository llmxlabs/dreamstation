import { readDisplayPlaylist } from '@/lib/display-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ displayId: string }> }) {
  try {
    const { displayId } = await params;
    const data = await readDisplayPlaylist(displayId);
    return Response.json(data, {
      status: data ? 200 : 404,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Error fetching player playlist:', error);
    return Response.json({ error: 'Unable to load display playlist' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
