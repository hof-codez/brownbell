interface IconProps {
  className?: string;
}

/** Signature glyph for the Main Award (Brown Bell) - a simple line-drawn bell. */
export function BellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3.5c-3.3 0-5.5 2.4-5.5 6v3.2c0 .6-.2 1.2-.6 1.7l-1.1 1.4c-.5.6-.1 1.6.7 1.6h13c.8 0 1.2-1 .7-1.6l-1.1-1.4c-.4-.5-.6-1.1-.6-1.7V9.5c0-3.6-2.2-6-5.5-6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M10 19.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Signature glyph for the Next Up Award - an ascending sprout, standing in for emerging talent. */
export function SproutIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 20.5V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M12 11c0-3 2-5 5.5-5C17.5 9.5 15 11 12 11Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M12 14c0-2.5-1.7-4.2-4.5-4.2C7.5 12.8 9.4 14 12 14Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Signature glyph for Season of Boom (IDP duos) - a simple line-drawn lightning bolt. */
export function BoltIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M13 3 5 13.5h5.5L11 21l8-10.5h-5.5L13 3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
