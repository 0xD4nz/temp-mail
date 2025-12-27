import { NextResponse } from 'next/server';
import { generateRandomString, registerAddress, isUsernameAvailable, getAvailableDomains, AVAILABLE_DOMAINS } from '@/lib/emailStore';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { customUsername, domain } = body;

        // Validate domain
        const selectedDomain = domain && AVAILABLE_DOMAINS.includes(domain)
            ? domain
            : AVAILABLE_DOMAINS[0];

        let username: string;
        let isCustom = false;

        if (customUsername) {
            // Validate custom username
            const sanitized = customUsername.toLowerCase().replace(/[^a-z0-9._-]/g, '');

            if (sanitized.length < 3) {
                return NextResponse.json(
                    { success: false, error: 'Username must be at least 3 characters' },
                    { status: 400 }
                );
            }

            if (sanitized.length > 30) {
                return NextResponse.json(
                    { success: false, error: 'Username must be less than 30 characters' },
                    { status: 400 }
                );
            }

            // Check availability
            if (!isUsernameAvailable(sanitized, selectedDomain)) {
                return NextResponse.json(
                    { success: false, error: 'Username is already taken' },
                    { status: 409 }
                );
            }

            username = sanitized;
            isCustom = true;
        } else {
            // Generate random username
            username = generateRandomString(10);
        }

        const email = `${username}@${selectedDomain}`;

        // Register the address
        const inbox = registerAddress(email, isCustom, selectedDomain);

        return NextResponse.json({
            success: true,
            email,
            domain: selectedDomain,
            expiresIn: 3600, // 1 hour in seconds
            expiresAt: inbox.expiresAt,
            maxExpiresAt: inbox.maxExpiresAt,
            isCustom,
        });
    } catch (error) {
        console.error('Error generating email:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to generate email' },
            { status: 500 }
        );
    }
}

// Check username availability or get available domains
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const username = searchParams.get('check');
        const getDomains = searchParams.get('domains') === 'true';

        // Return available domains
        if (getDomains) {
            return NextResponse.json({
                success: true,
                domains: getAvailableDomains(),
            });
        }

        // Check username availability
        if (!username) {
            return NextResponse.json(
                { success: false, error: 'Username or domains param required' },
                { status: 400 }
            );
        }

        const domain = searchParams.get('domain') || AVAILABLE_DOMAINS[0];
        const sanitized = username.toLowerCase().replace(/[^a-z0-9._-]/g, '');
        const available = isUsernameAvailable(sanitized, domain);

        return NextResponse.json({
            success: true,
            username: sanitized,
            domain,
            available,
        });
    } catch (error) {
        console.error('Error checking username:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to check username' },
            { status: 500 }
        );
    }
}
