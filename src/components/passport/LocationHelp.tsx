/**
 * 위치 확인 안내 — 방문 기록은 매장 위치 확인이 필요하므로,
 * 위치를 거부했거나 확인이 안 된 손님에게 매장 안에서 위치 허용을 켜 달라고 짧게 안내합니다.
 */
export default function LocationHelp() {
  return (
    <div className="space-y-1 text-[15px] font-medium leading-relaxed text-[#7A4A16]">
      <p>
        방문 기록은 <b>매장 안에서 위치가 확인될 때</b> 남길 수 있어요.
      </p>
      <p>
        지금 매장에 계시다면 <b>설정에서 위치 허용</b>을 켠 뒤 다시 눌러 주세요.
      </p>
    </div>
  );
}
