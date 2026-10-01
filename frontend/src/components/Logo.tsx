export function Logo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 480" className={`fill-white shrink-0 ${className}`} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M480 240a240 240 0 0 0-240 240 240 240 0 0 0 240-240Z" />
      <path d="M240 0A240 240 0 0 0 0 240 240 240 0 0 0 240 0Z" />
      <path d="M480 240A240 240 0 0 0 240 0a240 240 0 0 0 240 240Z" />
      <path d="M240 480A240 240 0 0 0 0 240a240 240 0 0 0 240 240Z" />
    </svg>
  );
}
