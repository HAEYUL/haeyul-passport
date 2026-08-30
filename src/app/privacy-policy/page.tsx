import Link from 'next/link';

/**
 * 개인정보처리방침 — 로그인 없이 누구나 볼 수 있는 공개 페이지
 * 가입 화면(RegisterForm)의 "상세내용보기" 내용과 동일합니다.
 */
export default function PrivacyPolicyPage() {
  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <Link
          href="/"
          className="flex items-center text-[#2D5A3D] text-base font-medium"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          돌아가기
        </Link>

        <header>
          <h1 className="text-2xl font-bold text-[#2D5A3D]">개인정보처리방침</h1>
          <p className="mt-2 text-[15px] text-[#8C8C80]">
            해율 자연의 흐름 전자여권
          </p>
        </header>

        <div className="bg-white rounded-2xl p-5 text-sm text-[#666] leading-relaxed space-y-4 border border-[#E8E4DA]">
          <div>
            <p className="font-semibold text-[#333] mb-1">1. 수집하는 개인정보</p>
            <p className="mb-1">
              해율 전자여권은 해율만두전골·곤드레밥집·정담명가 남원추어탕이 공동으로 운영하는
              통합 회원 서비스이며, 다음의 개인정보를 수집합니다.
            </p>
            <ul className="space-y-1 list-disc list-inside">
              <li>이름</li>
              <li>연락처</li>
              <li>생년월일</li>
              <li>방문 기록</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[#333] mb-1">2. 개인정보 이용 목적</p>
            <p className="mb-1">수집한 개인정보는 다음의 목적으로 이용합니다.</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>방문 기록 및 회원 등급 관리</li>
              <li>방문 할인권 및 생일 혜택 제공</li>
              <li>고객 서비스 운영</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[#333] mb-1">3. 보유 및 이용 기간</p>
            <p>
              개인정보는 회원 탈퇴 시까지 보관하며, 관련 법령에 따라 보관이 필요한 경우를
              제외하고는 지체 없이 파기합니다. 고객이 앱 내 &apos;내 정보&apos; 화면에서
              직접 탈퇴를 요청하면, 방문기록·할인권을 포함한 모든 개인정보가 즉시 삭제되며
              복구할 수 없습니다.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[#333] mb-1">4. 개인정보 제3자 제공</p>
            <p>
              해율은 고객의 개인정보를 고객의 동의 없이 제3자에게 제공하지 않습니다. 다만,
              관련 법령에 따라 제공이 필요한 경우는 예외로 합니다.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[#333] mb-1">5. 이용자의 권리</p>
            <p>
              고객은 언제든지 자신의 개인정보에 대한 조회, 수정, 삭제 및 회원 탈퇴를
              요청할 수 있습니다.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[#333] mb-1">6. 개인정보 보호</p>
            <p>
              해율은 개인정보의 분실, 도난, 유출 및 훼손을 방지하기 위해 필요한 보호조치를
              시행하고 있습니다.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[#333] mb-1">7. 마케팅 정보 수신</p>
            <p>
              혜택·소식 안내 문자는 별도로 동의한 고객에게만 발송되며, &apos;내 정보&apos;
              화면에서 언제든지 수신 동의를 철회할 수 있습니다. 철회 즉시 이후 발송
              대상에서 제외됩니다.
            </p>
          </div>
          <div>
            <p className="font-semibold text-[#333] mb-1">8. 문의처</p>
            <p>개인정보와 관련한 문의는 아래로 연락해 주시기 바랍니다.</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>상호: 해율만두전골, 곤드레밥집, 정담명가 남원추어탕</li>
              <li>연락처: 여권관리자 010-5346-3333</li>
            </ul>
          </div>
        </div>

        <div className="pb-8" />
      </div>
    </main>
  );
}
