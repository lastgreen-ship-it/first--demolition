// 퍼스트철거 · 리드 접수 웰컴 문자 발송 (Solapi)
// 호출 경로:
//   1) DB Webhook: estimates INSERT/UPDATE 시 { type, record, old_record } 로 호출
//   2) 수동/일괄: DMS admin.html 에서 { id, manual:true } 로 invoke
//
// 필요한 secret (Supabase > Edge Functions > notify-lead-sms > Secrets):
//   SOLAPI_API_KEY     = 솔라피 콘솔 > 개발/연동 > API Key
//   SOLAPI_API_SECRET  = 솔라피 콘솔 > 개발/연동 > API Secret
//   SMS_FROM           = 0269525390   (등록된 발신번호, 하이픈 없이)
//   (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 기본 제공됨)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 폴백 문구 (DMS 문자설정이 비어있을 때만 사용). 평소엔 settings.body 를 씀.
const DEFAULT_BODY = `[퍼스트 철거 접수 완료]

안녕하세요, 고객님.
철거·원상복구 전문기업 퍼스트 철거(First Demolition)입니다.

요청하신 철거 견적 상담이 정상적으로 접수되었습니다.
담당 견적 매니저가 현장 조건을 확인하기 위해 곧 연락드릴 예정입니다.

보다 정확한 견적을 위해 아래 내용을 미리 준비해 주세요.

- 철거 현장 주소
- 철거 대상: 상가·사무실·주택·공장 등
- 대략적인 면적
- 철거 희망 일정
- 현장 사진 또는 영상
- 엘리베이터 및 주차 가능 여부

아래 홈페이지에서 퍼스트 철거의 서비스와 진행 절차를 확인하실 수 있습니다.

▶ 퍼스트 철거 홈페이지
https://www.firstdemolition.kr/

사진을 보내주시면 더욱 빠르게 예상 견적을 안내해 드리겠습니다.

퍼스트 철거 상담팀`;
// ───────────────────────────────────────────────────────────────

const SOLAPI_KEY = Deno.env.get("SOLAPI_API_KEY")!;
const SOLAPI_SECRET = Deno.env.get("SOLAPI_API_SECRET")!;
const SMS_FROM = (Deno.env.get("SMS_FROM") || "0269525390").replace(/\D/g, "");
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

// 전화번호 정규화: 하이픈 제거, +82 → 0
function normPhone(p: string): string {
  let d = (p || "").replace(/\D/g, "");
  if (d.startsWith("82")) d = "0" + d.slice(2);
  return d;
}

// Solapi HMAC-SHA256 인증 헤더
async function solapiAuthHeader(): Promise<string> {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, "");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(SOLAPI_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(date + salt));
  const signature = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `HMAC-SHA256 apiKey=${SOLAPI_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function sendSms(to: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.solapi.com/messages/v4/send", {
      method: "POST",
      headers: {
        "Authorization": await solapiAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { to, from: SMS_FROM, text } }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}` };
    // Solapi 성공 코드는 "2000". 그 외 코드면 실패로 처리.
    const sc = String(body?.statusCode ?? "");
    if (sc && !sc.startsWith("2")) {
      return { ok: false, error: `${sc} ${body?.statusMessage || ""}`.trim().slice(0, 300) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 300) };
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const payload = await req.json().catch(() => ({}));
    const manual = payload?.manual === true;

    // 대상 row 확보
    let row: any = payload?.record || null;
    const id = payload?.id || row?.id;
    if (!row && id) {
      const { data } = await sb.from("estimates").select("*").eq("id", id).single();
      row = data;
    }
    if (!row) return json({ ok: false, error: "no target row" }, 400);

    // DMS 문자설정(settings.value: {enabled, subject, body})을 단일 소스로 읽음
    let cfg: any = {};
    try {
      const { data } = await sb.from("settings").select("value").eq("key", "sms").single();
      cfg = (data && data.value) || {};
    } catch (_e) { /* 설정 없으면 기본값 사용 */ }

    // ── 자동 발송 조건 (수동이면 무조건 발송) ──
    if (!manual) {
      // DMS 토글이 명시적으로 꺼져있으면 자동발송 안 함
      if (cfg.enabled === false) return json({ ok: true, skipped: "auto-send-disabled" });
      // 이미 보냈으면 스킵 (중복 방지)
      if (row.sms_status === "발송") return json({ ok: true, skipped: "already-sent" });
      // 메타리드는 즉시 발송, 견적폼 리드는 '주소 채워진(완료)' 건만 발송
      const isMeta = (row.source === "meta_ad") || /^ML-/.test(row.receipt_no || "");
      const hasAddr = !!(row.address && String(row.address).trim());
      if (!isMeta && !hasAddr) return json({ ok: true, skipped: "form-lead-incomplete" });
    }

    const to = normPhone(row.phone);
    if (to.length < 10) return json({ ok: false, error: "invalid phone" }, 400);

    // 발송 문구 우선순위: 요청(payload.text) > DMS 설정(cfg.body) > 폴백
    const text = (payload.text && String(payload.text).trim())
      ? String(payload.text)
      : ((cfg.body && String(cfg.body).trim()) ? String(cfg.body) : DEFAULT_BODY);
    const r = await sendSms(to, text);
    const now = new Date().toISOString();
    await sb.from("estimates").update(
      r.ok
        ? { sms_status: "발송", sms_sent_at: now, sms_error: null }
        : { sms_status: "실패", sms_error: r.error || "발송 실패" },
    ).eq("id", row.id);

    return json({ ok: r.ok, error: r.error });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
