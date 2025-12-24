import UserCalendar from '@/components/user/UserCalendar';

export default function UserCalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Meu Calendário</h2>
        <p className="text-muted-foreground">Visualize seus plantões e colegas de equipe</p>
      </div>
      <UserCalendar />
    </div>
  );
}
