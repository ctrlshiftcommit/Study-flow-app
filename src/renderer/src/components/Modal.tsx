import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function Modal({
  title,
  children,
  onClose,
  critical = false
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  critical?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !critical) onClose();
      if (event.key !== 'Tab' || !ref.current) return;
      const nodes = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((node) => !node.hasAttribute('disabled'));
      if (!nodes.length) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [critical, onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={() => !critical && onClose()}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          {!critical && <button className="button icon-only ghost" onClick={onClose} aria-label="Close"><X size={15} /></button>}
        </div>
        {children}
      </div>
    </div>
  );
}
