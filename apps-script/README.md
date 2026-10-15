# Google 행 저장 시험 어댑터

실제 Google 연결·인증·배포는 실행하지 않았습니다. 승인 이후 새 빈 독립 시험 파일만 사용합니다. 기존 참고 두 ID는 코드에서 차단합니다.

로컬 build는 Core.gs, MaterialModel.gs, Index.html을 생성합니다. 설치 파일은 Code.gs/RowStore.gs/공유 모델/Index.html/manifest이며 TEST_SHEET_ID 설정 뒤 initializeTestDatabase()를 명시 실행하는 경로입니다. 수동 TransactionJournal 헤더를 만들지 않습니다.

25건 페이지 조회, changed aggregate 기록, checksum·idempotency·revision·복구 가능한 COMMITTED projection, manifest/page 백업과 단계 복원 공개를 구현했습니다. LockService 자체가 다중 시트 쓰기를 원자화하지 않으므로 읽기 전에 미완료 commit을 복구합니다. Drive 호출·파일 생성·발송은 없습니다.

[구조와 한도](ROW-STORAGE.md), [승인 대기 설치·권한 계획](DEPLOYMENT-PLAN.md), [규모 시험 증거](scale-evidence.json)를 참고하세요. 모의 검증은 실제 서비스 할당량/속도/인증 성공을 의미하지 않습니다.
