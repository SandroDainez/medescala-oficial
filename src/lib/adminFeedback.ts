type ToastVariant = "default" | "destructive";

type ToastFn = (input: { title: string; description?: string; variant?: ToastVariant }) => void;

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

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
      description: getErrorMessage(error, fallback),
      variant: "destructive",
    });
  },
};

