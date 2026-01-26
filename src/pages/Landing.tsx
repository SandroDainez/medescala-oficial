import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Calendar, Users, Clock, Shield, ChartBar, Bell } from 'lucide-react';

const Landing = forwardRef<HTMLDivElement>(function Landing(_props, ref) {
  return (
    <div ref={ref} className="min-h-screen bg-background">
      {/* Header - Fixed with safe-area support */}
      <header className="fixed top-0 left-0 right-0 z-[100] glass border-b border-border/50 pt-safe">
        <div className="container mx-auto px-4 py-4 min-h-[56px] flex items-center">
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xl">M</span>
              </div>
              <span className="font-bold text-xl text-foreground">MedEscala</span>
            </div>
            
            <div className="hidden md:flex items-center gap-8">
              <a href="#home" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Home
              </a>
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Funcionalidades
              </a>
              <a href="#about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Sobre Nós
              </a>
              <a href="#contact" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Contato
              </a>
            </div>
            
            <div className="flex items-center gap-2">
              <Link to="/auth">
                <Button 
                  variant="ghost" 
                  className="h-11 px-4 text-muted-foreground hover:text-foreground touch-manipulation active:scale-95 transition-transform"
                >
                  Login
                </Button>
              </Link>
              <Link to="/auth">
                <Button className="btn-glow h-11 px-5 touch-manipulation active:scale-95 transition-transform">
                  Experimente
                </Button>
              </Link>
            </div>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section 
        id="home" 
        className="relative min-h-screen flex items-center overflow-hidden" 
        style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}
      >
        {/* Background with overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 via-primary/90 to-primary/85">
          <div 
            className="absolute inset-0 bg-cover bg-center mix-blend-overlay opacity-40"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1920&q=80')`
            }}
          />
        </div>
        
        {/* Content */}
        <div className="container mx-auto px-4 py-32 relative z-10">
          <div className="max-w-3xl animate-fade-in">
            <p className="text-primary-foreground/80 text-lg mb-4 font-medium">
              A solução completa para
            </p>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              <span className="text-primary-foreground">Gestão de Escalas</span>
              <br />
              <span className="text-[hsl(45,100%,51%)]">Simplificada</span>
            </h1>
            <p className="text-primary-foreground/90 text-lg md:text-xl mb-8 max-w-2xl">
              Gerencie equipes e plantões de forma eficiente com tecnologia de ponta.
              Controle completo na palma da sua mão.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/auth">
                <Button 
                  size="lg" 
                  className="bg-[hsl(45,100%,51%)] text-foreground hover:bg-[hsl(45,100%,45%)] font-semibold px-8 shadow-lg hover:shadow-xl transition-all"
                >
                  Comece Agora
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="#features">
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-white/50 bg-white/10 text-white hover:bg-white/20 hover:border-white px-8"
                >
                  Saiba Mais
                </Button>
              </a>
            </div>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Funcionalidades <span className="text-primary">Poderosas</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Tudo que você precisa para gerenciar suas escalas médicas em um só lugar
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Calendar,
                title: 'Gestão de Escalas',
                description: 'Visualize e gerencie todas as escalas em um calendário intuitivo e fácil de usar.'
              },
              {
                icon: Users,
                title: 'Gestão de Equipes',
                description: 'Organize sua equipe por setores e gerencie permissões de forma simples.'
              },
              {
                icon: Clock,
                title: 'Trocas de Plantão',
                description: 'Sistema automatizado de solicitação e aprovação de trocas de plantão.'
              },
              {
                icon: ChartBar,
                title: 'Relatórios Financeiros',
                description: 'Acompanhe os valores de plantões e gere relatórios detalhados.'
              },
              {
                icon: Bell,
                title: 'Notificações',
                description: 'Receba alertas sobre novos plantões, trocas e atualizações importantes.'
              },
              {
                icon: Shield,
                title: 'Segurança',
                description: 'Dados protegidos com criptografia de ponta e backups automáticos.'
              }
            ].map((feature, index) => (
              <div 
                key={index}
                className="card-elevated p-6 hover:border-primary/30 transition-all duration-300"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                Por que escolher o <span className="text-primary">MedEscala</span>?
              </h2>
              <p className="text-muted-foreground text-lg mb-6">
                Desenvolvido por profissionais de saúde, para profissionais de saúde. 
                Entendemos os desafios da gestão de escalas médicas e criamos uma 
                solução completa e intuitiva.
              </p>
              <ul className="space-y-4">
              {[
                  'Interface moderna e fácil de usar',
                  'Suporte técnico',
                  'Atualizações constantes com novas funcionalidades'
                ].map((item, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="aspect-video rounded-2xl overflow-hidden shadow-xl">
                <img 
                  src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&q=80" 
                  alt="Equipe médica" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-primary-foreground rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary-foreground rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
        </div>
        
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-6">
            Pronto para simplificar suas escalas?
          </h2>
          <p className="text-primary-foreground/80 text-lg mb-8 max-w-2xl mx-auto">
            Comece gratuitamente e descubra como o MedEscala pode transformar a gestão da sua equipe.
          </p>
          <Link to="/auth">
            <Button 
              size="lg" 
              className="bg-[hsl(45,100%,51%)] text-foreground hover:bg-[hsl(45,100%,45%)] font-semibold px-8 shadow-lg"
            >
              Criar Conta Gratuita
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Entre em <span className="text-primary">Contato</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Tem dúvidas? Nossa equipe está pronta para ajudar.
            </p>
          </div>
          
          <div className="max-w-lg mx-auto">
            <div className="card-elevated p-8">
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="text-foreground font-medium">sandrodainez1@gmail.com</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Telefone</p>
                    <p className="text-foreground font-medium">(13) 99700-0649</p>
                  </div>
                </div>
                <a 
                  href="https://wa.me/5513997000649" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 hover:bg-muted/50 p-2 -m-2 rounded-xl transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">WhatsApp</p>
                    <p className="text-foreground font-medium">(13) 99700-0649</p>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-muted/50 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold">M</span>
              </div>
              <span className="font-semibold text-foreground">MedEscala</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 MedEscala. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
});

export default Landing;
