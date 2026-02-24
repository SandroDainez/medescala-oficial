"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

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

type UserRow = {
  membership_id: string;
  user_id: string;
  name: string | null;
  role: string;
  active: boolean;
  created_at: string | null;
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
  const { currentTenantId } = useTenant();

  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [query, setQuery] = useState("");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [selected, setSelected] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");

  async function loadUsers(showSpinner = true) {
    if (!currentTenantId) return;

    if (showSpinner) setLoading(true);
    else setReloading(true);

    try {
      const { data, error } = await supabase
        .from("memberships")
        .select(`
          id,
          role,
          active,
          profiles (
            id,
            name,
            created_at
          )
        `)
        .eq("tenant_id", currentTenantId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao buscar usuários:", error);
        setUsers([]);
        return;
      }

      const formatted =
        data?.map((m: any) => ({
          membership_id: m.id,
          user_id: m.profiles?.id,
          name: m.profiles?.name,
          role: m.role,
          active: m.active,
          created_at: m.profiles?.created_at,
        })) || [];

      setUsers(formatted);
    } catch (e) {
      console.error("Erro inesperado:", e);
      setUsers([]);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }

  useEffect(() => {
    loadUsers(true);
  }, [currentTenantId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = (u.name || "").toLowerCase();
      const id = (u.user_id || "").toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [users, query]);

  function openDetails(u: UserRow) {
    setSelected(u);
    setDetailsOpen(true);
  }

  function openEdit() {
    if (!selected) return;
    setEditName(selected.name || "");
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selected) return;

    const name = editName.trim();
    if (!name) {
      alert("Nome não pode ficar vazio.");
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase.functions.invoke("update-user", {
        body: {
          userId: selected.user_id,
          name,
        },
      });

      if (error) {
        console.error("Erro invoke update-user:", error);
        alert("Erro ao salvar.");
        return;
      }

      if (!data || data.ok !== true) {
        console.error("Resposta inesperada:", data);
        alert("Não foi possível confirmar salvamento.");
        return;
      }

      // Atualização otimista
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === selected.user_id ? { ...u, name } : u
        )
      );

      await loadUsers(false);

      setSelected((prev) =>
        prev ? { ...prev, name } : prev
      );

      setEditOpen(false);
      alert("Salvo com sucesso ✅");
    } catch (e) {
      console.error("Erro inesperado:", e);
      alert("Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-xl">Usuários do Hospital</CardTitle>
          <div className="text-sm text-muted-foreground">
            Apenas usuários vinculados ao hospital atual.
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
            Nenhum usuário vinculado a este hospital.
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((u) => (
                  <TableRow
                    key={u.membership_id}
                    className="cursor-pointer"
                    onClick={() => openDetails(u)}
                  >
                    <TableCell>
                      {u.name || (
                        <span className="text-muted-foreground italic">
                          sem nome
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge variant="secondary">{u.role}</Badge>
                    </TableCell>

                    <TableCell>
                      {u.active ? (
                        <Badge className="bg-green-600 text-white">
                          ativo
                        </Badge>
                      ) : (
                        <Badge variant="outline">inativo</Badge>
                      )}
                    </TableCell>

                    <TableCell>{formatDate(u.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Detalhes do usuário</DialogTitle>
            </DialogHeader>

            {!selected ? null : (
              <div className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <div className="border rounded-xl px-3 py-2">
                    {selected.name || "sem nome"}
                  </div>
                </div>

                <div>
                  <Label>Role</Label>
                  <div className="border rounded-xl px-3 py-2">
                    {selected.role}
                  </div>
                </div>

                <div>
                  <Label>Status</Label>
                  <div className="border rounded-xl px-3 py-2">
                    {selected.active ? "Ativo" : "Inativo"}
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                    Fechar
                  </Button>
                  <Button onClick={openEdit}>
                    Editar Nome
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar nome do usuário</DialogTitle>
            </DialogHeader>

            {!selected ? null : (
              <div className="space-y-4">
                <div>
                  <Label>ID</Label>
                  <Input value={selected.user_id} readOnly />
                </div>

                <div>
                  <Label>Novo Nome</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 justify-end">
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