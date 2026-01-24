import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Mail, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Email inválido');

export default function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function sendPasswordResetEmail(targetEmail: string) {
    const redirectUrl = `${window.location.origin}/reset-password`;

    // Use the edge function for reliable email delivery
    const { data, error } = await supabase.functions.invoke('send-password-reset', {
      body: { 
        email: targetEmail,
        redirectUrl 
      }
    });

    if (error) {
      console.error('Edge function error:', error);
      throw new Error('Erro ao enviar email');
    }

    if (data?.error) {
      console.error('API error:', data.error);
      throw new Error(data.error);
    }

    return data;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      emailSchema.parse(email);
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

    setLoading(true);

    try {
      await sendPasswordResetEmail(email);
      
      setEmailSent(true);
      toast({
        title: 'Email enviado!',
        description: 'Verifique sua caixa de entrada para redefinir sua senha.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível enviar o email. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    try {
      await sendPasswordResetEmail(email);
      toast({
        title: 'Email reenviado!',
        description: 'Verifique sua caixa de entrada e spam.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao reenviar email.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  if (emailSent) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Email enviado!</CardTitle>
            <CardDescription className="space-y-3">
              <p>
                Enviamos um link de recuperação para <strong>{email}</strong>.
              </p>
              <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 p-3 rounded-lg text-sm text-left">
                <p className="font-medium mb-1">⚠️ Importante:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Verifique a <strong>caixa de spam/lixo eletrônico</strong></li>
                  <li>O email pode demorar alguns minutos</li>
                  <li>Procure por email de: <strong>MedEscala</strong></li>
                </ul>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setEmailSent(false);
                setEmail('');
              }}
            >
              Enviar para outro email
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleResend}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reenviando...
                </>
              ) : (
                'Reenviar email'
              )}
            </Button>
            <Link to="/auth">
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Recuperar senha</CardTitle>
          <CardDescription>
            Digite seu email para receber um link de recuperação
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar link de recuperação'
              )}
            </Button>

            <Link to="/auth">
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao login
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
