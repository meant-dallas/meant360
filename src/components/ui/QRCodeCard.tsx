'use client';

import { useCallback, useRef } from 'react';
import QRCode from 'react-qr-code';
import { HiOutlineArrowDownTray, HiOutlineClipboard } from 'react-icons/hi2';
import toast from 'react-hot-toast';

interface QRCodeCardProps {
  url: string;
  title: string;
  subtitle?: string;
  size?: number;
}

export default function QRCodeCard({ url, title, subtitle, size = 160 }: QRCodeCardProps) {
  const svgRef = useRef<HTMLDivElement>(null);

  const handleDownload = useCallback(() => {
    const svgElement = svgRef.current?.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = size * scale;
    canvas.height = size * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `${title.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  }, [size, title]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      toast.success('URL copied to clipboard');
    });
  }, [url]);

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{subtitle}</p>}
      <div ref={svgRef} className="flex justify-center mb-3 bg-white p-3 rounded-lg">
        <QRCode value={url} size={size} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          title="Download QR code as PNG"
        >
          <HiOutlineArrowDownTray className="w-3.5 h-3.5" />
          Download
        </button>
        <button
          onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          title="Copy URL to clipboard"
        >
          <HiOutlineClipboard className="w-3.5 h-3.5" />
          Copy URL
        </button>
      </div>
    </div>
  );
}
