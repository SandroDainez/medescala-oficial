import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { MessageSquare, Send, Star, ThumbsUp, ThumbsDown, Meh, CheckCircle } from 'lucide-react';

export default function UserFeedback() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rating, setRating] = useState<string>('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!rating) {
      toast({
        title: 'Selecione uma avaliação',
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    
    // Simulate sending feedback
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setSending(false);
    setSent(true);
    
    toast({
      title: 'Feedback enviado!',
      description: 'Obrigado por nos ajudar a melhorar.',
    });
  };

  if (sent) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold mb-2">Obrigado!</h2>
            <p className="text-muted-foreground mb-4">
              Seu feedback foi enviado com sucesso. Agradecemos por nos ajudar a melhorar o MedEscala.
            </p>
            <Button variant="outline" onClick={() => setSent(false)}>
              Enviar outro feedback
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Feedback</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Como está sua experiência?</CardTitle>
          <CardDescription>
            Sua opinião é muito importante para melhorarmos o aplicativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Rating */}
          <div className="space-y-3">
            <Label>Como você avalia o MedEscala?</Label>
            <RadioGroup value={rating} onValueChange={setRating} className="flex justify-center gap-4">
              <div className="flex flex-col items-center gap-2">
                <RadioGroupItem value="bad" id="bad" className="sr-only" />
                <label
                  htmlFor="bad"
                  className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${
                    rating === 'bad' ? 'border-red-500 bg-red-500/10' : 'border-muted hover:border-muted-foreground'
                  }`}
                >
                  <ThumbsDown className={`h-8 w-8 ${rating === 'bad' ? 'text-red-500' : 'text-muted-foreground'}`} />
                </label>
                <span className="text-xs text-muted-foreground">Ruim</span>
              </div>
              
              <div className="flex flex-col items-center gap-2">
                <RadioGroupItem value="neutral" id="neutral" className="sr-only" />
                <label
                  htmlFor="neutral"
                  className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${
                    rating === 'neutral' ? 'border-yellow-500 bg-yellow-500/10' : 'border-muted hover:border-muted-foreground'
                  }`}
                >
                  <Meh className={`h-8 w-8 ${rating === 'neutral' ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                </label>
                <span className="text-xs text-muted-foreground">Regular</span>
              </div>
              
              <div className="flex flex-col items-center gap-2">
                <RadioGroupItem value="good" id="good" className="sr-only" />
                <label
                  htmlFor="good"
                  className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${
                    rating === 'good' ? 'border-green-500 bg-green-500/10' : 'border-muted hover:border-muted-foreground'
                  }`}
                >
                  <ThumbsUp className={`h-8 w-8 ${rating === 'good' ? 'text-green-500' : 'text-muted-foreground'}`} />
                </label>
                <span className="text-xs text-muted-foreground">Bom</span>
              </div>
              
              <div className="flex flex-col items-center gap-2">
                <RadioGroupItem value="excellent" id="excellent" className="sr-only" />
                <label
                  htmlFor="excellent"
                  className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${
                    rating === 'excellent' ? 'border-primary bg-primary/10' : 'border-muted hover:border-muted-foreground'
                  }`}
                >
                  <Star className={`h-8 w-8 ${rating === 'excellent' ? 'text-primary' : 'text-muted-foreground'}`} />
                </label>
                <span className="text-xs text-muted-foreground">Excelente</span>
              </div>
            </RadioGroup>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Comentários (opcional)</Label>
            <Textarea
              id="message"
              placeholder="Conte-nos mais sobre sua experiência, sugestões ou problemas encontrados..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>

          {/* Submit */}
          <Button 
            className="w-full" 
            onClick={handleSubmit}
            disabled={sending}
          >
            {sending ? (
              <>Enviando...</>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Enviar Feedback
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Precisa de ajuda?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Se você está enfrentando algum problema técnico ou precisa de suporte, 
            entre em contato conosco pelo email{' '}
            <a href="mailto:suporte@medescala.com.br" className="text-primary hover:underline">
              suporte@medescala.com.br
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
