import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { useToast } from "./useToast";
import { buildAliasIndex, canonicalDriver, computeColeta, recompute, type ColetaResult } from "../lib/compute";
import { todayISO } from "../lib/format";
import type {
  Base,
  BaseRole,
  DayRecord,
  Driver,
  DriverAdjustment,
  Member,
  Occurrence,
  OrgMember,
  OrgRole,
  Organization,
  Payout,
  PayoutBreakdownRow,
  PayoutItem,
  PaymentRule,
  SheetTable,
  SpecialDay,
} from "../lib/types";

interface DocaState {
  ready: boolean;
  bases: Base[];
  curBase: Base | null;
  role: BaseRole | null;
  canEdit: boolean;
  drivers: Driver[];
  history: DayRecord[];
  occurrences: Occurrence[];
  payouts: Payout[];
  members: Member[];
  isSuperAdmin: boolean;
  orgs: Organization[];
  orgRoles: Record<string, OrgRole>;
  orgMembers: OrgMember[];
  loadOrgMembers: (orgId: string) => Promise<void>;
  createOrganization: (name: string, adminEmail: string) => Promise<boolean>;
  inviteOrgMember: (orgId: string, email: string, role: OrgRole) => Promise<boolean>;
  updateOrgMemberRole: (orgId: string, userId: string, role: OrgRole) => Promise<void>;
  removeOrgMember: (orgId: string, userId: string) => Promise<void>;
  moveBaseToOrg: (baseId: string, orgId: string | null) => Promise<void>;
  paymentRules: PaymentRule[];
  specialDays: SpecialDay[];
  adjustments: DriverAdjustment[];
  dayDate: string;
  sheetBase: SheetTable | null;
  sheetEnt: SheetTable | null;
  sheetColeta: SheetTable | null;
  result: ReturnType<typeof recompute>;
  coletaResult: ColetaResult | null;
  selectBase: (id: string) => Promise<void>;
  createBase: (name: string, orgId?: string | null) => Promise<string>;
  updateBase: (fields: Partial<Base>) => Promise<void>;
  setDayDate: (d: string) => void;
  setSheetBase: (t: SheetTable | null) => void;
  setSheetEnt: (t: SheetTable | null) => void;
  setSheetColeta: (t: SheetTable | null) => void;
  addDriver: (name: string) => Promise<void>;
  updateDriver: (id: string, fields: Partial<Driver>) => Promise<void>;
  deleteDriver: (id: string) => Promise<void>;
  saveDay: () => Promise<boolean>;
  deleteDay: (data: string) => Promise<void>;
  saveOccurrence: (row: Occurrence) => Promise<void>;
  occRows: () => Occurrence[];
  generatePayout: (start: string, end: string) => Promise<Payout | null>;
  updatePayoutItem: (payoutId: string, index: number, adjustments: number, note: string) => Promise<void>;
  updatePayoutDiscounts: (payoutId: string, index: number, discounts: PayoutItem["discounts"]) => Promise<void>;
  setPayoutStatus: (payoutId: string, status: Payout["status"]) => Promise<void>;
  deletePayout: (payoutId: string) => Promise<void>;
  inviteMember: (email: string, role: "editor" | "viewer") => Promise<boolean>;
  updateMemberRole: (userId: string, role: "editor" | "viewer") => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  savePaymentRule: (rule: Partial<PaymentRule> & { amount: number }) => Promise<void>;
  deletePaymentRule: (id: string) => Promise<void>;
  saveSpecialDay: (day: Partial<SpecialDay> & { amount: number }) => Promise<void>;
  deleteSpecialDay: (id: string) => Promise<void>;
  saveAdjustment: (adj: Pick<DriverAdjustment, "driver_id" | "data" | "motivo" | "valor">) => Promise<void>;
  deleteAdjustment: (id: string) => Promise<void>;
}

const DocaCtx = createContext<DocaState | null>(null);

export function DocaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();

  const [bases, setBases] = useState<Base[]>([]);
  const [curBase, setCurBase] = useState<Base | null>(null);
  const [role, setRole] = useState<BaseRole | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [history, setHistory] = useState<DayRecord[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgRoles, setOrgRoles] = useState<Record<string, OrgRole>>({});
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [paymentRules, setPaymentRules] = useState<PaymentRule[]>([]);
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
  const [adjustments, setAdjustments] = useState<DriverAdjustment[]>([]);
  const [dayDate, setDayDate] = useState(todayISO());
  const [sheetBase, setSheetBase] = useState<SheetTable | null>(null);
  const [sheetEnt, setSheetEnt] = useState<SheetTable | null>(null);
  const [sheetColeta, setSheetColeta] = useState<SheetTable | null>(null);
  const [ready, setReady] = useState(false);

  const aliasIdx = useMemo(() => buildAliasIndex(drivers), [drivers]);
  const result = useMemo(
    () => recompute(sheetBase, sheetEnt, aliasIdx, !!curBase?.expurgar_insucessos),
    [sheetBase, sheetEnt, aliasIdx, curBase?.expurgar_insucessos]
  );
  const coletaResult = useMemo(() => computeColeta(sheetColeta), [sheetColeta]);

  const loadBases = useCallback(async () => {
    const { data, error } = await supabase.from("bases").select("*").order("name");
    if (error) {
      toast("Não consegui carregar as bases: " + error.message);
      setReady(true);
      return;
    }
    setBases((data as Base[]) || []);
    setReady(true);
  }, [toast]);

  const loadOrgs = useCallback(async () => {
    if (!user) return;
    const [{ data: sa }, { data: orgRows }, { data: mine }] = await Promise.all([
      supabase.rpc("is_super_admin"),
      supabase.from("organizations").select("id,name,created_at").order("name"),
      supabase.from("org_members").select("org_id,role").eq("user_id", user.id),
    ]);
    setIsSuperAdmin(!!sa);
    setOrgs((orgRows as Organization[]) || []);
    setOrgRoles(Object.fromEntries(((mine as { org_id: string; role: OrgRole }[]) || []).map((r) => [r.org_id, r.role])));
  }, [user]);

  const loadOrgMembers = useCallback(
    async (orgId: string) => {
      const { data: rows, error } = await supabase.from("org_members").select("org_id,user_id,role").eq("org_id", orgId);
      if (error) {
        toast("Não consegui carregar os membros da organização: " + error.message);
        return;
      }
      const ids = (rows || []).map((r) => r.user_id);
      let profiles: { id: string; email: string }[] = [];
      if (ids.length) {
        const { data: pdata } = await supabase.from("profiles").select("id,email").in("id", ids);
        profiles = pdata || [];
      }
      const emailOf = new Map(profiles.map((p) => [p.id, p.email]));
      setOrgMembers((rows || []).map((r) => ({ ...r, email: emailOf.get(r.user_id) || "" })) as OrgMember[]);
    },
    [toast]
  );

  useEffect(() => {
    if (user) {
      loadBases();
      loadOrgs();
    } else {
      setBases([]);
      setOrgs([]);
      setOrgRoles({});
      setIsSuperAdmin(false);
      setCurBase(null);
      setReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadDrivers = useCallback(
    async (baseId: string) => {
      const { data, error } = await supabase.from("drivers").select("*").eq("base_id", baseId).order("name");
      if (error) {
        toast("Não consegui carregar motoristas: " + error.message);
        return;
      }
      setDrivers((data as Driver[]) || []);
    },
    [toast]
  );

  const loadHistory = useCallback(
    async (baseId: string) => {
      const { data, error } = await supabase.from("days").select("*").eq("base_id", baseId).order("data");
      if (error) {
        toast("Não consegui carregar o histórico: " + error.message);
        return;
      }
      setHistory((data as DayRecord[]) || []);
    },
    [toast]
  );

  const loadOccurrences = useCallback(
    async (baseId: string) => {
      const { data, error } = await supabase.from("occurrences").select("*").eq("base_id", baseId);
      if (error) {
        toast("Não consegui carregar ocorrências: " + error.message);
        return;
      }
      setOccurrences((data as Occurrence[]) || []);
    },
    [toast]
  );

  const loadPayouts = useCallback(
    async (baseId: string) => {
      const { data, error } = await supabase
        .from("payouts")
        .select("*")
        .eq("base_id", baseId)
        .order("period_end", { ascending: false });
      if (error) {
        toast("Não consegui carregar fechamentos: " + error.message);
        return;
      }
      setPayouts((data as Payout[]) || []);
    },
    [toast]
  );

  const loadMembers = useCallback(
    async (baseId: string) => {
      const { data: rows, error } = await supabase.from("base_members").select("base_id,user_id,role").eq("base_id", baseId);
      if (error) {
        toast("Não consegui carregar os membros: " + error.message);
        return;
      }
      const ids = (rows || []).map((r) => r.user_id);
      let profiles: { id: string; email: string }[] = [];
      if (ids.length) {
        const { data: pdata } = await supabase.from("profiles").select("id,email").in("id", ids);
        profiles = pdata || [];
      }
      const emailOf = new Map(profiles.map((p) => [p.id, p.email]));
      setMembers((rows || []).map((r) => ({ ...r, email: emailOf.get(r.user_id) || "" })) as Member[]);
    },
    [toast]
  );

  const loadPaymentRules = useCallback(
    async (baseId: string) => {
      const { data, error } = await supabase.from("payment_rules").select("*").eq("base_id", baseId);
      if (error) {
        toast("Não consegui carregar a tabela de preços: " + error.message);
        return;
      }
      setPaymentRules((data as PaymentRule[]) || []);
    },
    [toast]
  );

  const loadSpecialDays = useCallback(
    async (baseId: string) => {
      const { data, error } = await supabase.from("special_days").select("*").eq("base_id", baseId);
      if (error) {
        toast("Não consegui carregar os dias especiais: " + error.message);
        return;
      }
      setSpecialDays((data as SpecialDay[]) || []);
    },
    [toast]
  );

  const loadAdjustments = useCallback(
    async (baseId: string) => {
      const { data, error } = await supabase
        .from("driver_adjustments")
        .select("*")
        .eq("base_id", baseId)
        .order("data", { ascending: false });
      if (error) {
        toast("Não consegui carregar os ajustes: " + error.message);
        return;
      }
      setAdjustments((data as DriverAdjustment[]) || []);
    },
    [toast]
  );

  const loadRole = useCallback(
    async (baseId: string) => {
      if (!user) return;
      const { data } = await supabase.rpc("base_role", { b_id: baseId });
      setRole((data as BaseRole | null) ?? "viewer");
    },
    [user]
  );

  const selectBase = useCallback(
    async (id: string) => {
      const b = bases.find((x) => x.id === id) || null;
      setCurBase(b);
      setSheetBase(null);
      setSheetEnt(null);
      setSheetColeta(null);
      if (!b) return;
      localStorage.setItem("doca.curBase", id);
      await Promise.all([
        loadDrivers(id),
        loadHistory(id),
        loadOccurrences(id),
        loadPayouts(id),
        loadRole(id),
        loadMembers(id),
        loadPaymentRules(id),
        loadSpecialDays(id),
        loadAdjustments(id),
      ]);
    },
    [
      bases,
      loadDrivers,
      loadHistory,
      loadOccurrences,
      loadPayouts,
      loadRole,
      loadMembers,
      loadPaymentRules,
      loadSpecialDays,
      loadAdjustments,
    ]
  );

  useEffect(() => {
    if (!ready || !bases.length || curBase) return;
    const pref = localStorage.getItem("doca.curBase");
    const target = bases.find((b) => b.id === pref) || bases[0];
    selectBase(target.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, bases]);

  const createBase = useCallback(
    async (name: string, orgId?: string | null) => {
      if (!user) throw new Error("not signed in");
      const { data, error } = await supabase
        .from("bases")
        .insert({ name: name.trim(), owner_id: user.id, ...(orgId ? { org_id: orgId } : {}) })
        .select()
        .single();
      if (error) {
        toast("Não consegui criar a base: " + error.message);
        throw error;
      }
      await loadBases();
      return (data as Base).id;
    },
    [user, toast, loadBases]
  );

  const updateBase = useCallback(
    async (fields: Partial<Base>) => {
      if (!curBase) return;
      const { error } = await supabase.from("bases").update(fields).eq("id", curBase.id);
      if (error) {
        toast("Não consegui salvar: " + error.message);
        return;
      }
      setCurBase({ ...curBase, ...fields });
      setBases((prev) => prev.map((b) => (b.id === curBase.id ? { ...b, ...fields } : b)));
      toast("Ajustes salvos");
    },
    [curBase, toast]
  );

  const addDriver = useCallback(
    async (name: string) => {
      if (!curBase) return;
      const { error } = await supabase.from("drivers").insert({ base_id: curBase.id, name: name.trim() });
      if (error) {
        toast("Não consegui adicionar: " + error.message);
        return;
      }
      await loadDrivers(curBase.id);
    },
    [curBase, toast, loadDrivers]
  );

  const updateDriver = useCallback(
    async (id: string, fields: Partial<Driver>) => {
      const { error } = await supabase.from("drivers").update(fields).eq("id", id);
      if (error) {
        toast("Não consegui salvar: " + error.message);
        return;
      }
      if (curBase) await loadDrivers(curBase.id);
    },
    [curBase, toast, loadDrivers]
  );

  const deleteDriver = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("drivers").delete().eq("id", id);
      if (error) {
        toast("Não consegui excluir: " + error.message);
        return;
      }
      if (curBase) await loadDrivers(curBase.id);
    },
    [curBase, toast, loadDrivers]
  );

  const saveDay = useCallback(async () => {
    if (!curBase || !result) return false;
    // Agregados avançados do dia — persistidos para virar tendência em Histórico
    // (sem isso, tipo de produto/pagamento/peso/SLA se perdiam ao salvar o dia).
    const itens = result.list.flatMap((d) => d.itens);
    const comHorarios = itens.filter((it) => it.hr_saida && it.hr_chegada);
    const slaOk = comHorarios.filter((it) => it.sla_ok).length;
    const pesoTotal = itens.reduce((a, it) => a + (it.peso || 0), 0);
    const pagamentos: Record<string, number> = {};
    const tiposProduto: Record<string, number> = {};
    for (const it of itens) {
      if (it.pagamento) pagamentos[it.pagamento] = (pagamentos[it.pagamento] || 0) + 1;
      if (it.tipo_produto) tiposProduto[it.tipo_produto] = (tiposProduto[it.tipo_produto] || 0) + 1;
    }
    const row = {
      base_id: curBase.id,
      data: dayDate,
      meta: curBase.meta,
      total: result.tot.t,
      entregues: result.tot.e,
      problemas: result.tot.p,
      pendentes: result.tot.n,
      motoristas: result.list.map((d) => ({
        n: d.nome,
        t: d.t,
        e: d.e,
        p: d.p,
        q: d.n,
        b: result.porBairro[d.nome] || {},
      })),
      motivos: result.motivos,
      salvo_por: user?.email || "",
      linhas_descartadas: result.linhasDescartadas,
      coleta_total: coletaResult?.total || 0,
      coleta_feita: coletaResult?.feita || 0,
      coleta_falha_bipagem: coletaResult?.falhaBipagem || 0,
      retido_base: result.tot.retidoBase,
      devolucao: result.tot.devolucao,
      com_assinatura: result.tot.comAssinatura,
      sla_ok: slaOk,
      sla_total: comHorarios.length,
      peso_total: pesoTotal,
      bloqueados: result.bloqueados.length,
      divergentes: result.divergentes.length,
      pagamentos,
      tipos_produto: tiposProduto,
    };
    const { error } = await supabase.from("days").upsert(row, { onConflict: "base_id,data" });
    if (error) {
      toast("Não consegui salvar o dia: " + error.message);
      return false;
    }
    await loadHistory(curBase.id);
    toast(`Dia ${dayDate.split("-").reverse().join("/")} salvo no histórico`);

    if (curBase.auto_send_webhook && curBase.whatsapp_webhook) {
      const payload = {
        base: curBase.name,
        data: dayDate,
        total: result.tot.t,
        entregues: result.tot.e,
        problemas: result.tot.p,
        nao_entregues: result.tot.n,
        pct_entregue: result.tot.t ? result.tot.e / result.tot.t : 0,
        retido_base: result.tot.retidoBase,
        devolucao: result.tot.devolucao,
        com_assinatura: result.tot.comAssinatura,
        coleta_total: coletaResult?.total || 0,
        coleta_feita: coletaResult?.feita || 0,
        motoristas: result.list.map((d) => ({ nome: d.nome, pacotes: d.t, entregues: d.e, percentual: +(d.pct * 100).toFixed(1) })),
      };
      try {
        const resp = await fetch(curBase.whatsapp_webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) toast(`Dia salvo, mas o webhook respondeu com erro (${resp.status})`);
      } catch {
        toast("Dia salvo, mas não consegui chamar o webhook configurado — confira o endereço em Integrações");
      }
    }
    return true;
  }, [curBase, result, coletaResult, dayDate, user, toast, loadHistory]);

  const deleteDay = useCallback(
    async (data: string) => {
      if (!curBase) return;
      const { error } = await supabase.from("days").delete().eq("base_id", curBase.id).eq("data", data);
      if (error) {
        toast("Não consegui apagar: " + error.message);
        return;
      }
      await loadHistory(curBase.id);
      toast("Registro apagado");
    },
    [curBase, toast, loadHistory]
  );

  const occRows = useCallback((): Occurrence[] => {
    const map = new Map<string, Occurrence>();
    for (const o of occurrences) map.set(o.code, { ...o });
    if (result)
      for (const d of result.list)
        for (const it of d.itens)
          if (it.st === "p" && !map.has(it.c))
            map.set(it.c, {
              base_id: curBase?.id || "",
              code: it.c,
              driver: d.nome,
              motivo: it.prob,
              nota: "",
              responsavel: "",
              resolvido: false,
              status: "aberto",
            });
    return [...map.values()].sort((a, b) => Number(a.resolvido) - Number(b.resolvido));
  }, [occurrences, result, curBase]);

  const saveOccurrence = useCallback(
    async (row: Occurrence) => {
      if (!curBase) return;
      const { error } = await supabase
        .from("occurrences")
        .upsert({ ...row, base_id: curBase.id }, { onConflict: "base_id,code" });
      if (error) {
        toast("Não consegui salvar: " + error.message);
        return;
      }
      await loadOccurrences(curBase.id);
      toast("Tratativa salva");
    },
    [curBase, toast, loadOccurrences]
  );

  // Acréscimo do dia: 1) data exata  2) dia da semana recorrente  3) 0
  const acrescimoDia = useCallback(
    (dateISO: string) => {
      const exact = specialDays.find((s) => s.day_date === dateISO);
      if (exact) return exact.amount;
      const weekday = new Date(dateISO + "T00:00:00").getDay();
      const rec = specialDays.find((s) => s.weekday === weekday);
      return rec ? rec.amount : 0;
    },
    [specialDays]
  );

  // Hierarquia: motorista+bairro > bairro (todos) > motorista (todo bairro) > drivers.rate legado
  //             > padrão da base (payment_rules sem motorista/bairro) > bases.rate legado > sem valor
  const baseRateFor = useCallback(
    (driverId: string | undefined, driverName: string, bairro: string): { valor: number | null; origem: PayoutBreakdownRow["origem"] } => {
      const b = bairro || "Sem bairro";
      const combo = driverId && paymentRules.find((r) => r.driver_id === driverId && r.bairro === b);
      if (combo) return { valor: combo.amount, origem: "bairro" };
      const bairroDefault = paymentRules.find((r) => r.driver_id === null && r.bairro === b);
      if (bairroDefault) return { valor: bairroDefault.amount, origem: "bairro" };
      const driverGeneral = driverId && paymentRules.find((r) => r.driver_id === driverId && r.bairro === "");
      if (driverGeneral) return { valor: driverGeneral.amount, origem: "motorista" };
      const legacyDriver = drivers.find((x) => x.id === driverId || x.name === driverName);
      if (legacyDriver && legacyDriver.rate != null) return { valor: legacyDriver.rate, origem: "motorista" };
      const baseDefault = paymentRules.find((r) => r.driver_id === null && r.bairro === "");
      if (baseDefault) return { valor: baseDefault.amount, origem: "motorista" };
      if (curBase?.rate) return { valor: curBase.rate, origem: "motorista" };
      return { valor: null, origem: "sem_valor" };
    },
    [paymentRules, drivers, curBase]
  );

  const generatePayout = useCallback(
    async (start: string, end: string) => {
      if (!curBase) return null;
      const byDriver = new Map<string, { deliveries: number; breakdown: PayoutBreakdownRow[]; pendente: boolean }>();

      for (const h of history) {
        if (h.data < start || h.data > end) continue;
        const acresc = acrescimoDia(h.data);
        for (const m of h.motoristas) {
          if (!byDriver.has(m.n)) byDriver.set(m.n, { deliveries: 0, breakdown: [], pendente: false });
          const agg = byDriver.get(m.n)!;
          const driverId = drivers.find((x) => x.name === m.n)?.id;
          const bairros = m.b && Object.keys(m.b).length ? m.b : { "Sem bairro": m.e };
          for (const [bairro, qtd] of Object.entries(bairros)) {
            if (!qtd) continue;
            const dia = h.data;
            const isEspecial = specialDays.some((s) => s.day_date === dia) || specialDays.some((s) => s.weekday === new Date(dia + "T00:00:00").getDay());
            const { valor, origem } = baseRateFor(driverId, m.n, bairro);
            agg.deliveries += qtd;
            if (valor == null) {
              agg.pendente = true;
              agg.breakdown.push({ bairro, data: dia, entregas: qtd, valorUnit: 0, origem: "sem_valor", subtotal: 0 });
              continue;
            }
            const valorUnit = +(valor + acresc).toFixed(2);
            agg.breakdown.push({
              bairro,
              data: dia,
              entregas: qtd,
              valorUnit,
              origem: isEspecial ? "dia_especial" : origem,
              subtotal: +(valorUnit * qtd).toFixed(2),
            });
          }
        }
      }

      if (!byDriver.size) {
        toast("Nenhum dia salvo nesse período");
        return null;
      }

      const pendingAdj = adjustments.filter((a) => !a.applied_payout_id && a.data >= start && a.data <= end);

      const items: PayoutItem[] = [...byDriver.entries()]
        .map(([driver, agg]) => {
          const gross = +agg.breakdown.reduce((a, r) => a + r.subtotal, 0).toFixed(2);
          const rateMedio = agg.deliveries ? +(gross / agg.deliveries).toFixed(2) : 0;
          const driverId = drivers.find((x) => x.name === driver)?.id;
          const discounts = pendingAdj
            .filter((a) => a.driver_id === driverId)
            .map((a) => ({ motivo: a.motivo, valor: a.valor }));
          const discTotal = discounts.reduce((a, d) => a + d.valor, 0);
          return {
            driver,
            deliveries: agg.deliveries,
            rate: rateMedio,
            gross,
            adjustments: 0,
            note: "",
            net: +(gross + discTotal).toFixed(2),
            breakdown: agg.breakdown,
            discounts,
            pendente: agg.pendente,
          };
        })
        .sort((a, b) => b.net - a.net);
      const { data, error } = await supabase
        .from("payouts")
        .insert({ base_id: curBase.id, period_start: start, period_end: end, status: "rascunho", items })
        .select()
        .single();
      if (error) {
        toast("Não consegui gerar: " + error.message);
        return null;
      }
      const appliedIds = pendingAdj.map((a) => a.id);
      if (appliedIds.length) {
        await supabase.from("driver_adjustments").update({ applied_payout_id: (data as Payout).id }).in("id", appliedIds);
        await loadAdjustments(curBase.id);
      }
      await loadPayouts(curBase.id);
      toast("Rascunho gerado" + (items.some((i) => i.pendente) ? " — há entregas sem valor definido (fica marcado como parcial)" : ""));
      return data as Payout;
    },
    [curBase, history, drivers, specialDays, adjustments, acrescimoDia, baseRateFor, toast, loadPayouts, loadAdjustments]
  );

  const updatePayoutItem = useCallback(
    async (payoutId: string, index: number, adjustments: number, note: string) => {
      const p = payouts.find((x) => x.id === payoutId);
      if (!p) return;
      const items = p.items.map((it, i) => {
        if (i !== index) return it;
        const discTotal = (it.discounts || []).reduce((a, d) => a + d.valor, 0);
        return { ...it, adjustments, note, net: +(it.gross + adjustments + discTotal).toFixed(2) };
      });
      const { error } = await supabase.from("payouts").update({ items }).eq("id", payoutId);
      if (error) {
        toast("Não consegui salvar: " + error.message);
        return;
      }
      if (curBase) await loadPayouts(curBase.id);
    },
    [payouts, curBase, toast, loadPayouts]
  );

  const updatePayoutDiscounts = useCallback(
    async (payoutId: string, index: number, discounts: PayoutItem["discounts"]) => {
      const p = payouts.find((x) => x.id === payoutId);
      if (!p) return;
      const items = p.items.map((it, i) => {
        if (i !== index) return it;
        const discTotal = (discounts || []).reduce((a, d) => a + d.valor, 0);
        return { ...it, discounts, net: +(it.gross + it.adjustments + discTotal).toFixed(2) };
      });
      const { error } = await supabase.from("payouts").update({ items }).eq("id", payoutId);
      if (error) {
        toast("Não consegui salvar: " + error.message);
        return;
      }
      if (curBase) await loadPayouts(curBase.id);
    },
    [payouts, curBase, toast, loadPayouts]
  );

  const setPayoutStatus = useCallback(
    async (payoutId: string, status: Payout["status"]) => {
      const fields: Partial<Payout> = { status };
      if (status === "fechado") {
        fields.closed_at = new Date().toISOString();
        fields.closed_by = user?.email || "";
      }
      const { error } = await supabase.from("payouts").update(fields).eq("id", payoutId);
      if (error) {
        toast("Não consegui salvar: " + error.message);
        return;
      }
      if (curBase) await loadPayouts(curBase.id);
    },
    [user, curBase, toast, loadPayouts]
  );

  const deletePayout = useCallback(
    async (payoutId: string) => {
      const { error } = await supabase.from("payouts").delete().eq("id", payoutId);
      if (error) {
        toast("Não consegui excluir: " + error.message);
        return;
      }
      if (curBase) await loadPayouts(curBase.id);
    },
    [curBase, toast, loadPayouts]
  );

  const inviteMember = useCallback(
    async (email: string, role: "editor" | "viewer") => {
      if (!curBase) return false;
      const { error } = await supabase.rpc("invite_member", { p_base_id: curBase.id, p_email: email.trim(), p_role: role });
      if (error) {
        toast(error.message);
        return false;
      }
      await loadMembers(curBase.id);
      toast("Membro adicionado");
      return true;
    },
    [curBase, toast, loadMembers]
  );

  const updateMemberRole = useCallback(
    async (userId: string, role: "editor" | "viewer") => {
      if (!curBase) return;
      const { error } = await supabase.rpc("update_member_role", { p_base_id: curBase.id, p_user_id: userId, p_role: role });
      if (error) {
        toast(error.message);
        return;
      }
      await loadMembers(curBase.id);
      toast("Papel atualizado");
    },
    [curBase, toast, loadMembers]
  );

  const removeMember = useCallback(
    async (userId: string) => {
      if (!curBase) return;
      const { error } = await supabase.rpc("remove_member", { p_base_id: curBase.id, p_user_id: userId });
      if (error) {
        toast(error.message);
        return;
      }
      await loadMembers(curBase.id);
      toast("Membro removido");
    },
    [curBase, toast, loadMembers]
  );

  const savePaymentRule = useCallback(
    async (rule: Partial<PaymentRule> & { amount: number }) => {
      if (!curBase) return;
      const row = { base_id: curBase.id, driver_id: rule.driver_id ?? null, bairro: rule.bairro ?? "", amount: rule.amount };
      const { error } = await supabase.from("payment_rules").upsert(row, { onConflict: "base_id,driver_id,bairro" });
      if (error) {
        toast("Não consegui salvar o preço: " + error.message);
        return;
      }
      await loadPaymentRules(curBase.id);
      toast("Preço salvo");
    },
    [curBase, toast, loadPaymentRules]
  );

  const deletePaymentRule = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("payment_rules").delete().eq("id", id);
      if (error) {
        toast("Não consegui excluir: " + error.message);
        return;
      }
      if (curBase) await loadPaymentRules(curBase.id);
    },
    [curBase, toast, loadPaymentRules]
  );

  const saveSpecialDay = useCallback(
    async (day: Partial<SpecialDay> & { amount: number }) => {
      if (!curBase) return;
      const row = {
        base_id: curBase.id,
        day_date: day.day_date ?? null,
        weekday: day.weekday ?? null,
        amount: day.amount,
        label: day.label ?? null,
      };
      const { error } = await supabase.from("special_days").insert(row);
      if (error) {
        toast("Não consegui salvar o dia especial: " + error.message);
        return;
      }
      await loadSpecialDays(curBase.id);
      toast("Dia especial salvo");
    },
    [curBase, toast, loadSpecialDays]
  );

  const deleteSpecialDay = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("special_days").delete().eq("id", id);
      if (error) {
        toast("Não consegui excluir: " + error.message);
        return;
      }
      if (curBase) await loadSpecialDays(curBase.id);
    },
    [curBase, toast, loadSpecialDays]
  );

  const saveAdjustment = useCallback(
    async (adj: Pick<DriverAdjustment, "driver_id" | "data" | "motivo" | "valor">) => {
      if (!curBase) return;
      const { error } = await supabase.from("driver_adjustments").insert({ ...adj, base_id: curBase.id });
      if (error) {
        toast("Não consegui salvar o ajuste: " + error.message);
        return;
      }
      await loadAdjustments(curBase.id);
      toast("Ajuste registrado");
    },
    [curBase, toast, loadAdjustments]
  );

  const deleteAdjustment = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("driver_adjustments").delete().eq("id", id);
      if (error) {
        toast("Não consegui excluir: " + error.message);
        return;
      }
      if (curBase) await loadAdjustments(curBase.id);
    },
    [curBase, toast, loadAdjustments]
  );

  const createOrganization = useCallback(
    async (name: string, adminEmail: string) => {
      const { error } = await supabase.rpc("create_organization", { p_name: name.trim(), p_admin_email: adminEmail.trim() });
      if (error) {
        toast(error.message);
        return false;
      }
      await loadOrgs();
      toast("Organização criada");
      return true;
    },
    [toast, loadOrgs]
  );

  const inviteOrgMember = useCallback(
    async (orgId: string, email: string, role: OrgRole) => {
      const { error } = await supabase.rpc("invite_org_member", { p_org_id: orgId, p_email: email.trim(), p_role: role });
      if (error) {
        toast(error.message);
        return false;
      }
      await loadOrgMembers(orgId);
      toast("Pessoa adicionada à organização");
      return true;
    },
    [toast, loadOrgMembers]
  );

  const updateOrgMemberRole = useCallback(
    async (orgId: string, userId: string, role: OrgRole) => {
      const { error } = await supabase.rpc("update_org_member_role", { p_org_id: orgId, p_user_id: userId, p_role: role });
      if (error) {
        toast(error.message);
        return;
      }
      await loadOrgMembers(orgId);
      toast("Papel atualizado");
    },
    [toast, loadOrgMembers]
  );

  const removeOrgMember = useCallback(
    async (orgId: string, userId: string) => {
      const { error } = await supabase.from("org_members").delete().eq("org_id", orgId).eq("user_id", userId);
      if (error) {
        toast(error.message);
        return;
      }
      await loadOrgMembers(orgId);
      toast("Pessoa removida da organização");
    },
    [toast, loadOrgMembers]
  );

  const moveBaseToOrg = useCallback(
    async (baseId: string, orgId: string | null) => {
      const { error } = await supabase.from("bases").update({ org_id: orgId }).eq("id", baseId);
      if (error) {
        toast(error.message);
        return;
      }
      await loadBases();
      toast("Base atualizada");
    },
    [toast, loadBases]
  );

  const value: DocaState = {
    ready,
    bases,
    curBase,
    role,
    canEdit: role !== "viewer",
    drivers,
    history,
    occurrences,
    payouts,
    members,
    isSuperAdmin,
    orgs,
    orgRoles,
    orgMembers,
    loadOrgMembers,
    createOrganization,
    inviteOrgMember,
    updateOrgMemberRole,
    removeOrgMember,
    moveBaseToOrg,
    paymentRules,
    specialDays,
    adjustments,
    dayDate,
    sheetBase,
    sheetEnt,
    sheetColeta,
    result,
    coletaResult,
    selectBase,
    createBase,
    updateBase,
    setDayDate,
    setSheetBase,
    setSheetEnt,
    setSheetColeta,
    addDriver,
    updateDriver,
    deleteDriver,
    saveDay,
    deleteDay,
    saveOccurrence,
    occRows,
    generatePayout,
    updatePayoutItem,
    updatePayoutDiscounts,
    setPayoutStatus,
    deletePayout,
    inviteMember,
    updateMemberRole,
    removeMember,
    savePaymentRule,
    deletePaymentRule,
    saveSpecialDay,
    deleteSpecialDay,
    saveAdjustment,
    deleteAdjustment,
  };

  return <DocaCtx.Provider value={value}>{children}</DocaCtx.Provider>;
}

export function useDoca() {
  const ctx = useContext(DocaCtx);
  if (!ctx) throw new Error("useDoca must be used inside DocaProvider");
  return ctx;
}

export { canonicalDriver };
