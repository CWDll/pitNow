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
    .eq("is_active", true)
    .returns<BayRow[]>();

  if (bayError) {
    console.error("BAY LOOKUP ERROR:", bayError);
    return null;
  }

  const bayIds = (bays ?? []).map((bay) => bay.id);

  return {
    id: partner.id,
    name: partner.name,
    address: partner.address,
    hours: partner.hours ?? "운영시간 정보 준비중",
    phone: partner.phone ?? "전화번호 정보 준비중",
    hourlyPrice: Number(partner.hourly_price ?? 0),
    bayIds,
    bayCount: bayIds.length,
  };
}
