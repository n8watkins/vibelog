/** Small line icons (24px grid, 1.75 stroke), decorative: always aria-hidden. */
type P = { className?: string };
const base = (className = "size-5") => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconTerminal = ({ className }: P) => (
  <svg {...base(className)}><path d="m5 8 4 4-4 4" /><path d="M12 17h7" /><rect x="2.5" y="3.5" width="19" height="17" rx="2.5" /></svg>
);
export const IconBroadcast = ({ className }: P) => (
  <svg {...base(className)}><circle cx="12" cy="12" r="2" /><path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></svg>
);
export const IconUsers = ({ className }: P) => (
  <svg {...base(className)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6" /></svg>
);
export const IconSpark = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>
);
export const IconEye = ({ className }: P) => (
  <svg {...base(className)}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const IconLock = ({ className }: P) => (
  <svg {...base(className)}><rect x="4" y="10.5" width="16" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
);
export const IconShield = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const IconLaptop = ({ className }: P) => (
  <svg {...base(className)}><rect x="4" y="4.5" width="16" height="11" rx="1.5" /><path d="M2 19.5h20" /></svg>
);
export const IconMonitor = ({ className }: P) => (
  <svg {...base(className)}><rect x="2.5" y="3.5" width="19" height="13" rx="2" /><path d="M8 20.5h8M12 16.5v4" /></svg>
);
export const IconGlobe = ({ className }: P) => (
  <svg {...base(className)}><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c2.6 2.8 3.9 6 3.9 9.5S14.6 18.7 12 21.5C9.4 18.7 8.1 15.5 8.1 12S9.4 5.3 12 2.5Z" /></svg>
);
export const IconChart = ({ className }: P) => (
  <svg {...base(className)}><path d="M3.5 20.5h17" /><path d="M7 16.5v-5M12 16.5v-9M17 16.5V10" /></svg>
);
export const IconCard = ({ className }: P) => (
  <svg {...base(className)}><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M6.5 15h6M6.5 11.5h3" /><circle cx="16.5" cy="11.5" r="2" /></svg>
);
export const IconCheck = ({ className }: P) => (
  <svg {...base(className)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IconClock = ({ className }: P) => (
  <svg {...base(className)}><circle cx="12" cy="12" r="9.5" /><path d="M12 7v5l3 2" /></svg>
);
export const IconRoute = ({ className }: P) => (
  <svg {...base(className)}><circle cx="6" cy="18.5" r="2.5" /><circle cx="18" cy="5.5" r="2.5" /><path d="M8.5 18.5h7a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7h7" /></svg>
);
