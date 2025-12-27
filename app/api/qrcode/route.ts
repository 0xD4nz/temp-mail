import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';

// GET /api/qrcode?email=xxx - Generate QR code for email address
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const email = searchParams.get('email');
        const format = searchParams.get('format') || 'dataurl'; // dataurl or svg

        if (!email) {
            return NextResponse.json(
                { success: false, error: 'Email address required' },
                { status: 400 }
            );
        }

        // Generate QR code content (mailto link)
        const content = `mailto:${email}`;

        if (format === 'svg') {
            const svg = await QRCode.toString(content, {
                type: 'svg',
                width: 200,
                margin: 2,
                color: {
                    dark: '#6366f1',
                    light: '#0a0a1a',
                },
            });

            return new NextResponse(svg, {
                headers: {
                    'Content-Type': 'image/svg+xml',
                },
            });
        }

        // Default: return data URL
        const dataUrl = await QRCode.toDataURL(content, {
            width: 200,
            margin: 2,
            color: {
                dark: '#6366f1',
                light: '#0a0a1a',
            },
        });

        return NextResponse.json({
            success: true,
            email,
            qrcode: dataUrl,
        });
    } catch (error) {
        console.error('Error generating QR code:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to generate QR code' },
            { status: 500 }
        );
    }
}
