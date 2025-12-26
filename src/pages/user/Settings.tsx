import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { Settings, Bell, Moon, Smartphone, Shield, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function UserSettings() {
  const { user } = useAuth();
  const { currentTenantName } = useTenant();
  const navigate = useNavigate();
  
  const [notifyShifts, setNotifyShifts] = useState(true);
  const [notifySwaps, setNotifySwaps] = useState(true);
  const [notifyPayments, setNotifyPayments] = useState(true);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Preferências</h1>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Perfil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-muted-foreground text-xs">Email</Label>
            <p className="font-medium">{user?.email}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Empresa</Label>
            <p className="font-medium">{currentTenantName || 'Não vinculado'}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/change-password')}>
            Alterar senha
          </Button>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações
          </CardTitle>
          <CardDescription>
            Configure quais notificações deseja receber
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Plantões</Label>
              <p className="text-sm text-muted-foreground">Novos plantões e alterações</p>
            </div>
            <Switch checked={notifyShifts} onCheckedChange={setNotifyShifts} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Trocas</Label>
              <p className="text-sm text-muted-foreground">Solicitações e atualizações</p>
            </div>
            <Switch checked={notifySwaps} onCheckedChange={setNotifySwaps} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Pagamentos</Label>
              <p className="text-sm text-muted-foreground">Confirmações de pagamento</p>
            </div>
            <Switch checked={notifyPayments} onCheckedChange={setNotifyPayments} />
          </div>
        </CardContent>
      </Card>

      {/* App Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Aplicativo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Modo escuro</Label>
              <p className="text-sm text-muted-foreground">Tema do aplicativo</p>
            </div>
            <Switch />
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Segurança
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={() => navigate('/change-password')}>
            Alterar senha
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
