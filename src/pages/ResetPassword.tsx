import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { z } from 'zod';

const passwordSchema = z.string().min(6, 'Senha deve ter no mínimo 6 caracteres');

export default function ResetPassword() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isValidLink, setIsValidLink] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if we have a valid recovery session
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        // 1) Hash format: #access_token=...&refresh_token=...&type=recovery
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const hashAccessToken = hashParams.get('access_token');
        const hashRefreshToken = hashParams.get('refresh_token');
        const hashType = hashParams.get('type');

        if (hashType === 'recovery' && hashAccessToken && hashRefreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: hashAccessToken,
            refresh_token: hashRefreshToken,
          });

          if (!error) {
            setIsValidLink(true);
            return;
          }
        }

        // 2) PKCE/code format: /reset-password?code=...
        const queryParams = new URLSearchParams(window.location.search);
        const token = queryParams.get('token');
        const queryType = queryParams.get('type') || 'recovery';

        // 2a) Raw token format: /reset-password?token=...&type=recovery
        // Redirect through Supabase verify endpoint to obtain access_token/refresh_token.
        if (token && queryType === 'recovery') {
          const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
          if (supabaseUrl) {
            const verifyUrl = new URL('/auth/v1/verify', supabaseUrl);
            verifyUrl.searchParams.set('token', token);
            verifyUrl.searchParams.set('type', 'recovery');
            verifyUrl.searchParams.set('redirect_to', `${window.location.origin}/reset-password`);
            window.location.replace(verifyUrl.toString());
            return;
          }
        }

        const code = queryParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            setIsValidLink(true);
            return;
          }
        }

        // 3) Token hash format: /reset-password?token=... or token_hash=...
        const tokenHash = queryParams.get('token_hash');
        if (tokenHash && queryType === 'recovery') {
          const { error } = await supabase.auth.verifyOtp({
            type: 'recovery',
            token_hash: tokenHash,
          });

          if (!error) {
            setIsValidLink(true);
            return;
          }
        }

        // 4) Already authenticated session
        if (session) {
          setIsValidLink(true);
          return;
        }
      } catch (_err) {
        setIsValidLink(false);
      } finally {
        setChecking(false);
      }
    };

    checkSession();
  }, []);

  async function handleResetPassword(e: React.FormEvent) {
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

    setLoading(false);

    if (error) {
      // Handle specific error cases
      let errorMessage = 'Não foi possível alterar a senha. Tente novamente.';
      
      if (error.message?.toLowerCase().includes('same password') || 
          error.message?.toLowerCase().includes('should be different')) {
        errorMessage = 'A nova senha deve ser diferente da senha atual.';
      } else if (error.message?.toLowerCase().includes('weak password')) {
        errorMessage = 'A senha é muito fraca. Use uma senha mais forte.';
      } else if (error.message?.toLowerCase().includes('session')) {
        errorMessage = 'Sessão expirada. Solicite um novo link de recuperação.';
      }
      
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
      return;
    }

    // Also update must_change_password flag if applicable
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', user.id);
    }

    toast({
      title: 'Senha alterada com sucesso!',
      description: 'Você será redirecionado para o login.',
    });

    // Sign out and redirect to login
    await supabase.auth.signOut();
    navigate('/auth');
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Verificando link...</div>
      </div>
    );
  }

  if (!isValidLink) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-2xl text-destructive">Link inválido</CardTitle>
            <CardDescription>
              Este link de recuperação de senha é inválido ou expirou.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/forgot-password')} className="w-full">
              Solicitar novo link
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Criar nova senha</CardTitle>
          <CardDescription>
            Digite sua nova senha abaixo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
