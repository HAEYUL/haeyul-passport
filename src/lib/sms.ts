/**
 * 알리고(Aligo) 문자 발송 연동
 * https://smartsms.aligo.in
 */

import { estimateSmsByteLength, SMS_BYTE_LIMIT } from './utils';

const ALIGO_SEND_URL = 'https://apis.aligo.in/send/';

export interface SendSmsParams {
  /** 수신번호 목록 (하이픈 없이). 최대 1,000명. */
  receivers: string[];
  message: string;
  testMode?: boolean;
}

export interface SendSmsResult {
  successCount: number;
  errorCount: number;
}

export async function sendSms({ receivers, message, testMode = false }: SendSmsParams): Promise<SendSmsResult> {
  const apiKey = process.env.ALIGO_API_KEY;
  const userId = process.env.ALIGO_USER_ID;
  const sender = process.env.ALIGO_SENDER;

  if (!apiKey || !userId || !sender) {
    throw new Error('문자 발송 설정(ALIGO_API_KEY/ALIGO_USER_ID/ALIGO_SENDER)이 되어 있지 않습니다.');
  }

  const msgType = estimateSmsByteLength(message) > SMS_BYTE_LIMIT ? 'LMS' : 'SMS';

  const body = new URLSearchParams({
    key: apiKey,
    user_id: userId,
    sender: sender.replace(/\D/g, ''),
    receiver: receivers.join(','),
    msg: message,
    msg_type: msgType,
    testmode_yn: testMode ? 'Y' : 'N',
  });

  const response = await fetch(ALIGO_SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await response.json();

  if (Number(data.result_code) !== 1) {
    throw new Error(data.message || '문자 발송에 실패했습니다.');
  }

  return {
    successCount: Number(data.success_cnt) || 0,
    errorCount: Number(data.error_cnt) || 0,
  };
}
