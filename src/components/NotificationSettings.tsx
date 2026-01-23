import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, BellOff, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  requestNotificationPermission,
  isNotificationsSupported,
  getNotificationSettings,
  saveNotificationSettings,
  showLocalNotification,
} from '@/lib/notifications';

export function NotificationSettings() {
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [settings, setSettings] = useState(getNotificationSettings());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isNotificationsSupported()) {
      setPermission(Notification.permission);
    }
  }, []);

  async function handleEnableNotifications() {
    setLoading(true);
    const result = await requestNotificationPermission();
    setPermission(result);
    
    if (result === 'granted') {
      toast({
        title: 'Notificações ativadas!',
        description: 'Você receberá lembretes sobre seus plantões.',
      });
      
      // Show a test notification
      await showLocalNotification(
        '✅ Notificações Ativadas',
        {
          body: 'Você receberá lembretes antes dos seus plantões!',
          tag: 'test-notification',
        }
      );
    } else if (result === 'denied') {
      toast({
        title: 'Permissão negada',
        description: 'Você pode habilitar nas configurações do navegador.',
        variant: 'destructive',
      });
    }
    
    setLoading(false);
  }

  function handleToggleEnabled(enabled: boolean) {
    const newSettings = { ...settings, enabled };
    setSettings(newSettings);
    saveNotificationSettings(newSettings);
  }

  function handleReminderHoursChange(hours: string) {
    const newSettings = { ...settings, reminderHours: parseInt(hours, 10) };
    setSettings(newSettings);
    saveNotificationSettings(newSettings);
  }

  async function handleTestNotification() {
    await showLocalNotification(
      '🔔 Notificação de Teste',
      {
        body: 'Suas notificações estão funcionando corretamente!',
        tag: 'test-notification',
      }
    );
    toast({ title: 'Notificação de teste enviada!' });
  }

  if (!isNotificationsSupported()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5 text-muted-foreground" />
            Notificações não suportadas
          </CardTitle>
          <CardDescription>
            Seu navegador não suporta notificações push.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Notificações e Lembretes
        </CardTitle>
        <CardDescription>
          Configure lembretes automáticos para seus plantões
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Permission Status */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
          <div className="flex items-center gap-3">
            {permission === 'granted' ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : permission === 'denied' ? (
              <XCircle className="h-5 w-5 text-destructive" />
            ) : (
              <Bell className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">Status das Notificações</p>
              <p className="text-sm text-muted-foreground">
                {permission === 'granted' && 'Notificações ativadas'}
                {permission === 'denied' && 'Notificações bloqueadas no navegador'}
                {permission === 'default' && 'Clique para ativar notificações'}
              </p>
            </div>
          </div>
          
          {permission !== 'granted' && (
            <Button 
              onClick={handleEnableNotifications} 
              disabled={loading || permission === 'denied'}
              size="sm"
            >
              {loading ? 'Ativando...' : 'Ativar'}
            </Button>
          )}
        </div>

        {/* Settings (only show if permission granted) */}
        {permission === 'granted' && (
          <>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notifications-enabled">Lembretes de Plantão</Label>
                <p className="text-sm text-muted-foreground">
                  Receber notificação antes do início do plantão
                </p>
              </div>
              <Switch
                id="notifications-enabled"
                checked={settings.enabled}
                onCheckedChange={handleToggleEnabled}
              />
            </div>

            {settings.enabled && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Antecedência do Lembrete</Label>
                  <p className="text-sm text-muted-foreground">
                    Quantas horas antes do plantão
                  </p>
                </div>
                <Select 
                  value={settings.reminderHours.toString()} 
                  onValueChange={handleReminderHoursChange}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 hora</SelectItem>
                    <SelectItem value="2">2 horas</SelectItem>
                    <SelectItem value="3">3 horas</SelectItem>
                    <SelectItem value="6">6 horas</SelectItem>
                    <SelectItem value="12">12 horas</SelectItem>
                    <SelectItem value="24">1 dia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button variant="outline" onClick={handleTestNotification} className="w-full">
              <Bell className="mr-2 h-4 w-4" />
              Enviar Notificação de Teste
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
