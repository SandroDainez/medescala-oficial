import { supabase } from "@/integrations/supabase/client";

export function useUserDetails(tenantId: string) {

  async function loadUserDetails(userId: string) {
    if (!tenantId) return null;

    // 1️⃣ Buscar todos os setores do hospital
    const { data: sectors, error: sectorsError } = await supabase
      .from("sectors")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("name");

    if (sectorsError) {
      console.error("Erro ao buscar setores:", sectorsError);
      return null;
    }

    // 2️⃣ Buscar setores que o usuário pertence
    const { data: memberships, error: membershipsError } = await supabase
      .from("sector_memberships")
      .select("sector_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId);

    if (membershipsError) {
      console.error("Erro ao buscar setores do usuário:", membershipsError);
      return null;
    }

    const userSectors = memberships?.map((m) => m.sector_id) ?? [];

    return {
      sectors: sectors ?? [],
      userSectors,
    };
  }

  async function updateUserSectors(
    userId: string,
    previous: string[],
    current: string[]
  ) {
    if (!tenantId) return;

    const toInsert = current.filter((id) => !previous.includes(id));
    const toDelete = previous.filter((id) => !current.includes(id));

    // Inserir novos
    if (toInsert.length > 0) {
      const insertPayload = toInsert.map((sectorId) => ({
        tenant_id: tenantId,
        user_id: userId,
        sector_id: sectorId,
      }));

      await supabase.from("sector_memberships").insert(insertPayload);
    }

    // Remover antigos
    if (toDelete.length > 0) {
      await supabase
        .from("sector_memberships")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .in("sector_id", toDelete);
    }
  }

  return {
    loadUserDetails,
    updateUserSectors,
  };
}
