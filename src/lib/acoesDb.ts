import { supabase } from "./supabase";

// Cria um item no plano de ação. `baseline` é o % de entrega dos 7 dias anteriores (para medir o efeito depois).
export async function criarAcao(
  baseId: string,
  userId: string,
  a: { titulo: string; detalhe?: string; responsavel?: string; prazo?: string; origem?: string; baseline: number | null }
): Promise<string | null> {
  const { error } = await supabase.from("action_items").insert({
    base_id: baseId, created_by: userId, titulo: a.titulo.trim(), detalhe: a.detalhe?.trim() || null,
    responsavel: a.responsavel?.trim() || null, prazo: a.prazo || null, origem: a.origem || null, baseline: a.baseline,
  });
  return error ? error.message : null;
}
