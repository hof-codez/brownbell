// substitution-reasons.js
// The one definition of which substitutions.reason values mean a slot's
// occupant is genuinely a stand-in. Every substitutions row is logged the
// same way - an initial pick, a pre-lock change, and an original
// reclaiming his own slot all leave an active row naming the current
// occupant as "substitute_name" - so the reason text is the only thing
// that tells a real sub apart from those.
//
// Previously each reader kept its own copy of this list, and they drifted:
// a new revert reason ("original played") was filtered in one place but
// not where scores are saved, so Showdown showed an original pick (Puka
// Nacua) as "Auto-sub for Jaxon Smith-Njigba" after he reclaimed his own
// slot. Add any new non-substitution reason HERE, not at a call site.

const NOT_A_SUBSTITUTE_REASONS = new Set(['Owner set pick', 'Owner changed pick before lock']);

// Every revert writes a reason starting with this - healthy again, the
// new-week reset, and the original playing - so a prefix covers any
// future revert reason too.
const REVERT_REASON_PREFIX = 'Reverted to original player';

function isRealSubstitutionReason(reason) {
    if (NOT_A_SUBSTITUTE_REASONS.has(reason)) return false;
    if (reason?.startsWith(REVERT_REASON_PREFIX)) return false;
    return true;
}

module.exports = { isRealSubstitutionReason, REVERT_REASON_PREFIX };
