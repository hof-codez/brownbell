interface ClaimStatusBarProps {
    status: 'checking' | 'unclaimed' | 'claimed';
    claimedTeamName: string | null;
    onOpenClaim: () => void;
    onForget: () => void;
}

export function ClaimStatusBar({ status, claimedTeamName, onOpenClaim, onForget }: ClaimStatusBarProps) {
    if (status === 'checking') return null;

    return (
        <div className="flex items-center justify-between border-b border-panel-line bg-panel/60 px-4 py-2 sm:px-6">
            {status === 'claimed' ? (
                <>
                    <p className="font-body text-sm text-chalk-dim">
                        Viewing as <span className="text-chalk">{claimedTeamName}</span>
                    </p>
                    <button onClick={onForget} className="font-mono text-xs uppercase tracking-widest text-bell">
                        Switch team
                    </button>
                </>
            ) : (
                <>
                    <p className="font-body text-sm text-chalk-dim">Not viewing as any team yet</p>
                    <button onClick={onOpenClaim} className="font-mono text-xs uppercase tracking-widest text-bell">
                        Claim your team
                    </button>
                </>
            )}
        </div>
    );
}
