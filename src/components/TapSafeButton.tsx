import { forwardRef, useRef, type ButtonHTMLAttributes } from "react";

type TapSafeButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * Distância (px) que o dedo/mouse pode se mover antes de considerarmos como scroll/arrasto.
   * Padrão: 10px.
   */
  moveThresholdPx?: number;
};

/**
 * Evita “clique fantasma” no mobile: ao rolar a lista, um touchend pode disparar onClick.
 * Este botão só executa onClick se o ponteiro não tiver se movido além do limiar.
 */
export const TapSafeButton = forwardRef<HTMLButtonElement, TapSafeButtonProps>(
  ({ onClick, onPointerDown, onPointerMove, onPointerUp, moveThresholdPx = 10, ...props }, ref) => {
    const startRef = useRef<{ x: number; y: number } | null>(null);
    const movedRef = useRef(false);

    return (
      <button
        ref={ref}
        {...props}
        onPointerDown={(e) => {
          movedRef.current = false;
          startRef.current = { x: e.clientX, y: e.clientY };
          onPointerDown?.(e);
        }}
        onPointerMove={(e) => {
          if (!startRef.current) {
            onPointerMove?.(e);
            return;
          }
          const dx = Math.abs(e.clientX - startRef.current.x);
          const dy = Math.abs(e.clientY - startRef.current.y);
          if (dx > moveThresholdPx || dy > moveThresholdPx) {
            movedRef.current = true;
          }
          onPointerMove?.(e);
        }}
        onPointerUp={(e) => {
          onPointerUp?.(e);
        }}
        onClick={(e) => {
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
