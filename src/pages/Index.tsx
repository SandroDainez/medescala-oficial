import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const Index = () => {
  const { user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl text-primary">MedEscala</CardTitle>
              <CardDescription>Gestão de Escalas Médicas</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={role === 'admin' ? 'default' : 'secondary'}>
                {role === 'admin' ? 'Administrador' : 'Usuário'}
              </Badge>
              <Button variant="outline" onClick={signOut}>
                Sair
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-medium text-foreground">Bem-vindo!</h3>
                <p className="text-sm text-muted-foreground">
                  Email: {user.email}
                </p>
                <p className="text-sm text-muted-foreground">
                  Perfil: {role === 'admin' ? 'Administrador' : 'Usuário'}
                </p>
              </div>
              
              <div className="rounded-lg border border-dashed bg-muted/50 p-8 text-center">
                <p className="text-muted-foreground">
                  Sistema em desenvolvimento. Em breve: Plantões, Trocas e Financeiro.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
