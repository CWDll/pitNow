import { NextResponse } from "next/server";

import { getPartnerShopPackages } from "@/src/lib/partner-packages";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const partnerId = (url.searchParams.get("partnerId") ?? "").trim();

  if (!partnerId) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_PARTNER_ID",
          message: "partnerId 쿼리가 필요합니다.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const { packages, source } = await getPartnerShopPackages(partnerId);

    return NextResponse.json({
      success: true,
      source,
      packages,
    });
  } catch (error) {
    console.error("PARTNER PACKAGES API ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "패키지 조회 중 오류가 발생했습니다.",
        },
      },
      { status: 500 },
    );
  }
}
