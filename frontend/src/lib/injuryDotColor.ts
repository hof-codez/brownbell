// Yellow -> orange -> red as severity increases. Out/IR/PUP share the same
// dot color (all mean "not playing"); Questionable/Doubtful are distinct
// shades since they're genuinely different levels of real uncertainty.
// Shared between DuoSlotDisplay (a team's current pick) and DuoPickerModal
// (warning on an otherwise-eligible but injured candidate), so the same
// status always reads the same color everywhere in the app.
export const INJURY_DOT_COLOR: Record<string, string> = {
    Questionable: 'bg-yellow-500',
    Doubtful: 'bg-orange-500',
    Out: 'bg-brick',
    IR: 'bg-brick',
    PUP: 'bg-brick'
};
