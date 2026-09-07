import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing "url" query parameter' }, { status: 400 });
  }

  // Normalize IP Webcam URL
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `http://${targetUrl}`;
  }

  // Default to snapshot /shot.jpg for reliable CORS canvas reading
  if (!targetUrl.includes('/video') && !targetUrl.includes('/shot.jpg')) {
    targetUrl = targetUrl.replace(/\/+$/, '') + '/shot.jpg';
  }

  const isVideoStream = targetUrl.includes('/video');

  try {
    const controller = new AbortController();
    // Only apply timeout to static snapshot requests, not long-lived video streams
    let timeout: NodeJS.Timeout | null = null;
    if (!isVideoStream) {
      timeout = setTimeout(() => controller.abort(), 5000);
    }

    const response = await fetch(targetUrl, {
      signal: !isVideoStream ? controller.signal : undefined,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Vikrant/1.0',
        Accept: 'image/jpeg, multipart/x-mixed-replace, */*',
      },
      cache: 'no-store',
    });

    if (timeout) clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Phone camera responded with status ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || (isVideoStream ? 'multipart/x-mixed-replace' : 'image/jpeg');

    // For MJPEG streams, stream the ReadableStream body directly without buffering
    if (isVideoStream || contentType.includes('multipart')) {
      return new NextResponse(response.body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Connection: 'keep-alive',
        },
      });
    }

    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to connect to phone IP Camera: ${err.message || 'Connection failed'}` },
      { status: 502 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
