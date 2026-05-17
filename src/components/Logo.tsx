/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAppStore } from '../store/useAppStore';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
  className?: string;
}

export default function Logo({ size = 'medium', showText = true, className = '' }: LogoProps) {
  const { appearance } = useAppStore();
  const sizes = {
    small: 'h-8',
    medium: 'h-12',
    large: 'h-24'
  };

  const [hasError, setHasError] = React.useState(false);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`${sizes[size]} aspect-square flex items-center justify-center overflow-hidden`}>
        {hasError ? (
          <div className="font-bold text-primary whitespace-nowrap">{appearance.companyName}</div>
        ) : (
          <img 
            src={appearance.logoUrl} 
            alt={appearance.companyName} 
            className="h-full w-full object-contain"
            onError={() => setHasError(true)}
            referrerPolicy="no-referrer"
          />
        )}
      </div>
      {showText && !hasError && (
        <div className="flex flex-col leading-none">
          <span className={`font-black text-slate-800 tracking-tight ${size === 'small' ? 'text-sm' : size === 'medium' ? 'text-lg' : 'text-2xl'}`}>
            {appearance.companyName.split(' ')[0]} {appearance.companyName.split(' ')[1] || ''}
          </span>
          <span className={`font-bold text-primary uppercase tracking-[0.3em] ${size === 'small' ? 'text-[8px]' : size === 'medium' ? 'text-[10px]' : 'text-xs'}`}>
            {appearance.systemName}
          </span>
        </div>
      )}
    </div>
  );
}
