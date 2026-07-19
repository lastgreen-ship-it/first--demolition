# 퍼스트철거 운영형 MVP - 개발팀 전달 최종본

Next.js 16 App Router + React 19.2 + Tailwind CSS 4 + Supabase 기반입니다.

## 즉시 실행
1. Node.js 20.9 이상 설치
2. `npm install`
3. `.env.example`을 `.env.local`로 복사
4. Supabase SQL Editor에서 `supabase/schema.sql` 실행
5. `npm run dev`
6. `http://localhost:3000` 접속

Supabase 환경변수를 넣지 않아도 홈페이지와 관리자 데모는 열리고, 견적 접수 API는 데모 성공 응답을 반환합니다. 운영 전에는 반드시 Supabase 연결과 인증, RLS 테스트를 완료해야 합니다.

## 배포
- Vercel 프로젝트 생성 → GitHub 저장소 연결
- Environment Variables 등록
- Domain에 `demo.firstdemolition.co.kr` 연결
- 검수 후 `firstdemolition.co.kr`로 승격

## 핵심 경로
- `/` 고객 랜딩
- `/quote` 견적 접수
- `/dashboard` 운영 대시보드 데모
- `/api/quotes` 견적 접수 API
- `/supabase/schema.sql` DB/RLS 초안
- `/CLAUDE.md` Claude Code 작업 규칙
- `/docs/개발팀_최종작업지시서.md` 상세 범위와 인수 기준

## 중요
이 패키지는 바로 실행 가능한 시연용 MVP 베이스입니다. 결제, 전자계약, 실제 AI 산출가격, 사업자 진위확인, 폐기물 인계서 연동은 외부 계약/API 확정 후 구현합니다.
