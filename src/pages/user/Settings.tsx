import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { Settings, Smartphone, Shield, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import NotificationPreferences from '@/components/user/NotificationPreferences';

export default function UserSettings() {
  const { user } = useAuth();
  const { currentTenantName } = useTenant();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

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

      {/* Notifications & Calendar */}
      <NotificationPreferences />

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
            <Switch 
              checked={theme === 'dark'}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            />
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
