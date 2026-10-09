import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { MagneticItem } from './useMagnetic';
import { gsap, DURATION, CORTEX_EASE } from './motion';

// Global ESC Stack Manager: closes only topmost active surface
type EscHandler = { id: string; priority: number; close: () => void };
const escStack: EscHandler[] = [];

export function registerEscHandler(id: string, priority: number, close: () => void) {
  const existing = escStack.findIndex((item) => item.id === id);
  if (existing >= 0) {
    escStack[existing] = { id, priority, close };
  } else {
    escStack.push({ id, priority, close });
    escStack.sort((a, b) => b.priority - a.priority); // Highest priority first
  }
}

export function unregisterEscHandler(id: string) {
  const idx = escStack.findIndex((item) => item.id === id);
  if (idx >= 0) {
    escStack.splice(idx, 1);
  }
}

// Global keydown listener for Esc
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && escStack.length > 0) {
      // Find the highest priority active panel
      const top = escStack[0];
      if (top) {
        e.preventDefault();
        e.stopPropagation();
        top.close();
      }
    }
  });
}

export interface PanelShellProps {
  id?: string;
  isOpen: boolean;
  onClose?: () => void;
  variant?: 'drawer-right' | 'drawer-left' | 'hud-bottom' | 'modal' | 'floating' | 'custom';
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  ariaLabel?: string;
  testId?: string;
  escPriority?: number; // default: drawer=30, hud=50, modal=100
  as?: 'aside' | 'div' | 'section';
}

export const PanelShell = React.forwardRef<HTMLElement, PanelShellProps>(
  (
    {
      id,
      isOpen,
      onClose,
      variant = 'custom',
      className = '',
      style = {},
      children,
      ariaLabel,
      testId,
      escPriority = 30,
      as: Component = 'aside',
    },
    ref
  ) => {
    const panelIdRef = useRef(id || `panel-${Math.random().toString(36).slice(2, 9)}`);
    const [isMounted, setIsMounted] = useState(isOpen);
    const internalRef = useRef<HTMLElement | null>(null);

    const setNodeRef = (node: HTMLElement | null) => {
      internalRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as any).current = node;
      }
    };

    // Register on Esc stack when open
    useEffect(() => {
      const pid = panelIdRef.current;
      if (isOpen && onClose) {
        registerEscHandler(pid, escPriority, onClose);
      } else {
        unregisterEscHandler(pid);
      }
      return () => {
        unregisterEscHandler(pid);
      };
    }, [isOpen, onClose, escPriority]);

    // Handle smooth mount and unmount with directional memory (L3)
    useEffect(() => {
      const el = internalRef.current;
      if (isOpen) {
        setIsMounted(true);
        if (el) {
          let fromVars: gsap.TweenVars = { opacity: 0 };
          let toVars: gsap.TweenVars = {
            opacity: 1,
            duration: DURATION.STANDARD,
            ease: CORTEX_EASE,
            overwrite: 'auto',
          };
          if (variant === 'drawer-right') {
            fromVars.x = 40;
            toVars.x = 0;
          } else if (variant === 'drawer-left') {
            fromVars.x = -40;
            toVars.x = 0;
          }
          gsap.fromTo(el, fromVars, toVars);
        }
      } else if (el && isMounted) {
        let exitVars: gsap.TweenVars = {
          opacity: 0,
          duration: DURATION.MICRO,
          ease: CORTEX_EASE,
          overwrite: 'auto',
          onComplete: () => setIsMounted(false),
        };
        if (variant === 'drawer-right') {
          exitVars.x = 40;
        } else if (variant === 'drawer-left') {
          exitVars.x = -40;
        }
        gsap.to(el, exitVars);
      } else {
        setIsMounted(false);
      }
    }, [isOpen, isMounted, variant]);

    if (!isMounted && !isOpen) return null;

    // Base styling per variant
    let variantClasses = '';
    switch (variant) {
      case 'drawer-right':
        variantClasses =
          'fixed top-10 right-0 bottom-6 w-[360px] bg-surface border-l border-hairline z-40 flex flex-col shadow-2xl rounded-none select-none pointer-events-auto';
        break;
      case 'drawer-left':
        variantClasses =
          'fixed top-10 left-14 bottom-6 w-60 bg-surface border-r border-hairline z-20 flex flex-col shadow-xl rounded-none select-none pointer-events-auto';
        break;
      case 'hud-bottom':
        variantClasses =
          'fixed bottom-6 left-1/2 -translate-x-1/2 w-[440px] bg-surface border border-hairline shadow-2xl z-30 select-none pointer-events-auto rounded-[2px] flex flex-col';
        break;
      case 'modal':
        variantClasses =
          'fixed inset-0 z-50 flex items-center justify-center bg-black/60 select-auto';
        break;
      case 'floating':
        variantClasses =
          'fixed bg-surface border border-hairline shadow-2xl z-40 rounded-[2px] select-none pointer-events-auto flex flex-col';
        break;
      case 'custom':
      default:
        variantClasses = '';
        break;
    }

    return (
      <Component
        ref={setNodeRef}
        id={id}
        data-testid={testId}
        aria-label={ariaLabel}
        className={`${variantClasses} ${className}`}
        style={style}
      >
        {children}
      </Component>
    );
  }
);
PanelShell.displayName = 'PanelShell';

export interface PanelHeaderProps {
  title: React.ReactNode;
  count?: number | string | null;
  countLabel?: string;
  icon?: React.ReactNode;
  onClose?: () => void;
  closeTitle?: string;
  actions?: React.ReactNode;
  className?: string;
  titleClassName?: string;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  title,
  count,
  countLabel,
  icon,
  onClose,
  closeTitle = 'Close panel',
  actions,
  className = '',
  titleClassName,
}) => {
  return (
    <div
      className={`h-9 px-3 border-b border-hairline flex items-center justify-between shrink-0 bg-surface2/30 ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0 pr-2">
        {icon && <span className="shrink-0 text-muted">{icon}</span>}
        <span
          className={`truncate ${
            titleClassName || 'font-mono text-[10px] text-ink tracking-[0.18em] uppercase font-medium'
          }`}
        >
          {title}
        </span>
        {count !== undefined && count !== null && (
          <span className="font-mono text-[9px] px-1.5 py-0.5 border border-hairline bg-surface text-faint rounded-[2px] shrink-0 uppercase">
            {count} {countLabel || ''}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {actions}
        {onClose && (
          <MagneticItem>
            <button
              type="button"
              onClick={onClose}
              title={closeTitle}
              aria-label={closeTitle}
              className="p-1 text-muted hover:text-ink transition-colors cursor-pointer rounded-[2px]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </MagneticItem>
        )}
      </div>
    </div>
  );
};

export interface PanelSectionProps {
  title?: string;
  count?: number | string;
  className?: string;
  children: React.ReactNode;
}

export const PanelSection: React.FC<PanelSectionProps> = ({
  title,
  count,
  className = '',
  children,
}) => {
  return (
    <div className={`p-3 space-y-2.5 ${className}`}>
      {title && (
        <div className="flex items-center justify-between pb-1 border-b border-hairline/60">
          <span className="font-mono text-[10px] text-muted tracking-[0.18em] uppercase font-medium">
            {title}
          </span>
          {count !== undefined && (
            <span className="font-mono text-[9px] text-faint uppercase">
              {count}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

export interface PanelRowProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  stat?: React.ReactNode;
  onClick?: () => void;
  title?: string;
  active?: boolean;
  className?: string;
}

export const PanelRow: React.FC<PanelRowProps> = ({
  icon,
  label,
  stat,
  onClick,
  title,
  active = false,
  className = '',
}) => {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={`w-full h-7 min-h-[28px] px-2 rounded-[2px] flex items-center justify-between text-left transition-colors ${
        onClick ? 'cursor-pointer hover:bg-surface2/80' : ''
      } ${active ? 'bg-surface2 text-ink shadow-inner' : 'text-muted'} ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0 pr-1">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="font-sans text-[13px] truncate text-ink font-medium">
          {label}
        </span>
      </div>
      {stat && (
        <span className="font-mono text-[11px] text-muted shrink-0">
          {stat}
        </span>
      )}
    </Component>
  );
};

export interface PanelStatProps {
  value: string | number;
  label: string;
  className?: string;
}

export const PanelStat: React.FC<PanelStatProps> = ({ value, label, className = '' }) => {
  return (
    <div className={className}>
      <div className="font-mono text-[20px] text-ink leading-tight font-medium">
        {value}
      </div>
      <div className="font-mono text-[10px] text-muted uppercase tracking-[0.18em] mt-0.5">
        {label}
      </div>
    </div>
  );
};

export interface PanelActionButtonProps {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export const PanelActionButton: React.FC<PanelActionButtonProps> = ({
  icon,
  label,
  onClick,
  disabled = false,
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-surface2/60 border border-hairline hover:border-accent hover:text-accent text-ink font-mono text-[10px] tracking-[0.18em] uppercase transition-colors cursor-pointer rounded-[2px] disabled:opacity-50 ${className}`}
    >
      {icon && <span className="shrink-0 text-accent">{icon}</span>}
      <span>{label}</span>
    </button>
  );
};

export interface PanelEmptyStateProps {
  text?: string;
  className?: string;
}

export const PanelEmptyState: React.FC<PanelEmptyStateProps> = ({
  text = 'nothing here yet',
  className = '',
}) => {
  return (
    <div className={`py-4 text-center font-mono text-[11px] text-faint italic ${className}`}>
      — {text}
    </div>
  );
};
