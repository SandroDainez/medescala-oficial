import { buildErrorToastDescription } from '@/lib/errorMessage';

type ToastVariant = "default" | "destructive";

type ToastFn = (input: { title: string; description?: string; variant?: ToastVariant }) => void;

export const adminFeedback = {
  success(toast: ToastFn, action: string, description?: string) {
    toast({
      title: `${action} concluído`,
      description,
    });
  },
  info(toast: ToastFn, title: string, description?: string) {
    toast({ title, description });
  },
  warning(toast: ToastFn, title: string, description?: string) {
    toast({ title, description });
  },
  error(toast: ToastFn, action: string, error?: unknown, fallback = "Tente novamente em instantes.") {
    toast({
      title: `Falha ao ${action.toLowerCase()}`,
      description: buildErrorToastDescription({ action, error, fallback }),
      variant: "destructive",
    });
  },
};
