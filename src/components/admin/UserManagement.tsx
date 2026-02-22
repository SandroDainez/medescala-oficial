"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ProfileRow = {
  id: string;
  name: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

function formatDate(iso?: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

export default function UserManagement() {
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [query, setQuery] = useState("");

  // Detalhes
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<ProfileRow | null>(null);

  // Editar
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");

  async function loadUsers(showSpinner = true) {
    if (showSpinner) setLoading(true);
    else setReloading(true);

    try {
      // OBS: se sua RLS bloquear SELECT em profiles,
      // a lista vai ficar vazia e vai logar erro aqui.
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro SELECT profiles:", error);
        setProfiles([]);
        return;
      }

      setProfiles((data as ProfileRow[]) || []);
    } catch (e) {
      console.error("Erro inesperado loadUsers:", e);
      setProfiles([]);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }

  useEffect(() => {
    loadUsers(true);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const id = (p.id || "").toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [profiles, query]);

  function openDetails(p: ProfileRow) {
    setSelected(p);
    setDetailsOpen(true);
  }

  function openEdit(p?: ProfileRow) {
    const target = p ?? selected;
    if (!target) return;
    setSelected(target);
    setEditName(target.name || "");
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selected) return;

    const name = editName.trim();
    if (!name) {
      alert("Nome não pode ficar vazio.");
      return;
    }
console.log("ENVIANDO PARA FUNCTION:", {
  userId: selected.id,
  name,
});
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-user", {
        body: {
          userId: selected.id,
          name,
        },
      });

      // MUITO IMPORTANTE: não “fingir” sucesso
      if (error) {
        console.error("update-user invoke error:", error);
        alert(`Falha ao salvar: ${error.message}`);
        return;
      }

      // Alguns setups retornam string / formato diferente.
      // Aqui a regra é: só considero salvo se data.ok === true.
      if (!data || data.ok !== true) {
        console.error("update-user response inesperada:", data);
        alert("Não foi possível confirmar o salvamento. Veja o console.");
        return;
      }

      // Atualiza UI local otimista
      const newName = (data.profile?.name as string | undefined) ?? name;

      setProfiles((prev) =>
        prev.map((p) => (p.id === selected.id ? { ...p, name: newName } : p))
      );

      // RECARREGA DO BANCO pra você “ver com certeza” que salvou
      await loadUsers(false);

      setEditOpen(false);
      // Mantém detalhes aberto, mas atualiza selected com o dado novo
      setSelected((prev) => (prev ? { ...prev, name: newName } : prev));

      alert("Salvo com sucesso ✅");
    } catch (e) {
      console.error("Erro inesperado saveEdit:", e);
      alert("Erro inesperado ao salvar. Veja o console.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-xl">Usuários</CardTitle>
          <div className="text-sm text-muted-foreground">
            Clique em um usuário para ver detalhes. Depois edite se precisar.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou id..."
            className="w-[260px]"
          />
          <Button
            variant="outline"
            onClick={() => loadUsers(false)}
            disabled={loading || reloading}
          >
            {reloading ? "Recarregando..." : "Recarregar"}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Nenhum usuário encontrado.
            <div className="mt-2 text-xs">
              Se você esperava ver usuários aqui e não aparece nada, pode ser{" "}
              <b>RLS bloqueando SELECT em profiles</b> (olhe o console).
            </div>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[360px]">Nome</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead className="w-[170px]">Status</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => openDetails(p)}
                    title="Clique para ver detalhes"
                  >
                    <TableCell className="font-medium">
                      {p.name ? (
                        p.name
                      ) : (
                        <span className="text-muted-foreground italic">
                          sem nome
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="font-mono text-xs">{p.id}</TableCell>

                    <TableCell>
                      {p.name ? (
                        <Badge variant="secondary" className="rounded-xl">
                          perfil ok
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-xl">
                          incompleto
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* MODAL DETALHES */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Detalhes do usuário</DialogTitle>
            </DialogHeader>

            {!selected ? (
              <div className="text-sm text-muted-foreground">
                Nenhum usuário selecionado.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <div className="rounded-xl border px-3 py-2">
                    {selected.name || (
                      <span className="text-muted-foreground italic">
                        sem nome
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>ID</Label>
                  <div className="rounded-xl border px-3 py-2 font-mono text-xs">
                    {selected.id}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Criado em
                    </div>
                    <div className="text-sm">
                      {formatDate(selected.created_at)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Atualizado em
                    </div>
                    <div className="text-sm">
                      {formatDate(selected.updated_at)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                    Fechar
                  </Button>
                  <Button onClick={() => openEdit()}>
                    Editar
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground">
                  Se “salvar” mas não mudar aqui, o problema quase sempre é:
                  coluna errada (ex: <code>full_name</code> em vez de <code>name</code>)
                  ou você está olhando outra tabela/coluna.
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* MODAL EDITAR */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Editar usuário</DialogTitle>
            </DialogHeader>

            {!selected ? (
              <div className="text-sm text-muted-foreground">
                Nenhum usuário selecionado.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>ID</Label>
                  <Input value={selected.id} readOnly className="font-mono text-xs" />
                </div>

                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nome do usuário"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setEditOpen(false)}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={saveEdit} disabled={saving}>
                    {saving ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}