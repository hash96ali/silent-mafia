import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function MoonIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden {...props}>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function CrosshairIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden {...props}>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h4.5v-5.5h4V20h4.5V9.5" />
    </svg>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" />
      <path d="M12 6.5v13" />
    </svg>
  );
}

export function SkullIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2.5c-4.7 0-8.5 3.4-8.5 7.9 0 2.6 1.3 4.6 3.2 5.8v2.3c0 .8.7 1.5 1.5 1.5h.8v-2h1.5v2h3v-2H15v2h.8c.8 0 1.5-.7 1.5-1.5v-2.3c1.9-1.2 3.2-3.2 3.2-5.8 0-4.5-3.8-7.9-8.5-7.9Zm-3.3 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm6.6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM12 13.6l1.1 2.1h-2.2l1.1-2.1Z" />
    </svg>
  );
}

/** Ballot box, for the day vote. */
export function BallotIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M3.5 13.5h17v7h-17z" />
      <path d="M7.5 13.5V4.5h9v9" />
      <path d="m9.5 9 1.8 1.8 3.5-3.6" />
      <path d="M8 17h8" />
    </svg>
  );
}

export function ScreenIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden {...props}>
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <path d="M8 20.5h8M12 16.5v4" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

/** Faceless figure used for the hidden role card. */
export function SilhouetteIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden {...props}>
      <circle cx="32" cy="22" r="11" />
      <path d="M8 64c1.5-14 11-22 24-22s22.5 8 24 22Z" />
    </svg>
  );
}
