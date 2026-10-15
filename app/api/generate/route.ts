import { NextResponse } from 'next/server';
import { generateRandomString, tryRegisterAddress, isUsernameAvailable, getAvailableDomains, Inbox } from '@/lib/emailStore';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { customUsername, domain } = body;

        // Validate domain against the admin-managed domain list (DB-backed)
        const domains = getAvailableDomains();
        const selectedDomain = domain && domains.includes(domain)
            ? domain
            : domains[0];

        let inbox: Inbox | null = null;
        let isCustom = false;
        let email = '';

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

            email = `${sanitized}@${selectedDomain}`;
            isCustom = true;

            // Atomic create-or-fail: a concurrent request for the same name
            // gets a clean 409 instead of silently overwriting the inbox.
            inbox = tryRegisterAddress(email, true, selectedDomain);
            if (!inbox) {
                return NextResponse.json(
                    { success: false, error: 'Username is already taken' },
                    { status: 409 }
                );
            }
        } else {
            // Generate a random username, retrying on (extremely unlikely) collision.
            // tryRegisterAddress is atomic, so a collision can never hijack
            // someone else's active inbox.
            for (let attempt = 0; attempt < 10 && !inbox; attempt++) {
                const username = generateRandomString(10);
                email = `${username}@${selectedDomain}`;
                inbox = tryRegisterAddress(email, false, selectedDomain);
            }

            if (!inbox) {
                return NextResponse.json(
                    { success: false, error: 'Failed to generate a unique address, please try again' },
                    { status: 500 }
                );
            }
        }

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

        const domainParam = searchParams.get('domain');
        const domains = getAvailableDomains();
        const domain = domainParam && domains.includes(domainParam)
            ? domainParam
            : domains[0];
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
