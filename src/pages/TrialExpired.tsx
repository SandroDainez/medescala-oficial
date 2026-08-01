import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Mail, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';

interface TrialExpiredProps {
  daysExpired?: number;
  tenantName?: string;
}

export default function TrialExpired({ daysExpired, tenantName }: TrialExpiredProps) {
  const { signOut } = useAuth();
  const { currentTenantName } = useTenant();

  const displayName = tenantName || currentTenantName || 'seu hospital';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-destructive/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Acesso temporariamente suspenso</CardTitle>
          <CardDescription className="text-base mt-2">
            O acesso do <strong>{displayName}</strong> está suspenso por pendência na assinatura.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p>
              Para reativar o MedEscala, regularize a assinatura ou entre em contato
              com o responsável administrativo do seu hospital/serviço.
            </p>
          </div>

          <div className="space-y-3">
            <Button className="w-full" size="lg" asChild>
              <a href="mailto:medescala@hotmail.com?subject=Reativar assinatura - MedEscala">
                <Mail className="mr-2 h-4 w-4" />
                Entrar em contato
              </a>
            </Button>

            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => signOut()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Seus dados estão seguros e preservados. Ao regularizar, o acesso é liberado
            imediatamente e nada é perdido.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
