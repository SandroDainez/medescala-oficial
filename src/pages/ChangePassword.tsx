import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { z } from 'zod';

const passwordSchema = z.string().min(6, 'Senha deve ter no mínimo 6 caracteres');

export default function ChangePassword() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mustChange, setMustChange] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  useEffect(() => {
    checkMustChangePassword();
  }, [user]);

  async function checkMustChangePassword() {
    if (!user) {
      setCheckingStatus(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .single();

    if (profile?.must_change_password) {
      setMustChange(true);
    }
    setCheckingStatus(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    try {
      passwordSchema.parse(newPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          title: 'Erro de validação',
          description: err.errors[0].message,
          variant: 'destructive',
        });
        return;
      }
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Erro',
        description: 'As senhas não coincidem',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar a senha. Tente novamente.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    // Update must_change_password to false
    if (user) {
      await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', user.id);
    }

    toast({
      title: 'Senha alterada!',
      description: 'Sua nova senha foi salva com sucesso.',
    });

    // Redirect to appropriate page
    navigate('/home');
    setLoading(false);
  }

  if (checkingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    navigate('/auth');
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">
            {mustChange ? 'Altere sua senha' : 'Nova senha'}
          </CardTitle>
          <CardDescription>
            {mustChange
              ? 'Por segurança, você precisa criar uma nova senha para continuar'
              : 'Digite sua nova senha abaixo'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova senha</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Digite novamente"
                  required
                  className="pr-10"
                />
                {confirmPassword && newPassword === confirmPassword && (
                  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                )}
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Salvando...' : 'Alterar senha'}
            </Button>

            {!mustChange && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => navigate(-1)}
              >
                Cancelar
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
