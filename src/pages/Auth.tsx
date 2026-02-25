import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { ArrowLeft, Mail, CreditCard, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { buildPublicAppUrl } from '@/lib/publicAppUrl';

const emailSchema = z.string().email('Email inválido');
const passwordSchema = z.string().min(6, 'Senha deve ter no mínimo 6 caracteres');
const nameSchema = z.string().min(2, 'Nome deve ter no mínimo 2 caracteres');
const cpfSchema = z.string().min(11, 'CPF deve ter 11 dígitos').max(14, 'CPF inválido');

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [loginMethod, setLoginMethod] = useState<'email' | 'cpf'>('email');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotMethod, setForgotMethod] = useState<'email' | 'cpf'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCpf, setForgotCpf] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate('/home');
    }
  }, [user, loading, navigate]);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpf(formatCpfInput(e.target.value));
  };

  async function sendPasswordReset(payload: { email?: string; cpf?: string }) {
    const redirectUrl = buildPublicAppUrl('/reset-password');

    const { data, error } = await supabase.functions.invoke('send-password-reset', {
      body: {
        ...payload,
        redirectUrl,
      },
    });

    if (error) {
      throw new Error(error.message || 'Erro ao enviar recuperação');
    }

    if (data?.error) {
      throw new Error(data.error);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();

    try {
      if (forgotMethod === 'email') {
        emailSchema.parse(forgotEmail);
      } else {
        cpfSchema.parse(forgotCpf.replace(/\D/g, ''));
      }
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

    setForgotLoading(true);

    try {
      if (forgotMethod === 'email') {
        await sendPasswordReset({ email: forgotEmail.trim().toLowerCase() });
      } else {
        await sendPasswordReset({ cpf: forgotCpf.replace(/\D/g, '') });
      }

      toast({
        title: 'Recuperação enviada!',
        description: 'Se o cadastro existir, você receberá instruções no email automaticamente.',
      });
      setForgotOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar recuperação';
      toast({
        title: 'Erro',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setForgotLoading(false);
    }
  }

  const handleSignInWithCpf = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      cpfSchema.parse(cpf.replace(/\D/g, ''));
      passwordSchema.parse(password);
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

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('login-cpf', {
        body: { cpf: cpf.replace(/\D/g, ''), password },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || 'Erro ao fazer login');
      }

      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        toast({
          title: 'Bem-vindo!',
          description: 'Login realizado com sucesso.',
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao fazer login';
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
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

    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    setIsSubmitting(false);

    if (error) {
      let message = 'Erro ao fazer login';
      if (error.message.includes('Invalid login credentials')) {
        message = 'Email ou senha incorretos';
      } else if (error.message.includes('Email not confirmed')) {
        message = 'Email não confirmado. Verifique sua caixa de entrada.';
      }

      toast({
        title: 'Erro',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
      nameSchema.parse(name);
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

    setIsSubmitting(true);
    const { error } = await signUp(email, password, name);
    setIsSubmitting(false);

    if (error) {
      let message = 'Erro ao criar conta';
      if (error.message.includes('User already registered')) {
        message = 'Este email já está cadastrado';
      }

      toast({
        title: 'Erro',
        description: message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Conta criada!',
        description: 'Você foi logado automaticamente.',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 via-primary/90 to-primary/85">
          <div
            className="absolute inset-0 bg-cover bg-center mix-blend-overlay opacity-40"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1920&q=80')`,
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col justify-center p-12">
          <Link to="/" className="absolute top-8 left-8 flex items-center gap-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
            <span>Voltar</span>
          </Link>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 flex items-center justify-center backdrop-blur-sm">
              <span className="text-primary-foreground font-bold text-xl">M</span>
            </div>
            <span className="font-bold text-2xl text-primary-foreground">MedEscala</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
            <span className="text-primary-foreground">Gestão de Escalas</span>
            <br />
            <span className="text-[hsl(45,100%,51%)]">Simplificada</span>
          </h1>
          <p className="text-primary-foreground/80 text-lg max-w-md">
            Gerencie equipes e plantões de forma eficiente com tecnologia de ponta.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 text-center">
            <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
              <ArrowLeft className="h-5 w-5" />
              <span>Voltar</span>
            </Link>
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">M</span>
              </div>
              <span className="font-bold text-xl text-foreground">MedEscala</span>
            </div>
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl font-bold text-foreground">Bem-vindo!</CardTitle>
              <CardDescription>Acesse sua conta ou crie uma nova</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="signin" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="signin">Entrar</TabsTrigger>
                  <TabsTrigger value="signup">Cadastrar</TabsTrigger>
                </TabsList>

                <TabsContent value="signin">
                  <div className="flex gap-2 mb-6">
                    <Button type="button" variant={loginMethod === 'email' ? 'default' : 'outline'} className="flex-1 gap-2" onClick={() => setLoginMethod('email')}>
                      <Mail className="h-4 w-4" />
                      Email
                    </Button>
                    <Button type="button" variant={loginMethod === 'cpf' ? 'default' : 'outline'} className="flex-1 gap-2" onClick={() => setLoginMethod('cpf')}>
                      <CreditCard className="h-4 w-4" />
                      CPF
                    </Button>
                  </div>

                  {loginMethod === 'email' ? (
                    <form onSubmit={handleSignIn} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="signin-email">Email</Label>
                        <Input id="signin-email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signin-password">Senha</Label>
                        <Input id="signin-password" type="password" placeholder="••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" />
                      </div>
                      <Button type="submit" className="w-full h-11 btn-glow" disabled={isSubmitting}>
                        {isSubmitting ? 'Entrando...' : 'Entrar'}
                      </Button>
                      <div className="text-center mt-4">
                        <button
                          type="button"
                          className="text-sm text-primary hover:underline"
                          onClick={() => {
                            setForgotMethod('email');
                            setForgotEmail(email);
                            setForgotCpf('');
                            setForgotOpen(true);
                          }}
                        >
                          Esqueceu sua senha?
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleSignInWithCpf} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="signin-cpf">CPF</Label>
                        <Input id="signin-cpf" type="text" placeholder="000.000.000-00" value={cpf} onChange={handleCpfChange} required className="h-11" maxLength={14} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signin-cpf-password">Senha</Label>
                        <Input id="signin-cpf-password" type="password" placeholder="••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" />
                      </div>
                      <Button type="submit" className="w-full h-11 btn-glow" disabled={isSubmitting}>
                        {isSubmitting ? 'Entrando...' : 'Entrar com CPF'}
                      </Button>
                      <div className="text-center mt-4">
                        <button
                          type="button"
                          className="text-sm text-primary hover:underline"
                          onClick={() => {
                            setForgotMethod('cpf');
                            setForgotCpf(cpf);
                            setForgotEmail('');
                            setForgotOpen(true);
                          }}
                        >
                          Esqueceu sua senha?
                        </button>
                      </div>
                    </form>
                  )}
                </TabsContent>

                <TabsContent value="signup">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Nome</Label>
                      <Input id="signup-name" type="text" placeholder="Seu nome completo" value={name} onChange={(e) => setName(e.target.value)} required className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input id="signup-email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Senha</Label>
                      <Input id="signup-password" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" />
                    </div>
                    <Button type="submit" className="w-full h-11 btn-glow" disabled={isSubmitting}>
                      {isSubmitting ? 'Cadastrando...' : 'Cadastrar'}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Ao continuar, você concorda com nossos <a href="/terms" className="text-primary hover:underline">Termos de Uso</a> e <a href="/privacy" className="text-primary hover:underline">Política de Privacidade</a>.
          </p>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recuperar senha</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 mb-2">
            <Button type="button" variant={forgotMethod === 'email' ? 'default' : 'outline'} className="flex-1" onClick={() => setForgotMethod('email')}>
              Email
            </Button>
            <Button type="button" variant={forgotMethod === 'cpf' ? 'default' : 'outline'} className="flex-1" onClick={() => setForgotMethod('cpf')}>
              CPF
            </Button>
          </div>

          <form onSubmit={handleForgotPassword} className="space-y-4">
            {forgotMethod === 'email' ? (
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email da conta</Label>
                <Input id="forgot-email" type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="seu@email.com" required />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="forgot-cpf">CPF da conta</Label>
                <Input id="forgot-cpf" type="text" value={forgotCpf} onChange={(e) => setForgotCpf(formatCpfInput(e.target.value))} placeholder="000.000.000-00" maxLength={14} required />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)} disabled={forgotLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={forgotLoading}>
                {forgotLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar recuperação'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
