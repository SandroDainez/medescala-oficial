import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes } from "react";

type TapSafeButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * Distância (px) que o dedo/mouse pode se mover antes de considerarmos como scroll/arrasto.
   * Se não for informado, o componente usa um padrão adaptativo:
   * - touch: 24px (mais tolerante)
   * - mouse/pen: 10px
   */
  moveThresholdPx?: number;
};

/**
 * Evita “clique fantasma” no mobile: ao rolar a lista, um touchend pode disparar onClick.
 * Este botão só executa onClick se o ponteiro não tiver se movido além do limiar.
 */
export const TapSafeButton = forwardRef<HTMLButtonElement, TapSafeButtonProps>(
  ({ onClick, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, moveThresholdPx, ...props }, ref) => {
    const startRef = useRef<{ x: number; y: number } | null>(null);
    const movedRef = useRef(false);
    const pointerTypeRef = useRef<string | null>(null);
    const cleanupScrollListenerRef = useRef<(() => void) | null>(null);

    useEffect(() => {
      return () => {
        cleanupScrollListenerRef.current?.();
        cleanupScrollListenerRef.current = null;
      };
    }, []);

    const attachScrollGuard = () => {
      // Se já existe, limpa antes de reanexar
      cleanupScrollListenerRef.current?.();
      const onAnyScroll = () => {
        // Qualquer rolagem (inclusive dentro de containers) invalida o clique.
        movedRef.current = true;
      };
      // scroll não “bubbling”, mas pode ser capturado
      document.addEventListener("scroll", onAnyScroll, { capture: true, passive: true });
      cleanupScrollListenerRef.current = () => {
        document.removeEventListener("scroll", onAnyScroll, { capture: true } as any);
      };
    };

    const detachScrollGuard = () => {
      cleanupScrollListenerRef.current?.();
      cleanupScrollListenerRef.current = null;
    };

    return (
      <button
        ref={ref}
        {...props}
        onPointerDown={(e) => {
          movedRef.current = false;
          startRef.current = { x: e.clientX, y: e.clientY };

          // Qualquer scroll durante o gesto invalida o clique (cobre casos onde pointermove não chega).
          attachScrollGuard();

          // Importante no mobile: garante que continuaremos recebendo pointermove
          // mesmo quando o browser inicia scroll e o dedo "passa" por outros itens.
          pointerTypeRef.current = (e as any).pointerType ?? null;
          try {
            // Nem todos os browsers permitem em todos os cenários; por isso o try/catch.
            (e.currentTarget as any).setPointerCapture?.(e.pointerId);
          } catch {
            // ignore
          }

          onPointerDown?.(e);
        }}
        onPointerMove={(e) => {
          if (!startRef.current) {
            onPointerMove?.(e);
            return;
          }

          const isTouch = pointerTypeRef.current === "touch";
          const threshold = moveThresholdPx ?? (isTouch ? 24 : 10);

          const dx = Math.abs(e.clientX - startRef.current.x);
          const dy = Math.abs(e.clientY - startRef.current.y);
          if (dx > threshold || dy > threshold) {
            movedRef.current = true;
          }
          onPointerMove?.(e);
        }}
        onPointerUp={(e) => {
          detachScrollGuard();
          onPointerUp?.(e);
        }}
        onPointerCancel={(e) => {
          // Qualquer cancelamento de ponteiro (muito comum durante scroll) invalida o clique.
          movedRef.current = true;
          detachScrollGuard();
          onPointerCancel?.(e);
        }}
        onClick={(e) => {
          detachScrollGuard();
          // Se o usuário estava rolando/arrastando, não considera como clique.
          if (movedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          onClick?.(e);
        }}
      />
    );
  }
);

TapSafeButton.displayName = "TapSafeButton";
