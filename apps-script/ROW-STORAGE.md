# Google 행 저장소 v2 — 로컬 시험 구현

Google 인증·OAuth 지속 권한·실제 Spreadsheet 생성·배포·외부 쓰기를 실행하지 않았습니다. 아래 코드는 승인 후 독립 신규 시험 Spreadsheet에서 설치·서비스 할당량을 검증해야 합니다. 운영 및 두 참고 Spreadsheet ID는 코드가 차단합니다. 실제 Google 성능과 무제한 무료를 보장하지 않습니다.

## 저장 단위와 조회 경계

Quotes / QuoteItems / Orders / Lines / Processes / StockMoves / MaterialActual / Invoices / Payments / Allocations / Work / Receipts / Inspections / Deliveries / Audit / Commands를 별도 시트 행으로 저장합니다. 견적 헤더는 품목 배열을, 수주 헤더는 snapshot·lines·payments 배열을 포함하지 않습니다. 수주 snapshot은 변경 금지된 발행 견적 버전과 그 품목 행을 참조해 복원합니다. 수주 전환 후 해당 견적 계열의 변경은 공유 core 검증이 금지합니다.

각 도메인 시트에는 generation, ID, parent, 작은 record JSON, SHA-256, sequence, transaction ID의 7열이 있습니다. 별도 2열 Index 시트는 SHA-256으로 선택한 256개 버킷에 ID/목록 sequence 인덱스와 parent→행 포인터를 저장합니다. ID와 sequence는 서로 다른 namespace를 사용합니다. 새로운 generation에서도 물리적 행은 추가하며 기존 세대는 덮어쓰지 않습니다.

명령은 전체 시트 getDataRange를 읽거나 전체 데이터베이스를 재작성하지 않습니다. 요청키의 버킷과 선택된 견적 계열/수주를 제한된 parent 조회로 조립하고, 공유 core.apply / validateState를 적용한 뒤 바뀐 record만 기록합니다. 요청 단위 버킷/행 캐시는 gateway 진입마다 초기화하며 쓰기 후 갱신·무효화합니다. 인접한 parent·목록·백업 행은 한 range로 묶어서 읽습니다. 물리적 용량은 1,000행 단위로 늘리고 commit 전에 대상 행 공간을 확보합니다.

명시적 경계는 페이지 최대 25개, 단일 명령 집계 및 변경행 최대 500개, parent 묶음 최대 500개, record/인덱스/메타/계획의 개별 UTF-8 셀 최대 35,000 bytes, 복원 조상 세대 최대 16개입니다. 이것은 데이터베이스 전체 35KB 제한이 아닙니다. 버킷이 가득 차면 logical commit 전에 오류를 반환하므로 버킷 분할/새 저장소 설계가 필요합니다. 큰 단일 수주의 추가 분할 설계도 필요합니다. 백업·복원 후 기존 세대와 journal을 보존하므로 실제 Sheet 용량은 계속 증가하며 운영 전 보관 정책이 필요합니다.

## 트랜잭션과 복구

다중 Sheets 쓰기를 원자적이라고 주장하지 않습니다. ScriptLock 아래 Meta의 pending transaction 직접 포인터를 먼저 기록합니다. 작은 projection plan 행들을 PREPARING→PREPARED 상태로 저장한 후 단일 COMMITTED marker를 기록하고 projection·부분 인덱스를 적용합니다. projection 완료 후 Meta revision/counts를 갱신하고 APPLIED를 표시합니다. 다음 요청은 pending transaction만 직접 읽고 복구한 후 응답합니다. PREPARING/PREPARED의 미완료 계획은 버리고 재시도하며, COMMITTED는 동일한 계획의 같은 물리적 행에 다시 적용합니다.

UUID는 generation/revision/요청키/증분 counter의 hash에서 결정하므로 사전 commit 실패 재시도에서도 동일 ID를 사용합니다. Commands 행은 원본 전체 payload 대신 body hash, 요청키, revision, 변경 ID를 저장합니다. 같은 요청키·내용은 재적용하지 않으며 다른 내용은 거부합니다. row/plan 체크섬과 ID·parent·sequence 연결을 확인합니다. 검사 합격 수량·재고 이동·부분 납품·청구·부분 입금은 동일 공유 core 규칙을 사용합니다.

쓰기 중 응답 손실은 COMMIT_UNCERTAIN / retryable:true입니다. UI는 같은 요청키와 내용을 유지해야 합니다. 설정/잠금/읽기 오류는 READ_UNAVAILABLE이며 입력 검증 오류는 VALIDATION_ERROR / retryable:false입니다. 영구 권한·할당량·무결성 문제는 원인 해결 전 진행하지 않습니다. 이 journal은 관리자에 의한 시트 전체 삭제나 위조를 방어하는 인증 서명이 아닙니다.

## API

- state({quotesCursor,ordersCursor,limit:25}): 첫/지정 페이지, 최근 감사 25개, summaries, paging, scope:'page'. 표시된 합계는 현재 목록입니다.
- page({kind:'quotes'|'orders',cursor,limit,revision}): items/cursor/nextCursor/total/revision. quote에는 _superseded/_converted가 있습니다.
- read({kind,id,revision?}): 해당 완전한 견적 또는 수주 aggregate.
- command(coreCommand): revision/affectedIds/replayed의 작은 응답. 전체 DB 응답 없음.
- backupManifest(): format mes-row-backup-v1, generation/revision, table counts, pageSize=25, sha256.
- backupPage({manifest,table,cursor,limit:25}): {table,cursor,nextCursor,total,records:[{id,parent,seq,record}],sha256}. 세대/revision이 바뀌면 혼합 백업을 거부합니다.
- restoreStart({key,revision,manifest}): sessionId와 독립 staged generation 생성. 발행 전 화면은 기존 세대를 봅니다.
- restorePage({sessionId,page}): 순서·체크섬·도메인 연결 검증, 동일 page 재시도 지원. page receipt는 별도 RestorePages 행으로 저장하며 메타에 전체 page 배열을 넣지 않습니다.
- restoreValidatePage({sessionId,kind:'quotes'|'orders',cursor,limit:25}): 공유 core 불변조건 검증을 페이지별로 진행합니다.
- restorePublish({sessionId,revision}): 모든 page/검증 완료 후 stage의 restore 감사 행을 journal로 먼저 기록하고 단일 Meta generation 포인터를 발행합니다. 같은 session/base revision 재시도는 성공 확인 가능합니다. 백업 이후 생긴 과거 요청키는 조상 세대에서 발견해 재적용을 거부합니다.

복원 중 신규 명령으로 revision이 바뀌면 해당 session은 발행할 수 없습니다. 백업/복원은 chunk 단위 재개가 가능하며 새 세대 발행 전 중단된 stage는 노출되지 않습니다. 완성된 백업은 로컬 JSON 파일로 내려받으며 실제 발송과는 별개입니다.

## 설치 승인 경계와 증거

build.js는 Core.gs / MaterialModel.gs / Index.html을 로컬에서 생성합니다. 새 프로젝트에는 Code.gs / RowStore.gs / Core.gs / MaterialModel.gs / Index.html을 넣습니다. MaterialModel.gs는 공통 UMD 모델을 그대로 복사하며 소재만 계산한 견적의 processing:null과 제품/소재 치수·절단 여유·출처를 보존합니다. TEST_SHEET_ID 설정 후 명시적인 승인을 받아 편집기에서 initializeTestDatabase()를 한 번 실행하는 경로만 제공합니다. 빈 독립 Spreadsheet가 아니면 초기화를 거부하며 state/command가 자동 초기화하지 않습니다. 중간 설치 실패 시 기존 데이터를 정리하거나 운영 저장소로 우회하지 않습니다.

google-adapter.test.js / rowstore.test.js는 실제 .gs 소스를 Node VM과 Sheets mock으로 실행합니다. quote·production·restore page·publish의 모든 쓰기 지점에서 before/after 연결 손실을 주입하고 같은 키 재시도, 부분 인덱스 복구, 합계/수량, 정확히 한 건의 이벤트를 확인합니다. scale-test.js는 1,000개 견적과 1,000개 수주, 각 2품목, 자체/외주·재고 이동·검사·납품·청구·부분 입금 이벤트를 실행하고 전체 페이지/백업/단계 복원을 검사합니다. 최신 완료 실행의 각 표 행수, 모든 행 hash, 전체 1,000 aggregate hash, 비어 있지 않은 실제 mock 셀/할당 grid 셀, 개별 셀 bytes, 작은 DB와 1,000 DB 명령의 range 호출/셀 수는 scale-evidence.json에 기록합니다. Node wall clock은 Google 지연 시간이나 할당량 보장이 아닙니다.
# 생산 배정 모듈의 Google 지원 범위

빌드는 ProductionWorkflow.gs를 함수 범위로 감싸 포함합니다. 공통 의존성 조회용이며 새 생산 배정 기능의 Google 저장 지원을 의미하지 않습니다.

수량 분할 배정과 버전 문서는 현재 로컬 시험 모드 전용입니다. Google gateway는 assignProduction, documentIssue, documentRevise, assignmentCancel, assignmentReplace 및 executionAssignments/productionDocuments가 있는 복원 입력을 기록 전에 UNSUPPORTED_FEATURE로 거절합니다. 문서 행 저장과 서버 공급사 검증이 구현될 때까지 이 제한을 유지해야 합니다. 기존 process/work/receive는 유지됩니다.

build:google은 로컬 파일 생성만 수행하며 OAuth 인증·외부 배포를 실행하지 않습니다.

