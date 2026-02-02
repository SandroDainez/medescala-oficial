import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type TapSafeButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * Distância (px) que o dedo/mouse pode se mover antes de considerarmos como scroll/arrasto.
   * Se não for informado, o componente usa um padrão adaptativo:
   * - touch: 32px (mais tolerante para evitar ativações durante scroll)
   * - mouse/pen: 12px
   */
  moveThresholdPx?: number;
  
  /**
   * Tempo mínimo (ms) que o usuário deve manter pressionado antes de considerar como clique válido.
   * Default: 80ms para evitar ativações acidentais durante scroll rápido.
   */
  minPressTime?: number;
  
  /**
   * Desativar feedback visual de press (scale/shadow)
   */
  disablePressVisual?: boolean;
};

/**
 * Evita "clique fantasma" no mobile: ao rolar a lista, um touchend pode disparar onClick.
 * Este botão só executa onClick se o ponteiro não tiver se movido além do limiar
 * E se o tempo de pressão for suficiente.
 * 
 * Inclui feedback visual de press (escala e sombra) para indicar intenção de clique.
 */
export const TapSafeButton = forwardRef<HTMLButtonElement, TapSafeButtonProps>(
  ({ 
    onClick, 
    onPointerDown, 
    onPointerMove, 
    onPointerUp, 
    onPointerCancel, 
    moveThresholdPx, 
    minPressTime = 80,
    disablePressVisual = false,
    className,
    ...props 
  }, ref) => {
    const startRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const movedRef = useRef(false);
    const pointerTypeRef = useRef<string | null>(null);
    const cleanupScrollListenerRef = useRef<(() => void) | null>(null);
    const [isPressed, setIsPressed] = useState(false);

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
        setIsPressed(false);
      };
      // scroll não "bubbling", mas pode ser capturado
      document.addEventListener("scroll", onAnyScroll, { capture: true, passive: true });
      
      // Também escuta touchmove no document para detectar scroll em progress
      const onTouchMove = () => {
        movedRef.current = true;
        setIsPressed(false);
      };
      document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
      
      cleanupScrollListenerRef.current = () => {
        document.removeEventListener("scroll", onAnyScroll, { capture: true } as any);
        document.removeEventListener("touchmove", onTouchMove, { capture: true } as any);
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
        className={cn(
          // Área mínima de toque de 44px (acessibilidade)
          "min-h-[44px]",
          // Transições suaves para feedback visual
          "transition-all duration-100 ease-out",
          // Feedback visual de press (apenas se não desativado)
          !disablePressVisual && isPressed && "scale-[0.98] shadow-inner opacity-90",
          // Classe personalizada do usuário
          className
        )}
        onPointerDown={(e) => {
          movedRef.current = false;
          startRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };

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

          // Ativa feedback visual com pequeno delay para evitar flash durante scroll rápido
          const pressTimer = setTimeout(() => {
            if (!movedRef.current) {
              setIsPressed(true);
            }
          }, 50);
          
          // Guarda referência para limpar se necessário
          (startRef.current as any).pressTimer = pressTimer;

          onPointerDown?.(e);
        }}
        onPointerMove={(e) => {
          if (!startRef.current) {
            onPointerMove?.(e);
            return;
          }

          const isTouch = pointerTypeRef.current === "touch";
          // Threshold maior para touch (32px) para ser mais tolerante durante scroll
          const threshold = moveThresholdPx ?? (isTouch ? 32 : 12);

          const dx = Math.abs(e.clientX - startRef.current.x);
          const dy = Math.abs(e.clientY - startRef.current.y);
          if (dx > threshold || dy > threshold) {
            movedRef.current = true;
            setIsPressed(false);
            // Limpa o timer de press se existir
            if ((startRef.current as any).pressTimer) {
              clearTimeout((startRef.current as any).pressTimer);
            }
          }
          onPointerMove?.(e);
        }}
        onPointerUp={(e) => {
          detachScrollGuard();
          setIsPressed(false);
          // Limpa o timer de press se existir
          if (startRef.current && (startRef.current as any).pressTimer) {
            clearTimeout((startRef.current as any).pressTimer);
          }
          onPointerUp?.(e);
        }}
        onPointerCancel={(e) => {
          // Qualquer cancelamento de ponteiro (muito comum durante scroll) invalida o clique.
          movedRef.current = true;
          detachScrollGuard();
          setIsPressed(false);
          // Limpa o timer de press se existir
          if (startRef.current && (startRef.current as any).pressTimer) {
            clearTimeout((startRef.current as any).pressTimer);
          }
          onPointerCancel?.(e);
        }}
        onClick={(e) => {
          detachScrollGuard();
          setIsPressed(false);
          
          // Limpa o timer de press se existir
          if (startRef.current && (startRef.current as any).pressTimer) {
            clearTimeout((startRef.current as any).pressTimer);
          }
          
          // Se o usuário estava rolando/arrastando, não considera como clique.
          if (movedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          
          // Verifica tempo mínimo de pressão
          if (startRef.current) {
            const pressDuration = Date.now() - startRef.current.time;
            if (pressDuration < minPressTime) {
              // Pressão muito rápida - provavelmente scroll passando por cima
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
          
          onClick?.(e);
        }}
      />
    );
  }
);

TapSafeButton.displayName = "TapSafeButton";
