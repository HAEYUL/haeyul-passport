/**
 * 알리고(Aligo) 문자 발송 연동
 * https://smartsms.aligo.in
 *
 * 알리고는 미리 등록한 서버 IP에서 온 요청만 받습니다. Vercel은 요청마다 나가는 IP가 바뀌므로,
 * ALIGO_PROXY_URL(고정 IP 중계 서비스, 예: Fixie)이 설정돼 있으면 알리고 요청만 그 중계를 거쳐 보냅니다.
 * Fixie를 Vercel 연동으로 설치하면 자동으로 들어가는 FIXIE_URL도 함께 인식합니다.
 * 중계 서비스의 고정 IP를 알리고 관리 화면에 등록해 두어야 합니다.
 * (HTTPS 그대로 터널링하므로 중계 서비스는 내용을 볼 수 없습니다)
 */

import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { estimateSmsByteLength, SMS_BYTE_LIMIT } from './utils';

const ALIGO_SEND_URL = 'https://apis.aligo.in/send/';
const ALIGO_REMAIN_URL = 'https://apis.aligo.in/remain/';
/** 지금 나가는 IP 확인용 (알리고에 등록할 IP 확인) */
const OUTBOUND_IP_URL = 'https://api.ipify.org?format=json';

let cachedProxy: { url: string; agent: ProxyAgent } | null = null;

/** 중계 서비스 주소 — ALIGO_PROXY_URL을 먼저 보고, 없으면 Fixie Vercel 연동의 FIXIE_URL */
function getProxyUrl(): string | undefined {
  return process.env.ALIGO_PROXY_URL?.trim() || process.env.FIXIE_URL?.trim() || undefined;
}

/** 중계 서비스 주소가 있으면 그 중계를 쓰는 연결을, 없으면 undefined(바로 연결)를 돌려줍니다. */
function getProxyAgent(): ProxyAgent | undefined {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return undefined;
  if (cachedProxy?.url !== proxyUrl) {
    try {
      new URL(proxyUrl);
    } catch {
      // 주소에 비밀번호가 들어 있으므로 오류 메시지에 주소를 남기지 않습니다.
      throw new Error('ALIGO_PROXY_URL(또는 FIXIE_URL) 형식이 올바르지 않습니다. (예: http://아이디:비밀번호@주소:80)');
    }
    cachedProxy = { url: proxyUrl, agent: new ProxyAgent(proxyUrl) };
  }
  return cachedProxy.agent;
}

/** 중계 서비스 주소가 설정돼 있는지 */
export function isAligoProxyConfigured(): boolean {
  return Boolean(getProxyUrl());
}

/** 알리고(또는 IP 확인) 요청 — 중계 서비스가 설정돼 있으면 그쪽을 거칩니다. */
async function outboundFetch(url: string, body?: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await undiciFetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body,
    dispatcher: getProxyAgent(),
  });
  return (await response.json()) as Record<string, unknown>;
}

function getAligoCredentials() {
  const apiKey = process.env.ALIGO_API_KEY;
  const userId = process.env.ALIGO_USER_ID;
  const sender = process.env.ALIGO_SENDER;

  if (!apiKey || !userId || !sender) {
    throw new Error('문자 발송 설정(ALIGO_API_KEY/ALIGO_USER_ID/ALIGO_SENDER)이 되어 있지 않습니다.');
  }
  return { apiKey, userId, sender: sender.replace(/\D/g, '') };
}

/**
 * 알리고 오류 메시지를 사장님이 바로 조치할 수 있는 안내로 바꿉니다.
 * 알리고는 IP 미등록·잔액 부족·인증 오류를 모두 같은 코드(-99 등)로 보내므로 메시지로 구분합니다.
 */
export function explainAligoError(message: string): string {
  const raw = message || '알 수 없는 오류';
  if (/IP/i.test(raw)) {
    return `알리고에 등록되지 않은 IP에서 보냈습니다. 중계 서비스의 고정 IP(2개)를 알리고 발송 서버 IP에 등록했는지, Vercel에 ALIGO_PROXY_URL(또는 Fixie 연동의 FIXIE_URL)이 있는지 확인해 주세요. (알리고: ${raw})`;
  }
  if (/잔액|포인트|충전/.test(raw)) {
    return `알리고 충전 잔액이 부족합니다. 알리고에서 충전해 주세요. (알리고: ${raw})`;
  }
  if (/발신/.test(raw)) {
    return `발신번호가 알리고에 등록되지 않았거나 다릅니다. ALIGO_SENDER를 확인해 주세요. (알리고: ${raw})`;
  }
  if (/인증|key|아이디|user/i.test(raw)) {
    return `알리고 API 키 또는 아이디가 맞지 않습니다. ALIGO_API_KEY·ALIGO_USER_ID를 확인해 주세요. (알리고: ${raw})`;
  }
  return `알리고 오류: ${raw}`;
}

export interface SendSmsParams {
  /** 수신번호 목록 (하이픈 없이). 최대 1,000명. */
  receivers: string[];
  message: string;
  /** 장문(LMS) 제목. 장문일 때만 쓰입니다. */
  title?: string;
  /** true면 길이와 상관없이 장문(LMS)으로 보냅니다. */
  forceLms?: boolean;
  testMode?: boolean;
}

export interface SendSmsResult {
  successCount: number;
  errorCount: number;
}

export async function sendSms({
  receivers,
  message,
  title,
  forceLms = false,
  testMode = false,
}: SendSmsParams): Promise<SendSmsResult> {
  const { apiKey, userId, sender } = getAligoCredentials();

  const msgType = forceLms || estimateSmsByteLength(message) > SMS_BYTE_LIMIT ? 'LMS' : 'SMS';

  const body = new URLSearchParams({
    key: apiKey,
    user_id: userId,
    sender,
    receiver: receivers.join(','),
    msg: message,
    msg_type: msgType,
    testmode_yn: testMode ? 'Y' : 'N',
  });
  if (msgType === 'LMS' && title) body.set('title', title);

  const data = await outboundFetch(ALIGO_SEND_URL, body);

  if (Number(data.result_code) !== 1) {
    throw new Error(explainAligoError(String(data.message ?? '')));
  }

  return {
    successCount: Number(data.success_cnt) || 0,
    errorCount: Number(data.error_cnt) || 0,
  };
}

export interface AligoRemain {
  /** 지금 잔액으로 보낼 수 있는 단문(SMS) 건수 */
  sms: number;
  /** 장문(LMS) 건수 */
  lms: number;
}

/** 알리고 잔액 조회 — 문자를 보내지 않고 연결(IP 등록·인증)만 확인할 때 씁니다. */
export async function getAligoRemain(): Promise<AligoRemain> {
  const { apiKey, userId } = getAligoCredentials();
  const data = await outboundFetch(ALIGO_REMAIN_URL, new URLSearchParams({ key: apiKey, user_id: userId }));

  if (Number(data.result_code) !== 1) {
    throw new Error(explainAligoError(String(data.message ?? '')));
  }
  return { sms: Number(data.SMS_CNT) || 0, lms: Number(data.LMS_CNT) || 0 };
}

/** 알리고로 나가는 요청의 IP — 중계 서비스를 쓰면 그 고정 IP가 나옵니다. */
export async function getOutboundIp(): Promise<string> {
  const data = await outboundFetch(OUTBOUND_IP_URL);
  return String(data.ip ?? '');
}
