import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

function joinClassNames(...values) {
  return values.filter(Boolean).join(' ');
}

export default function InfoSlidePanel({
  open,
  onClose,
  header,
  children,
  panelWidthClassName = 'max-w-md',
  zIndexClassName = 'z-40',
  panelClassName = '',
  panelStyle,
  overlayClassName = '',
  contentClassName = 'p-5 space-y-4',
  headerClassName = 'sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4',
  headerStyle,
  closeButtonClassName = 'text-gray-400 hover:text-red-500',
  closeButtonStyle,
  closeButtonSize = 22,
  closeButtonLabel = 'Close info panel',
}) {
  if (!open || typeof document === 'undefined') {
    return null;
  }

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  return createPortal(
    <div className={joinClassNames('fixed inset-0 m-0 p-0', zIndexClassName)}>
      <button
        type="button"
        aria-label={closeButtonLabel}
        className={joinClassNames(
          'absolute inset-0 m-0 border-0 bg-black bg-opacity-50 p-0 backdrop-blur-sm',
          overlayClassName,
        )}
        onClick={handleClose}
      />

      <aside
        className={joinClassNames(
          'absolute right-0 top-0 h-full w-full overflow-y-auto border-l bg-white shadow-2xl',
          panelWidthClassName,
          panelClassName,
        )}
        style={{ animation: 'adminInfoSlideIn 0.25s ease-out', ...panelStyle }}
      >
        <div className={headerClassName} style={headerStyle}>
          <div className="min-w-0 flex-1">{header}</div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={closeButtonLabel}
            className={closeButtonClassName}
            style={closeButtonStyle}
          >
            <X size={closeButtonSize} />
          </button>
        </div>

        <div className={contentClassName}>{children}</div>
      </aside>

      <style>{`
        @keyframes adminInfoSlideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
