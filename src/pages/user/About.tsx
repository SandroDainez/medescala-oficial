import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Info, ExternalLink, Shield, FileText, Mail, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function UserAbout() {
  const navigate = useNavigate();
  const appVersion = '1.0.0';

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Info className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Sobre</h1>
      </div>

      {/* App Info */}
      <Card>
        <CardHeader className="text-center pb-3">
          <div className="mx-auto mb-3 h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">ME</span>
          </div>
          <CardTitle className="text-xl">MedEscala</CardTitle>
          <CardDescription>
            Versão {appVersion}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p>
            Plataforma de gerenciamento de escalas médicas para hospitais e clínicas.
          </p>
        </CardContent>
      </Card>

      {/* Features */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recursos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <span className="text-blue-500">📅</span>
            </div>
            <div>
              <p className="font-medium">Agenda de Plantões</p>
              <p className="text-muted-foreground">Visualize seus plantões e a escala geral</p>
            </div>
          </div>
          <Separator />
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
              <span className="text-purple-500">🔄</span>
            </div>
            <div>
              <p className="font-medium">Trocas de Plantões</p>
              <p className="text-muted-foreground">Solicite e gerencie trocas com colegas</p>
            </div>
          </div>
          <Separator />
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <span className="text-green-500">💰</span>
            </div>
            <div>
              <p className="font-medium">Extrato Financeiro</p>
              <p className="text-muted-foreground">Acompanhe seus valores a receber</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legal */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Legal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button 
            variant="ghost" 
            className="w-full justify-start h-auto py-3"
            onClick={() => navigate('/terms')}
          >
            <FileText className="h-4 w-4 mr-3" />
            <span>Termos de Uso</span>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </Button>
          <Button 
            variant="ghost" 
            className="w-full justify-start h-auto py-3"
            onClick={() => navigate('/privacy')}
          >
            <Shield className="h-4 w-4 mr-3" />
            <span>Política de Privacidade</span>
            <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
          </Button>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Contato</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="ghost" className="w-full justify-start h-auto py-3">
            <Mail className="h-4 w-4 mr-3" />
            <span>suporte@medescala.com.br</span>
          </Button>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground py-4">
        © {new Date().getFullYear()} MedEscala. Todos os direitos reservados.
      </p>
    </div>
  );
}
