// 한솥밥 로고: 밥공기에 고봉밥(🍚). 정적 시안(public/prototype)·3D(scene3d) 헤더와 같은 그림
export function BrandLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" role="img" aria-label="한솥밥 로고" className={`block flex-none ${className}`}>
      <path d="M8 21c0-8.6 5.4-14.5 12-14.5S32 12.4 32 21z" fill="#fff" stroke="#b9c2ce" strokeWidth="1.3" strokeLinejoin="round" />
      <g fill="#d3d9e1">
        <ellipse cx="15" cy="14.5" rx="1.1" ry=".7" transform="rotate(-30 15 14.5)" />
        <ellipse cx="20.5" cy="11.2" rx="1.1" ry=".7" transform="rotate(20 20.5 11.2)" />
        <ellipse cx="25" cy="15.5" rx="1.1" ry=".7" transform="rotate(35 25 15.5)" />
        <ellipse cx="19" cy="17.6" rx="1.1" ry=".7" transform="rotate(-10 19 17.6)" />
        <ellipse cx="12.2" cy="19" rx="1.1" ry=".7" transform="rotate(15 12.2 19)" />
        <ellipse cx="27.8" cy="19.4" rx="1.1" ry=".7" transform="rotate(-20 27.8 19.4)" />
      </g>
      <path d="M4.5 20.5h31c0 8.2-6.9 13.5-15.5 13.5S4.5 28.7 4.5 20.5z" fill="#2457c5" />
      <path d="M4.5 20.5h31" stroke="#4f7ee0" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14.5 33.2h11l-1 3h-9z" fill="#1b3f91" />
    </svg>
  );
}
