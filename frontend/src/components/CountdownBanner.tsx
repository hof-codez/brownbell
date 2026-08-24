import { useEffect, useState } from 'react';

function formatRemaining(ms: number): string {
    if (ms <= 0) return 'Locked';
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
}

export function CountdownBanner({ lockTime }: { lockTime: Date | null }) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!lockTime) return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [lockTime]);

    if (!lockTime) return null;

    const remainingMs = lockTime.getTime() - now;
    const locked = remainingMs <= 0;

    return (
        <div className={`border-b border-panel-line px-4 py-2 sm:px-6 ${locked ? 'bg-brick/10' : 'bg-bell/10'}`}>
            <p className="font-body text-sm text-chalk">
                {locked ? (
                    <>First slots have locked - the season is underway.</>
                ) : (
                    <>
                        Picks lock for your earliest player in{' '}
                        <span className="font-mono font-semibold text-bell">{formatRemaining(remainingMs)}</span>
                    </>
                )}
            </p>
        </div>
    );
}
