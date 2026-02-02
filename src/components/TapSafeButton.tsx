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
    minPressTime = 160,
    disablePressVisual = false,
    className,
    ...props 
  }, ref) => {
    const startRef = useRef<{ x: number; y: number; time: number } | null>(null);
    // IMPORTANT: em mobile, o evento `click` pode atrasar ~300ms.
    // Portanto, NÃO podemos medir pressDuration com Date.now() dentro do onClick.
    // Medimos a duração real no pointerup.
    const endTimeRef = useRef<number | null>(null);
    const wasValidPressRef = useRef<boolean>(false);
    const movedRef = useRef(false);
    const pointerTypeRef = useRef<string | null>(null);
    // Alguns browsers (principalmente iOS) podem disparar touch/click sem PointerEvents consistentes.
    // Se detectarmos touchstart, tratamos como touch e bloqueamos qualquer click derivado.
    const hadTouchRef = useRef(false);
    const touchResetTimerRef = useRef<number | null>(null);
    const cleanupScrollListenerRef = useRef<(() => void) | null>(null);
    const [isPressed, setIsPressed] = useState(false);

    // Evita stale-closures caso o handler mude.
    const onClickRef = useRef<typeof onClick>(onClick);
    useEffect(() => {
      onClickRef.current = onClick;
    }, [onClick]);

    useEffect(() => {
      return () => {
        cleanupScrollListenerRef.current?.();
        cleanupScrollListenerRef.current = null;
        if (touchResetTimerRef.current) {
          window.clearTimeout(touchResetTimerRef.current);
          touchResetTimerRef.current = null;
        }
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
          // Permite scroll vertical normalmente e reduz interferência de gestos
          "touch-pan-y",
          // Transições suaves para feedback visual
          "transition-all duration-100 ease-out",
          // Feedback visual de press (apenas se não desativado)
          !disablePressVisual && isPressed && "scale-[0.98] shadow-inner opacity-90",
          // Classe personalizada do usuário
          className
        )}
        onPointerDown={(e) => {
          movedRef.current = false;
          wasValidPressRef.current = false;
          endTimeRef.current = null;
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
        onTouchStart={(e) => {
          // Fallback: garante que sabemos que é touch, mesmo se PointerEvents falharem.
          hadTouchRef.current = true;
          if (touchResetTimerRef.current) window.clearTimeout(touchResetTimerRef.current);
          touchResetTimerRef.current = window.setTimeout(() => {
            hadTouchRef.current = false;
          }, 1200);

          movedRef.current = false;
          wasValidPressRef.current = false;
          endTimeRef.current = null;
          pointerTypeRef.current = "touch";

          const t = e.touches[0];
          if (t) {
            startRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
          } else {
            startRef.current = { x: 0, y: 0, time: Date.now() };
          }

          attachScrollGuard();

          const pressTimer = window.setTimeout(() => {
            if (!movedRef.current) setIsPressed(true);
          }, 50);
          (startRef.current as any).pressTimer = pressTimer;

          // Não chama props.onTouchStart (não existe no tipo base), mas respeita onPointerDown se o app usar.
        }}
        onTouchMove={(e) => {
          if (!startRef.current) return;
          const t = e.touches[0];
          if (!t) return;

          const threshold = moveThresholdPx ?? 40;
          const dx = Math.abs(t.clientX - startRef.current.x);
          const dy = Math.abs(t.clientY - startRef.current.y);
          if (dx > threshold || dy > threshold) {
            movedRef.current = true;
            setIsPressed(false);
            if ((startRef.current as any).pressTimer) {
              window.clearTimeout((startRef.current as any).pressTimer);
            }
          }
        }}
        onTouchEnd={(e) => {
          detachScrollGuard();
          setIsPressed(false);

          endTimeRef.current = Date.now();

          if (startRef.current && (startRef.current as any).pressTimer) {
            window.clearTimeout((startRef.current as any).pressTimer);
          }

          if (startRef.current) {
            const pressDuration = endTimeRef.current - startRef.current.time;
            const threshold = moveThresholdPx ?? 40;
            // Se houve touchmove suficiente, movedRef já estará true.
            // Se não houve, ainda exigimos o tempo mínimo.
            wasValidPressRef.current = !movedRef.current && pressDuration >= minPressTime;
            // (extra) se o browser não entregou touchmove, mas o usuário rolou, o scroll-guard marca movedRef.
            if (wasValidPressRef.current) {
              wasValidPressRef.current = false;
              onClickRef.current?.(e as any);
            }
          }
        }}
        onTouchCancel={() => {
          movedRef.current = true;
          wasValidPressRef.current = false;
          detachScrollGuard();
          setIsPressed(false);
          if (startRef.current && (startRef.current as any).pressTimer) {
            window.clearTimeout((startRef.current as any).pressTimer);
          }
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

          endTimeRef.current = Date.now();

          // Limpa o timer de press se existir
          if (startRef.current && (startRef.current as any).pressTimer) {
            clearTimeout((startRef.current as any).pressTimer);
          }

          // Calcula a duração real do gesto (do pointerdown ao pointerup)
          if (startRef.current) {
            const pressDuration = endTimeRef.current - startRef.current.time;
            wasValidPressRef.current = !movedRef.current && pressDuration >= minPressTime;
          }

          // IMPORTANTÍSSIMO (TOUCH): não depende de `click` (ghost click / atraso),
          // dispara aqui, somente se o gesto foi validado.
          if (pointerTypeRef.current === "touch" && wasValidPressRef.current) {
            // Consome o gesto e evita double-fire.
            wasValidPressRef.current = false;
            // Chamamos o handler original (em geral ele não depende do tipo do evento).
            onClickRef.current?.(e as any);
          }

          onPointerUp?.(e);
        }}
        onPointerCancel={(e) => {
          // Qualquer cancelamento de ponteiro (muito comum durante scroll) invalida o clique.
          movedRef.current = true;
          wasValidPressRef.current = false;
          endTimeRef.current = Date.now();
          detachScrollGuard();
          setIsPressed(false);
          // Limpa o timer de press se existir
          if (startRef.current && (startRef.current as any).pressTimer) {
            clearTimeout((startRef.current as any).pressTimer);
          }
          onPointerCancel?.(e);
        }}
        onClickCapture={(e) => {
          // Para TOUCH (incluindo fallback iOS): bloqueia SEMPRE o click nativo (ghost click).
          // A execução já ocorreu (ou não) no onPointerUp/onTouchEnd, após validação.
          if (pointerTypeRef.current === "touch" || hadTouchRef.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onClick={(e) => {
          detachScrollGuard();
          setIsPressed(false);

          // Limpa o timer de press se existir
          if (startRef.current && (startRef.current as any).pressTimer) {
            clearTimeout((startRef.current as any).pressTimer);
          }

          // TOUCH nunca executa aqui.
          if (pointerTypeRef.current === "touch") return;

          // Se o usuário estava rolando/arrastando, não considera como clique.
          if (movedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }

          // Para mouse/teclado: mantém validação por tempo (quando existir startRef)
          if (startRef.current && endTimeRef.current) {
            const pressDuration = endTimeRef.current - startRef.current.time;
            if (pressDuration < minPressTime) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }

          onClickRef.current?.(e);
        }}
      />
    );
  }
);

TapSafeButton.displayName = "TapSafeButton";
