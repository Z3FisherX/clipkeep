export function Icon({ name, size = 20 }: { name: 'download' | 'folder' | 'play' | 'audio' | 'both' | 'arrow' | 'check' | 'shield' | 'link' | 'layers'; size?: number }) {
  const paths = {
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" /></>,
    folder: <path d="M3 6h7l2 2h9v12H3zM3 6V4h7l2 2" />,
    play: <><rect x="3" y="4" width="18" height="16" rx="4" /><path d="m10 9 5 3-5 3z" /></>,
    audio: <><path d="M5 9v6m4-10v14m4-12v10m4-13v16m4-10v4" /></>,
    both: <><rect x="3" y="3" width="13" height="13" rx="3" /><path d="m8 7 4 3-4 3zM8 20h10a3 3 0 0 0 3-3V8" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    shield: <><path d="m12 3 8 3v5c0 5-8 10-8 10S4 16 4 11V6z" /><path d="m8 11 3 3 5-5" /></>,
    link: <><path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)" /></>,
    layers: <><rect x="6" y="3" width="15" height="15" rx="3" /><path d="M3 8v10a3 3 0 0 0 3 3h10m-4-14v7m-3-3 3 3 3-3" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
