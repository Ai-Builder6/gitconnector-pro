import React, { useState } from 'react';
import { Check, Download, Image as ImageIcon, Sparkles, X } from 'lucide-react';
import brandEmblemUrl from '../assets/images/repoforge_brand_emblem_1794613955556.jpg';

interface BrandLogoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const VECTOR_EMBLEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="14" fill="#FFFFFF"/>
  <path d="M32 6L55 19.2V44.8L32 58L9 44.8V19.2L32 6Z" fill="#F97316"/>
  <path d="M32 6L55 19.2L32 32L9 19.2L32 6Z" fill="#F59E0B"/>
  <path d="M32 32L55 19.2V44.8L32 58V32Z" fill="#06B6D4"/>
  <path d="M9 44.8L32 32V58L9 44.8Z" fill="#EA580C"/>
  <circle cx="24" cy="26" r="4" fill="#FFFFFF"/>
  <circle cx="40" cy="22" r="4" fill="#FFFFFF"/>
  <circle cx="32" cy="43" r="4" fill="#FFFFFF"/>
  <path d="M24 26V34C24 37.8 32 38 32 43M40 22V31.5C40 36 32 37.2 32 43" stroke="#FFFFFF" stroke-width="3.6" stroke-linecap="round"/>
</svg>`;

function buildHorizontalLockupSvg(variant: 'light' | 'dark'): string {
  const bg = variant === 'light' ? '#FFFFFF' : '#0B0F17';
  const primaryText = variant === 'light' ? '#0F172A' : '#F8FAFC';
  const accentText = variant === 'light' ? '#EA580C' : '#FB923C';
  const borderStroke = variant === 'light' ? '#E2E8F0' : '#1E293B';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160" viewBox="0 0 640 160" fill="none">
  <rect x="2" y="2" width="636" height="156" rx="24" fill="${bg}" stroke="${borderStroke}" stroke-width="4"/>
  <g transform="translate(36, 28) scale(1.625)">
    <path d="M32 6L55 19.2V44.8L32 58L9 44.8V19.2L32 6Z" fill="#F97316"/>
    <path d="M32 6L55 19.2L32 32L9 19.2L32 6Z" fill="#F59E0B"/>
    <path d="M32 32L55 19.2V44.8L32 58V32Z" fill="#06B6D4"/>
    <path d="M9 44.8L32 32V58L9 44.8Z" fill="#EA580C"/>
    <circle cx="24" cy="26" r="4" fill="#FFFFFF"/>
    <circle cx="40" cy="22" r="4" fill="#FFFFFF"/>
    <circle cx="32" cy="43" r="4" fill="#FFFFFF"/>
    <path d="M24 26V34C24 37.8 32 38 32 43M40 22V31.5C40 36 32 37.2 32 43" stroke="#FFFFFF" stroke-width="3.6" stroke-linecap="round"/>
  </g>
  <text x="164" y="95" font-family="'Plus Jakarta Sans', system-ui, -apple-system, sans-serif" font-size="46" font-weight="800" letter-spacing="-0.8" fill="${primaryText}">
    RepoForge <tspan fill="${accentText}">Studio</tspan>
  </text>
</svg>`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const BrandLogoModal: React.FC<BrandLogoModalProps> = ({ isOpen, onClose }) => {
  const [downloadedKey, setDownloadedKey] = useState<string | null>(null);
  const [renderingPng, setRenderingPng] = useState(false);
  const [previewImgFailed, setPreviewImgFailed] = useState(false);

  if (!isOpen) return null;

  const markDownloaded = (key: string) => {
    setDownloadedKey(key);
    setTimeout(() => {
      setDownloadedKey((prev) => (prev === key ? null : prev));
    }, 2200);
  };

  const handleDownloadSvg = (svgContent: string, filename: string, key: string) => {
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    triggerBlobDownload(blob, filename);
    markDownloaded(key);
  };

  const handleDownloadHighResPng = async () => {
    setRenderingPng(true);
    try {
      const size = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const drawFromUrl = (src: string): Promise<void> =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, 0, 0, size, size);
            resolve();
          };
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = src;
        });

      try {
        await drawFromUrl(brandEmblemUrl);
      } catch {
        const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(VECTOR_EMBLEM_SVG)}`;
        await drawFromUrl(svgDataUrl);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          triggerBlobDownload(blob, 'repoforge-studio-logo-1024.png');
          markDownloaded('png-1024');
        }
        setRenderingPng(false);
      }, 'image/png');
    } catch {
      setRenderingPng(false);
    }
  };

  const handleDirectAssetDownload = async (assetUrl: string, filename: string, key: string) => {
    try {
      const res = await fetch(assetUrl);
      const blob = await res.blob();
      triggerBlobDownload(blob, filename);
      markDownloaded(key);
    } catch {
      const a = document.createElement('a');
      a.href = assetUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      markDownloaded(key);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="brand-logo-modal-title"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-orange-500" />
            <h2
              id="brand-logo-modal-title"
              className="text-base font-bold text-slate-900 dark:text-white"
            >
              Download RepoForge Studio Brand Logo &amp; Icon Kit
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close logo download modal"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Visual Previews on Light & Dark Surfaces */}
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl overflow-hidden border border-orange-200 bg-white shrink-0 flex items-center justify-center shadow-2xs">
                {!previewImgFailed ? (
                  <img
                    src={brandEmblemUrl}
                    alt="RepoForge Studio Emblem Light Preview"
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewImgFailed(true)}
                    className="w-full h-full object-cover scale-105"
                  />
                ) : (
                  <ImageIcon className="w-6 h-6 text-orange-500" />
                )}
              </div>
              <div>
                <div className="text-base font-extrabold tracking-tight text-slate-900">
                  RepoForge <span className="text-orange-600">Studio</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Bright Surface Lockup</div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-700 bg-slate-900 shrink-0 flex items-center justify-center">
                {!previewImgFailed ? (
                  <img
                    src={brandEmblemUrl}
                    alt="RepoForge Studio Emblem Dark Preview"
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewImgFailed(true)}
                    className="w-full h-full object-cover scale-105"
                  />
                ) : (
                  <ImageIcon className="w-6 h-6 text-orange-400" />
                )}
              </div>
              <div>
                <div className="text-base font-extrabold tracking-tight text-white">
                  RepoForge <span className="text-orange-400">Studio</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">Dark Surface Lockup</div>
              </div>
            </div>
          </div>

          {/* Download Options List */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 flex items-center justify-between gap-4 bg-white dark:bg-[#111827]">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  High-Resolution PNG Emblem (1024 × 1024)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Crisp rasterized PNG mark ideal for app stores, README headers, and social cards
                </div>
              </div>
              <button
                type="button"
                disabled={renderingPng}
                onClick={() => void handleDownloadHighResPng()}
                className="h-9 px-3.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                {downloadedKey === 'png-1024' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Downloaded</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>{renderingPng ? 'Rendering...' : 'Download .PNG'}</span>
                  </>
                )}
              </button>
            </div>

            <div className="px-4 py-3.5 flex items-center justify-between gap-4 bg-white dark:bg-[#111827]">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Scalable Vector Brand Emblem (.SVG)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Infinite-resolution geometric prism &amp; Git branch icon mark
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleDownloadSvg(VECTOR_EMBLEM_SVG, 'repoforge-studio-emblem.svg', 'svg-emblem')
                }
                className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                {downloadedKey === 'svg-emblem' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Downloaded</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span>Download .SVG</span>
                  </>
                )}
              </button>
            </div>

            <div className="px-4 py-3.5 flex items-center justify-between gap-4 bg-white dark:bg-[#111827]">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Full Wordmark Lockups — Bright &amp; Dark (.SVG)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Horizontal emblem + RepoForge Studio wordmark banners
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadSvg(
                      buildHorizontalLockupSvg('light'),
                      'repoforge-studio-lockup-light.svg',
                      'svg-light'
                    )
                  }
                  className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  {downloadedKey === 'svg-light' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-orange-500" />
                  )}
                  <span>Bright .SVG</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadSvg(
                      buildHorizontalLockupSvg('dark'),
                      'repoforge-studio-lockup-dark.svg',
                      'svg-dark'
                    )
                  }
                  className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  {downloadedKey === 'svg-dark' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  )}
                  <span>Dark .SVG</span>
                </button>
              </div>
            </div>

            <div className="px-4 py-3.5 flex items-center justify-between gap-4 bg-white dark:bg-[#111827]">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Original Studio Artwork (.JPG) &amp; App Favicon (.ICO)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Download original brand artwork image or browser favicon asset
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    void handleDirectAssetDownload(
                      brandEmblemUrl,
                      'repoforge-brand-emblem.jpg',
                      'raw-jpg'
                    )
                  }
                  className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  {downloadedKey === 'raw-jpg' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-orange-500" />
                  )}
                  <span>Artwork .JPG</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleDirectAssetDownload('/favicon.ico', 'favicon.ico', 'favicon-ico')
                  }
                  className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  {downloadedKey === 'favicon-ico' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  )}
                  <span>Favicon .ICO</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
