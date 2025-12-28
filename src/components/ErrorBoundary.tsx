import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  errorMessage?: string;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // This prevents a full "white screen" and gives us a useful clue in console logs.
    console.error("[ErrorBoundary] Uncaught error:", error);
    console.error("[ErrorBoundary] Component stack:", info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle>Ocorreu um erro nesta tela</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                A aplicação evitou a tela branca e registrou o erro no console para correção.
              </p>
              {this.state.errorMessage && (
                <pre className="max-h-40 overflow-auto rounded-md border bg-muted p-3 text-xs text-foreground">
                  {this.state.errorMessage}
                </pre>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => window.location.reload()}>Recarregar</Button>
                <Button variant="outline" onClick={() => (window.location.href = "/home")}
                >
                  Ir para Início
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }
}
