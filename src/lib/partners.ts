import { hasSupabaseEnv, supabase } from "@/src/lib/supabase";

export interface PartnerProfile {
  id: string;
  name: string;
  address: string;
  hours: string;
  phone: string;
  hourlyPrice: number;
  bayIds: string[];
  bayCount: number;
  activeBayCount: number;
}

interface PartnerRow {
  id: string;
  name: string;
  address: string;
  hours: string | null;
  phone: string | null;
  hourly_price: number | null;
}

interface BayRow {
  id: string;
  partner_id: string;
  is_active: boolean;
}

export async function getPartnerProfileById(
  partnerId: string,
): Promise<PartnerProfile | null> {
  if (!hasSupabaseEnv) {
    return null;
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id,name,address,hours,phone,hourly_price")
    .eq("id", partnerId)
    .maybeSingle<PartnerRow>();

  if (partnerError || !partner) {
    console.error("PARTNER LOOKUP ERROR:", partnerError);
    return null;
  }

  const { data: bays, error: bayError } = await supabase
    .from("bays")
    .select("id,partner_id,is_active")
    .eq("partner_id", partnerId)
    .returns<BayRow[]>();

  if (bayError) {
    console.error("BAY LOOKUP ERROR:", bayError);
    return null;
  }

  const allBays = bays ?? [];
  const bayIds = allBays.filter((bay) => bay.is_active).map((bay) => bay.id);
  const hourlyPrice = Number(partner.hourly_price);

  return {
    id: partner.id,
    name: partner.name,
    address: partner.address,
    hours: partner.hours ?? "운영시간 정보 준비중",
    phone: partner.phone ?? "전화번호 정보 준비중",
    hourlyPrice: Number.isFinite(hourlyPrice) ? hourlyPrice : 0,
    bayIds,
    bayCount: allBays.length,
    activeBayCount: bayIds.length,
  };
}
