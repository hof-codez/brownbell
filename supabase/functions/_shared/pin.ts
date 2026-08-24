// _shared/pin.ts
// PIN hashing via PBKDF2 (Web Crypto - built into Deno, no external library
// needed). 100,000 iterations, SHA-256, 16-byte random salt per PIN. Stored
// as "saltHex:hashHex" in team_claims.pin_hash - never the raw PIN, ever.

const ITERATIONS = 100_000;

async function deriveBits(pin: string, salt: Uint8Array): Promise<Uint8Array> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        256
    );
    return new Uint8Array(bits);
}

function bufToHex(buf: Uint8Array): string {
    return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

export async function hashPin(pin: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await deriveBits(pin, salt);
    return `${bufToHex(salt)}:${bufToHex(hash)}`;
}

// Constant-time-ish comparison isn't achievable with simple === on strings in
// JS, but the hash itself (not the PIN) is what's being compared here, and an
// attacker who can already read stored hashes has bigger problems - this is a
// reasonable tradeoff for a 12-person friend league, not a bank.
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
    const [saltHex, hashHex] = storedHash.split(':');
    if (!saltHex || !hashHex) return false;
    const salt = hexToBuf(saltHex);
    const computed = await deriveBits(pin, salt);
    return bufToHex(computed) === hashHex;
}
