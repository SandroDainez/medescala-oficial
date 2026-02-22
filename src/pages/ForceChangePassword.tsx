import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";

export default function ForceChangePassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = async () => {
    if (password.length < 6) {
      toast({
        title: "Senha inválida",
        description: "A senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirm) {
      toast({
        title: "Erro",
        description: "As senhas não conferem.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });

    setLoading(false);

    if (error) {
      toast({
        title: "Erro ao atualizar senha",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Senha atualizada",
      description: "Sua senha foi alterada com sucesso.",
    });

    navigate("/home");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="bg-card p-8 rounded-xl shadow-md w-full max-w-md space-y-6">
        <h2 className="text-xl font-bold text-center">
          Troca obrigatória de senha
        </h2>

        <p className="text-sm text-muted-foreground text-center">
          Para continuar usando o sistema, você precisa definir uma nova senha.
        </p>

        <input
          type="password"
          placeholder="Nova senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border p-2 rounded"
        />

        <input
          type="password"
          placeholder="Confirmar senha"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border p-2 rounded"
        />

        <button
          onClick={handleChange}
          disabled={loading}
          className="w-full bg-primary text-white py-2 rounded hover:opacity-90 transition"
        >
          {loading ? "Salvando..." : "Atualizar senha"}
        </button>
      </div>
    </div>
  );
}
