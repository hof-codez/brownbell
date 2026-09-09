import type { PlayerNewsItem } from '../types';

// Wire-service and syndicated content frequently gets republished
// verbatim by multiple outlets under the identical headline (e.g. the
// same AP/wire piece appearing from both Yahoo Sports and a team-specific
// site) - keeps only the first occurrence of each normalized headline.
// Normalizes case and collapses whitespace so trivial formatting
// differences don't defeat the match, but does not touch punctuation -
// two headlines are only treated as duplicates when they're genuinely
// the same words, not just similar.
//
// Assumes the input is already sorted (newest first, as every query in
// this app already is), so "first occurrence kept" naturally means "the
// most recently published copy is the one shown."
export function dedupeNewsByHeadline(items: PlayerNewsItem[]): PlayerNewsItem[] {
    const seen = new Set<string>();
    const result: PlayerNewsItem[] = [];

    for (const item of items) {
        const key = item.headline.trim().toLowerCase().replace(/\s+/g, ' ');
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(item);
    }

    return result;
}
