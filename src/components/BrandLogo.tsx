import React, { useState } from 'react';
import brandEmblemUrl from '../assets/images/repoforge_brand_emblem_1794613955556.jpg';

interface BrandLogoProps {
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  size?: 'sm' | 'md';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ onClick, size = 'md' }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const boxClass = size === 'sm' ? 'w-7 h-7 rounded-lg' : 'w-8 h-8 rounded-lg';

  return (
    <a
      href="/"
      onClick={onClick}
      className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 group focus:outline-none"
    >
      <span
        className={`${boxClass} relative inline-flex items-center justify-center overflow-hidden border border-orange-200/80 dark:border-slate-700 bg-white shadow-xs shrink-0`}
      >
        {!imgFailed ? (
          <img
            src={brandEmblemUrl}
            alt="RepoForge Studio Logo"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover scale-110"
          />
        ) : (
          <svg
            viewBox="0 0 36 36"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6"
            aria-hidden="true"
          >
            <path d="M18 3L31 10.5V25.5L18 33L5 25.5V10.5L18 3Z" fill="#F97316" />
            <path d="M18 3L31 10.5L18 18L5 10.5L18 3Z" fill="#F59E0B" />
            <path d="M18 18L31 10.5V25.5L18 33V18Z" fill="#06B6D4" />
            <circle cx="14" cy="15" r="2.3" fill="#FFFFFF" />
            <circle cx="22" cy="13" r="2.3" fill="#FFFFFF" />
            <circle cx="18" cy="24" r="2.3" fill="#FFFFFF" />
            <path
              d="M14 15V19.5C14 21.5 18 21.5 18 24M22 13V18C22 20.5 18 21 18 24"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </span>

      <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
        RepoForge{' '}
        <span className="text-orange-600 dark:text-orange-400">Studio</span>
      </span>
    </a>
  );
};
