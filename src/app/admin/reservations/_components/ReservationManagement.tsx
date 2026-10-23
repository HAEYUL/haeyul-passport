'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AdminNav from '../../_components/AdminNav';
import {
  createReservationAndSendSms,
  resendReservationSms,
  updateReservation,
  cancelReservation,
  deleteReservation,
  getReservations,
  getReservationSmsTemplate,
  updateReservationSmsTemplate,
  type ReservationItem,
  type ReservationInput,
  type ReservationListScope,
  type ReservationSmsTemplate,
} from '../actions';
import {
  DEFAULT_RESERVATION_SMS_TITLE,
  DEFAULT_RESERVATION_SMS_BODY,
  RESERVATION_PLACEHOLDERS,
  RESERVATION_TEMPLATE_BYTE_LIMIT,
  formatReservationDate,
  formatReservationTime,
  renderReservationMessage,
} from '@/lib/reservationMessage';
import { getTodayKST, estimateSmsByteLength } from '@/lib/utils';

interface FormState {
  customerName: string;
  phone: string;
  reservedDate: string;
  reservedTime: string;
  partySize: string;
  memo: string;
}

function emptyForm(): FormState {
  return { customerName: '', phone: '', reservedDate: getTodayKST(), reservedTime: '12:00', partySize: '', memo: '' };
}

function toInput(form: FormState): ReservationInput {
  return {
    customerName: form.customerName,
    phone: form.phone,
    reservedDate: form.reservedDate,
    reservedTime: form.reservedTime,
    partySize: Number(form.partySize),
    memo: form.memo,
  };
}

function isFormFilled(form: FormState): boolean {
  return Boolean(form.customerName.trim() && form.phone.trim() && form.reservedDate && form.reservedTime && Number(form.partySize) > 0);
}

/** 미리보기 — 아직 입력하지 않은 칸은 칸 이름 그대로 보여줍니다 */
function previewMessage(body: string, form: FormState): string {
  let text = body;
  if (form.customerName.trim()) text = text.replaceAll('{예약자명}', form.customerName.trim());
  if (form.reservedDate) text = text.replaceAll('{예약날짜}', formatReservationDate(form.reservedDate));
  if (form.reservedTime) text = text.replaceAll('{예약시간}', formatReservationTime(form.reservedTime));
  if (Number(form.partySize) > 0) text = text.replaceAll('{인원}', String(Number(form.partySize)));
  return text;
}

function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// CSV를 엑셀에서 열 때 한글이 깨지지 않도록 붙이는 UTF-8 BOM
const BOM = String.fromCharCode(0xfeff);

function downloadReservationsCsv(items: ReservationItem[], scope: ReservationListScope) {
  const headers = ['예약날짜', '예약시간', '예약자명', '휴대폰번호', '인원', '메모', '상태', '여권회원', '문자발송', '발송시각'];
  const rows = items.map((r) => [
    r.reservedDate,
    r.reservedTime,
    r.customerName,
    r.phone,
    String(r.partySize),
    r.memo ?? '',
    r.status === 'cancelled' ? '취소' : '예약',
    r.isPassportMember ? 'Y' : '',
    r.smsStatus === 'sent' ? '발송' : r.smsStatus === 'failed' ? '실패' : '',
    r.smsSentAt ? formatSentAt(r.smsSentAt) : '',
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `예약자명단_${scope === 'upcoming' ? '다가오는예약' : '지난예약'}_${getTodayKST()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const INPUT_CLASS =
  'w-full min-h-[44px] px-3 rounded-xl border-2 border-[#D4D0C8] bg-white text-base focus:border-[#2D5A3D] focus:outline-none';

function ReservationFields({
  form,
  onChange,
  idPrefix,
}: {
  form: FormState;
  onChange: (next: FormState) => void;
  idPrefix: string;
}) {
  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...form, [key]: e.target.value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-name`} className="text-sm font-semibold text-[#44443C]">
          예약자명
        </label>
        <input id={`${idPrefix}-name`} value={form.customerName} onChange={set('customerName')} className={INPUT_CLASS} />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-phone`} className="text-sm font-semibold text-[#44443C]">
          휴대폰번호
        </label>
        <input
          id={`${idPrefix}-phone`}
          type="tel"
          inputMode="numeric"
          placeholder="010-1234-5678"
          value={form.phone}
          onChange={set('phone')}
          className={INPUT_CLASS}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-date`} className="text-sm font-semibold text-[#44443C]">
          예약날짜
        </label>
        <input id={`${idPrefix}-date`} type="date" value={form.reservedDate} onChange={set('reservedDate')} className={INPUT_CLASS} />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-time`} className="text-sm font-semibold text-[#44443C]">
          예약시간
        </label>
        <input
          id={`${idPrefix}-time`}
          type="time"
          step={600}
          value={form.reservedTime}
          onChange={set('reservedTime')}
          className={INPUT_CLASS}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-party`} className="text-sm font-semibold text-[#44443C]">
          인원
        </label>
        <input
          id={`${idPrefix}-party`}
          type="number"
          inputMode="numeric"
          min={1}
          value={form.partySize}
          onChange={set('partySize')}
          className={INPUT_CLASS}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-memo`} className="text-sm font-semibold text-[#44443C]">
          메모 <span className="font-normal text-[#6B6B5E]">(직원용 · 문자에 안 들어감)</span>
        </label>
        <input id={`${idPrefix}-memo`} value={form.memo} onChange={set('memo')} className={INPUT_CLASS} />
      </div>
    </div>
  );
}

export default function ReservationManagement({ isOwner }: { isOwner: boolean }) {
  const [template, setTemplate] = useState<ReservationSmsTemplate | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [scope, setScope] = useState<ReservationListScope>('upcoming');
  const [items, setItems] = useState<ReservationItem[] | null>(null);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [editing, setEditing] = useState<{ id: string; form: FormState } | null>(null);
  const [editError, setEditError] = useState('');

  const loadTemplate = useCallback(() => {
    getReservationSmsTemplate().then((result) => {
      setTemplate(
        result.success && result.data
          ? result.data
          : { title: DEFAULT_RESERVATION_SMS_TITLE, body: DEFAULT_RESERVATION_SMS_BODY }
      );
    });
  }, []);

  const loadList = useCallback((nextScope: ReservationListScope) => {
    getReservations(nextScope).then((result) => {
      if (result.success && result.data) {
        setItems(result.data);
        setListError('');
      } else {
        setItems([]);
        setListError(result.error || '예약 명단을 불러오지 못했습니다.');
      }
    });
  }, []);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  useEffect(() => {
    loadList(scope);
  }, [scope, loadList]);

  async function handleSend() {
    if (!isFormFilled(form)) {
      setSendResult({ ok: false, text: '예약자명·휴대폰번호·날짜·시간·인원을 모두 입력해 주세요.' });
      return;
    }
    const summary = `${form.customerName.trim()} / ${form.phone.trim()}\n${formatReservationDate(form.reservedDate)} ${formatReservationTime(form.reservedTime)} / ${Number(form.partySize)}명`;
    if (!window.confirm(`아래 예약으로 안내 문자를 보낼까요?\n\n${summary}`)) return;

    setSending(true);
    setSendResult(null);
    const result = await createReservationAndSendSms(toInput(form));
    setSending(false);

    if (!result.success) {
      setSendResult({ ok: false, text: result.error || '처리 중 오류가 발생했습니다.' });
      return;
    }
    if (result.data?.smsError) {
      setSendResult({
        ok: false,
        text: `예약은 명단에 저장됐지만 문자를 보내지 못했습니다. 아래 명단에서 「문자재전송」을 눌러 주세요.\n(${result.data.smsError})`,
      });
    } else {
      setSendResult({ ok: true, text: `${form.customerName.trim()}님께 예약 안내 문자를 보냈습니다.` });
      setForm(emptyForm());
    }
    loadList(scope);
  }

  async function handleResend(item: ReservationItem) {
    if (!window.confirm(`${item.customerName}님(${item.phone})께 예약 안내 문자를 다시 보낼까요?`)) return;
    setBusyId(item.id);
    setRowMessage(null);
    const result = await resendReservationSms(item.id);
    setBusyId(null);
    if (!result.success) {
      setRowMessage({ ok: false, text: result.error || '처리 중 오류가 발생했습니다.' });
    } else if (result.data?.smsError) {
      setRowMessage({ ok: false, text: `문자를 보내지 못했습니다. (${result.data.smsError})` });
    } else {
      setRowMessage({ ok: true, text: `${item.customerName}님께 예약 안내 문자를 다시 보냈습니다.` });
    }
    loadList(scope);
  }

  async function handleCancel(item: ReservationItem) {
    if (!window.confirm(`${item.customerName}님 ${formatReservationDate(item.reservedDate)} 예약을 취소로 바꿀까요?\n(손님께 문자는 가지 않습니다)`)) return;
    setBusyId(item.id);
    setRowMessage(null);
    const result = await cancelReservation(item.id);
    setBusyId(null);
    setRowMessage(result.success ? { ok: true, text: '예약을 취소로 바꿨습니다.' } : { ok: false, text: result.error || '처리 중 오류가 발생했습니다.' });
    loadList(scope);
  }

  async function handleDelete(item: ReservationItem) {
    if (
      !window.confirm(
        `${item.customerName}님 ${formatReservationDate(item.reservedDate)} 예약을 명단에서 완전히 삭제할까요?\n삭제하면 되돌릴 수 없습니다. (손님께 문자는 가지 않습니다)`
      )
    ) {
      return;
    }
    setBusyId(item.id);
    setRowMessage(null);
    const result = await deleteReservation(item.id);
    setBusyId(null);
    setRowMessage(result.success ? { ok: true, text: '예약을 삭제했습니다.' } : { ok: false, text: result.error || '처리 중 오류가 발생했습니다.' });
    loadList(scope);
  }

  function startEdit(item: ReservationItem) {
    setEditError('');
    setEditing({
      id: item.id,
      form: {
        customerName: item.customerName,
        phone: item.phone,
        reservedDate: item.reservedDate,
        reservedTime: item.reservedTime,
        partySize: String(item.partySize),
        memo: item.memo ?? '',
      },
    });
  }

  async function saveEdit() {
    if (!editing) return;
    if (!isFormFilled(editing.form)) {
      setEditError('예약자명·휴대폰번호·날짜·시간·인원을 모두 입력해 주세요.');
      return;
    }
    setBusyId(editing.id);
    const result = await updateReservation(editing.id, toInput(editing.form));
    setBusyId(null);
    if (!result.success) {
      setEditError(result.error || '수정 중 오류가 발생했습니다.');
      return;
    }
    setEditing(null);
    setRowMessage({ ok: true, text: '예약을 수정했습니다. 손님께 바뀐 내용을 알리려면 「문자재전송」을 눌러 주세요.' });
    loadList(scope);
  }

  const keyword = search.trim().replace(/-/g, '');
  // 예약일시 순 — 다가오는 예약은 가까운 순, 지난 예약은 최근 순
  const visibleItems = (items || [])
    .filter((r) => !keyword || r.customerName.includes(search.trim()) || r.phone.replace(/-/g, '').includes(keyword))
    .sort((a, b) => {
      const diff = `${a.reservedDate} ${a.reservedTime}`.localeCompare(`${b.reservedDate} ${b.reservedTime}`);
      return scope === 'upcoming' ? diff : -diff;
    });

  const preview = template ? previewMessage(template.body, form) : '';

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-5xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-[#2D5A3D]">예약관리</h1>
          <p className="text-sm text-[#6B6B5E]">
            전화 예약을 입력하고 예약 안내 문자(장문)를 보냅니다. 예약자 명단은 여권 회원과 따로 보관되며, 예약 안내 목적으로만 씁니다.
          </p>
        </header>

        <AdminNav active="reservations" isManager={!isOwner} />

        {/* 1. 예약 입력 · 문자 보내기 */}
        <section className="bg-white rounded-2xl border-2 border-[#E0DCD0] p-6 space-y-4">
          <h2 className="text-lg font-bold text-[#2D5A3D]">예약 입력 · 안내 문자 보내기</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <ReservationFields form={form} onChange={setForm} idPrefix="new" />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !template}
                className="w-full min-h-[52px] rounded-xl bg-[#2D5A3D] text-white text-lg font-bold hover:bg-[#245032] disabled:bg-[#999]"
              >
                {sending ? '보내는 중...' : '문자 보내기'}
              </button>
              {sendResult && (
                <p
                  className={`text-sm font-semibold whitespace-pre-line leading-relaxed ${sendResult.ok ? 'text-[#1F4A2E]' : 'text-[#B3261E]'}`}
                >
                  {sendResult.text}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[#44443C]">
                보낼 문자 미리보기 <span className="font-normal text-[#6B6B5E]">(장문 · 제목: {template?.title ?? '…'})</span>
              </p>
              <pre className="whitespace-pre-wrap break-words rounded-xl bg-[#F5F5EC] border border-[#E0DCD0] p-4 text-sm leading-relaxed text-[#2C2C2C] font-sans max-h-[460px] overflow-y-auto">
                {template ? preview : '문구를 불러오는 중...'}
              </pre>
            </div>
          </div>
        </section>

        {/* 2. 예약자 명단 */}
        <section className="bg-white rounded-2xl border-2 border-[#E0DCD0] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-[#2D5A3D]">예약자 명단</h2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['upcoming', '다가오는 예약'],
                  ['past', '지난 예약'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setItems(null);
                    setScope(key);
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold ${
                    scope === key ? 'bg-[#2D5A3D] text-white' : 'bg-white text-[#2D5A3D] border-2 border-[#D4D0C8] hover:bg-[#F5F5EC]'
                  }`}
                >
                  {label}
                </button>
              ))}
              {isOwner && (
                <button
                  type="button"
                  onClick={() => downloadReservationsCsv(visibleItems, scope)}
                  disabled={visibleItems.length === 0}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-[#2D5A3D] border-2 border-[#D4D0C8] hover:bg-[#F5F5EC] disabled:opacity-40"
                >
                  엑셀 다운로드
                </button>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="reservation-search" className="sr-only">
              예약자명 또는 전화번호 검색
            </label>
            <input
              id="reservation-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="예약자명 또는 전화번호로 찾기"
              className={INPUT_CLASS}
            />
          </div>

          {rowMessage && (
            <p className={`text-sm font-semibold ${rowMessage.ok ? 'text-[#1F4A2E]' : 'text-[#B3261E]'}`}>{rowMessage.text}</p>
          )}
          {listError && <p className="text-sm font-semibold text-[#B3261E]">{listError}</p>}

          {items === null ? (
            <p className="text-sm text-[#6B6B5E]">불러오는 중...</p>
          ) : visibleItems.length === 0 ? (
            <p className="text-sm text-[#6B6B5E]">{scope === 'upcoming' ? '다가오는 예약이 없습니다.' : '지난 예약이 없습니다.'}</p>
          ) : (
            <div>
              <p className="mb-2 text-xs text-[#6B6B5E] sm:hidden">← 줄을 옆으로 밀면 나머지 내용이 보여요</p>
              {/* 한 줄에 한 예약 — 줄마다 따로 옆으로 스크롤됩니다 (밀어 본 줄만 움직임) */}
              <ul className="border-t border-[#F0EDE6] text-sm">
                {visibleItems.map((r) => {
                  const cancelled = r.status === 'cancelled';
                  return (
                    <li key={r.id} className={`overflow-x-auto border-b border-[#F0EDE6] ${cancelled ? 'text-[#9C988B]' : ''}`}>
                      <div className="flex w-max items-center gap-4 whitespace-nowrap py-2.5 pr-2">
                        <span>
                          <span className="font-semibold">{formatReservationDate(r.reservedDate)}</span>{' '}
                          {formatReservationTime(r.reservedTime)}
                          {cancelled && (
                            <span className="ml-1.5 inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-[#F0EFE9] text-[#6B6B5E] border border-[#D4D0C8]">
                              취소
                            </span>
                          )}
                        </span>
                        <span>
                          <span className="font-semibold">{r.customerName}</span>
                          {r.isPassportMember && (
                            <span className="ml-1.5 inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-[#F0F7F2] text-[#1F4A2E] border border-[#8FC49F]">
                              여권회원
                            </span>
                          )}
                        </span>
                        <span>{r.phone}</span>
                        <span>{r.partySize}명</span>
                        {r.memo && (
                          <span className="max-w-[220px] truncate text-[#55534A]" title={r.memo}>
                            메모: {r.memo}
                          </span>
                        )}
                        <span>
                          {r.smsStatus === 'sent' && (
                            <span className="text-[#1F4A2E] font-semibold">✓ 발송 {r.smsSentAt && formatSentAt(r.smsSentAt)}</span>
                          )}
                          {r.smsStatus === 'failed' && (
                            <span className="text-[#B3261E] font-semibold" title={r.smsError ?? ''}>
                              ✕ 문자 실패
                            </span>
                          )}
                          {!r.smsStatus && <span className="text-[#6B6B5E]">문자 -</span>}
                        </span>
                        <span className="flex flex-nowrap gap-1.5">
                          {!cancelled && (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(r)}
                                disabled={busyId === r.id}
                                className="px-3 py-1.5 rounded-lg border border-[#D4D0C8] text-[#2D5A3D] font-semibold hover:bg-[#F5F5EC] disabled:opacity-40"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResend(r)}
                                disabled={busyId === r.id}
                                className="px-3 py-1.5 rounded-lg border border-[#D4D0C8] text-[#2D5A3D] font-semibold hover:bg-[#F5F5EC] disabled:opacity-40"
                              >
                                문자재전송
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancel(r)}
                                disabled={busyId === r.id}
                                className="px-3 py-1.5 rounded-lg border border-[#F0D4B8] text-[#B3261E] font-semibold hover:bg-[#FFF8F0] disabled:opacity-40"
                              >
                                취소
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            disabled={busyId === r.id}
                            className="px-3 py-1.5 rounded-lg bg-[#FBEAEA] border border-[#E8B4B0] text-[#8A241A] font-semibold hover:bg-[#F6DCDA] disabled:opacity-40"
                          >
                            삭제
                          </button>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <p className="text-xs text-[#6B6B5E]">
            예약자 명단은 같은 번호의 마지막 예약일로부터 3년이 지나면 자동으로 삭제됩니다. 홍보 문자 대상으로는 쓸 수 없습니다.
          </p>
        </section>

        {/* 3. 문구 수정 */}
        {isOwner && template && <TemplateEditor template={template} onSaved={loadTemplate} />}
      </div>

      {/* 예약 수정 창 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-xl bg-white rounded-2xl p-6 space-y-4 shadow-lg">
            <h2 className="text-lg font-bold text-[#2D5A3D]">예약 수정</h2>
            <ReservationFields
              form={editing.form}
              onChange={(next) => setEditing({ ...editing, form: next })}
              idPrefix="edit"
            />
            <p className="text-sm text-[#6B6B5E]">저장만 하고 문자는 보내지 않습니다. 손님께 알리려면 저장 후 「문자재전송」을 눌러 주세요.</p>
            {editError && <p className="text-sm font-semibold text-[#B3261E]">{editError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex-1 min-h-[48px] rounded-xl border-2 border-[#D4D0C8] bg-white text-[#55534A] font-bold"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busyId === editing.id}
                className="flex-1 min-h-[48px] rounded-xl bg-[#2D5A3D] text-white font-bold hover:bg-[#245032] disabled:bg-[#999]"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/** 예약 안내 문자 문구 수정 — 자동 입력 칸({예약자명} 등)을 넣을 수 있습니다 */
function TemplateEditor({ template, onSaved }: { template: ReservationSmsTemplate; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(template.title);
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function insertPlaceholder(placeholder: string) {
    const el = bodyRef.current;
    if (!el) {
      setBody((prev) => prev + placeholder);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + placeholder + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await updateReservationSmsTemplate({ title, body });
    setSaving(false);
    if (result.success) {
      setMessage({ ok: true, text: '문구를 저장했습니다. 다음 문자부터 새 문구로 나갑니다.' });
      onSaved();
    } else {
      setMessage({ ok: false, text: result.error || '저장 중 오류가 발생했습니다.' });
    }
  }

  const bodyBytes = estimateSmsByteLength(body);
  const sample = renderReservationMessage(body, {
    customerName: '홍길동',
    reservedDate: getTodayKST(),
    reservedTime: '12:30',
    partySize: 4,
  });

  return (
    <section className="bg-white rounded-2xl border-2 border-[#E0DCD0] p-6 space-y-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-lg font-bold text-[#2D5A3D]">예약 안내 문자 문구 수정</span>
        <span className="text-sm font-semibold text-[#2D5A3D]">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>

      {open && (
        <div className="space-y-4">
          <p className="text-sm text-[#6B6B5E] leading-relaxed">
            아래 버튼으로 자동 입력 칸을 넣으면, 문자를 보낼 때 입력한 예약 내용으로 바뀝니다. 예약 안내 문자에는 홍보 문구(신메뉴·이벤트·할인 등)를 넣지 마세요.
          </p>

          <div className="space-y-1">
            <label htmlFor="template-title" className="text-sm font-semibold text-[#44443C]">
              문자 제목 (장문 제목)
            </label>
            <input id="template-title" value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLASS} />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="template-body" className="text-sm font-semibold text-[#44443C]">
                문자 내용
              </label>
              <div className="flex flex-wrap gap-1.5">
                {RESERVATION_PLACEHOLDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => insertPlaceholder(p)}
                    className="px-2.5 py-1 rounded-lg border border-[#8FC49F] bg-[#F0F7F2] text-[#1F4A2E] text-xs font-bold"
                  >
                    {p} 넣기
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id="template-body"
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={18}
              className="w-full px-3 py-2 rounded-xl border-2 border-[#D4D0C8] text-sm leading-relaxed focus:border-[#2D5A3D] focus:outline-none"
            />
            <p className={`text-xs ${bodyBytes > RESERVATION_TEMPLATE_BYTE_LIMIT ? 'text-[#B3261E] font-semibold' : 'text-[#6B6B5E]'}`}>
              {bodyBytes.toLocaleString()} / {RESERVATION_TEMPLATE_BYTE_LIMIT.toLocaleString()} 바이트 (한글 1자 = 2바이트)
            </p>
          </div>

          <details className="rounded-xl bg-[#F5F5EC] border border-[#E0DCD0] p-3">
            <summary className="text-sm font-semibold text-[#44443C] cursor-pointer">예시로 미리보기 (홍길동 · 4명)</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed font-sans">{sample}</pre>
          </details>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="min-h-[44px] px-5 rounded-xl bg-[#2D5A3D] text-white text-sm font-semibold hover:bg-[#245032] disabled:bg-[#999]"
            >
              {saving ? '저장 중...' : '문구 저장'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('처음 기본 문구로 되돌릴까요? (저장을 눌러야 적용됩니다)')) return;
                setTitle(DEFAULT_RESERVATION_SMS_TITLE);
                setBody(DEFAULT_RESERVATION_SMS_BODY);
              }}
              className="min-h-[44px] px-5 rounded-xl border-2 border-[#D4D0C8] bg-white text-[#55534A] text-sm font-semibold"
            >
              기본 문구로 되돌리기
            </button>
          </div>
          {message && <p className={`text-sm font-semibold ${message.ok ? 'text-[#1F4A2E]' : 'text-[#B3261E]'}`}>{message.text}</p>}
        </div>
      )}
    </section>
  );
}
