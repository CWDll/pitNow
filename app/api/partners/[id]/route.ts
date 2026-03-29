import { NextResponse } from "next/server";

import { getPartnerProfileById } from "@/src/lib/partners";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, context: Context) {
  const { id } = await context.params;
  const partnerId = id.trim();

  if (!partnerId) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_PARTNER_ID",
          message: "partner id가 필요합니다.",
        },
      },
      { status: 400 },
    );
  }

  const partner = await getPartnerProfileById(partnerId);

  if (!partner) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "PARTNER_NOT_FOUND",
          message: "정비소 정보를 찾을 수 없습니다.",
        },
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    partner,
  });
}
