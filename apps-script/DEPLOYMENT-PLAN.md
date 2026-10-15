# 승인 대기 · 새 Google 시험DB 연결 계획

2026-10-12에 현재 소스와 Google 공식 문서를 확인했습니다. 이 문서와 appsscript.json은 **로컬 검토용**입니다. 아직 Google 문서 생성, 계정 로그인/OAuth 승인, 키 발급, 코드 업로드, 실데이터 접근, 배포를 실행하지 않았습니다.

## 현재 코드에 필요한 최소 권한

| 항목 | 계획 |
|---|---|
| OAuth scope | https://www.googleapis.com/auth/spreadsheets 1개 |
| 이유 | Code.gs/RowStore.gs가 SpreadsheetApp.openById(TEST_SHEET_ID), 범위 읽기·appendRow·setValue·flush 사용 |
| 접속자 | webapp.access=MYSELF — 배포자만 |
| 실행 주체 | webapp.executeAs=USER_DEPLOYING — 배포자 권한으로 실행 |
| Drive OAuth | 불필요. DriveApp/Drive API, 파일 업로드·검색·공유를 사용하지 않음 |
| Gmail/Calendar/외부HTTP/트리거 | 권한 요청 없음. 서비스 호출/설치형 트리거 없음 |
| API키/서비스계정/clasp 인증 | 불필요. Apps Script 편집기 수동 설치 경로 |
| 파일 | 새 비공개 Google Spreadsheet 1개 + 새 Apps Script 프로젝트 1개 |
| 기존 ERP/기존 테스트DB | 열거나 수정하거나 복사하지 않음. 두 참고 ID는 코드에서 거절 |

중요한 권한 구분: spreadsheets OAuth scope는 권한을 부여한 계정의 접근 가능한 Sheets를 대상으로 하는 읽기/쓰기 범위이며, **새 파일 하나로 제한된 OAuth가 아닙니다**. 실제 코드의 접근 대상은 Script Properties의 TEST_SHEET_ID 하나이고 그 안의 행 테이블과 시스템 기록만 사용합니다. 계정 권한 범위와 애플리케이션의 파일ID 제한은 서로 다른 보호입니다. TEST_SHEET_ID는 브라우저 payload로 받지 않습니다.

현재 openById는 spreadsheets.currentonly scope로 대체할 수 없습니다. 문서에 바인딩한 스크립트라도 웹앱 실행에서는 getActiveSpreadsheet 등 활성 컨테이너 메서드를 사용할 수 없으므로 currentonly를 쓰려면 **별도 Sheets sidebar 실행 방식으로 변경·검증**해야 합니다. 현재 웹앱 계획은 그러한 변경을 완료했다고 주장하지 않습니다.

근거: [openById 권한](https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#openById(String)), [scope 지정](https://developers.google.com/apps-script/concepts/scopes), [웹앱 접속/실행 설정](https://developers.google.com/apps-script/manifest/web-app-api-executable), [바인딩 스크립트 웹앱 제약](https://developers.google.com/apps-script/guides/bound).

## 승인 이후 실행 순서

1. 사용자 소유의 **새 빈 Spreadsheet**를 만들고 이름을 “MES 독립 시험DB”로 지정. 공유 일반 액세스는 제한됨, 허용 사용자는 소유자만 확인. 기존 ERP/TestDB 복사본이 아닌 빈 문서.
2. 새 빈 파일 ID를 설정한 뒤 initializeTestDatabase()를 명시 실행합니다. 초기화는 비어 있는 새 파일만 허용하며 필요한 행 테이블·인덱스·메타·트랜잭션 시트를 생성합니다. 참고 두 ID는 거절합니다.

3. 별도 새 Apps Script 프로젝트를 만들고 소유자만 편집하도록 유지. 로컬 `npm run build:google` 결과의 Code.gs, RowStore.gs, Core.gs, MaterialModel.gs, Index.html을 붙여 넣음. 프로젝트 설정에서 manifest 표시를 켜 appsscript.json 내용을 적용. 표준 Cloud 프로젝트 전환·API 활성화·결제계정 연결은 계획에 없음.
4. 프로젝트 설정의 Script Properties에 TEST_SHEET_ID=새 Spreadsheet ID만 설정. 환경 식별자로 사용하며 비밀 토큰이 아님. 참고 ID·은행정보·업체 원본값·운영 데이터는 넣지 않음.
5. Deploy → Test deployments → Web app로 /dev 시험 URL을 먼저 확인. 이 URL은 편집 권한이 있는 사용자만 접근하며 현재 편집 코드를 실행하므로 **배포 완료 URL로 취급하지 않음**. 소유자는 Google 권한 화면에서 Sheets 권한 범위를 직접 검토·승인. 실제 /dev 접근과 허구 데이터 기록은 연결 실행 승인 이후에만 수행.
6. 빈 상태 로드 → 허구 견적 → 수주 → 공정 → 검사 → 부분납품 → 청구·부분입금 → 전액완료를 실제 Google Sheets 행 기록과 대조. reload·같은 요청키·revision 충돌·백업 다운로드/복원을 새 시험DB에서 확인. 모의 테스트만으로 이 단계를 통과했다고 하지 않음.
7. 실제 시험 성공 이후 승인된 범위 내에서 Deploy → New deployment → Web app. 실행 사용자=나, 접속 사용자=나만을 다시 확인해 버전 고정 /exec URL 생성. manifest 값이 실제 배포 UI에 반영됐는지 재확인. 익명/전체사용자/도메인 접속 설정으로 확대하지 않음.
8. /exec URL을 소유자 세션에서 확인하고 로그아웃/다른 사용자 접근이 차단되는지 일반 접근성 시험. 배포 버전·시험DB ID·검증 일시를 기록. 이후 코드 변경 시 새 버전 배포가 별도 작업임을 구분.

Apps Script 기본 Cloud 프로젝트를 사용하는 경로입니다. 기본 프로젝트는 Apps Script가 생성·관리하므로 이 계획에는 별도 OAuth client secret, 서비스계정, API키 생성이 없습니다. [기본 Cloud 프로젝트 설명](https://developers.google.com/apps-script/guides/cloud-platform-projects).

조직 정책이나 권한 화면이 계획과 다르거나 “나만” 설정을 사용할 수 없으면 그 상태를 부모에게 보고하고 중단합니다. Google 미검증앱 경고나 관리자 승인 요구가 발생하면 구체 화면/요구범위를 별도 보고하며 자동으로 진행하지 않습니다.

## 사용자에게 필요한 최소 승인

- 부모에게 **새 시험DB/프로젝트 생성, 허구 데이터 쓰기, Sheets OAuth 지속 접근권한, 소유자 전용 시험·버전 배포**를 함께 명시 승인. 기존 ERP 읽기/쓰기, 공개 배포, Drive 권한 확대, 실제 발송·결제는 포함하지 않음.
- Google에서 사용할 본인 계정 선택/로그인과 권한 화면의 직접 승인. 비밀번호·토큰·client secret을 대화로 제공할 필요 없음.
- 실행자에게 새 시험문서 ID 제공 또는 승인된 설치 과정에서 생성된 ID 확인. 권한·배포 설정이 계획과 같으면 같은 범위의 확인을 반복 요청할 필요 없음.

지금은 계획 준비만 승인받았으므로 위 실행 단계에 진입하지 않습니다.

## 검증 증거와 실제 연결의 차이

| 분류 | 확인 결과 | 실제 Google 보장 여부 |
|---|---|---|
| core 단위/회귀 | 19건 통과 | 업무 계산·불변량을 로컬에서 확인 |
| 로컬 HTTP 통합 | 2건 통과 | 로컬 서버 저장/동시요청/복원/실패재시도 |
| Google adapter 모의 | 13건 통과 | Code.gs를 Node VM의 Spreadsheet/Lock/Utilities mock으로 실행; 실제 OAuth·Google 서버는 사용하지 않음 |
| UI 모의 | 6건 통과 | DOM/transport mock의 렌더·같은키재시도 |
| 합계 | 40건 통과·실패0 | 40건을 실제 Google 실연결 시험으로 표현하면 안 됨 |
| 실제 브라우저 일반 QA | 독립 Chrome headless의 실제 DOM 클릭·전체흐름·모바일·응답손실재시도·복원 통과 | localhost 시험서버만 연결 |
| 실제 Google /dev·/exec | 미실행 | 승인·연결·배포 후 별도 검증 |
| 별도 독립 검토 | 보안 위험 감지로 차단 | 미완료. 우회/통과 처리 없음 |

Code.gs는 ScriptLock 안에서 읽기·검증·PENDING 기록·COMMITTED marker와 flush를 수행합니다. checksum chain, 요청키·revision 검증, 불확실 commit 재시도, JSON 백업/복원이 있습니다. snapshot 35,000 bytes 한도가 있으므로 현재 코드는 소규모 시험용이며 규모 확장 전 파티션 설계가 필요합니다.

도면은 버전 문자열 스냅샷만 있고 Drive 바이너리 도면 저장 기능은 아직 없습니다. 백업은 브라우저 JSON 다운로드와 이전 journal commit 보존이며 자동 Drive 백업은 없습니다. Drive 파일 저장/자동 백업을 추가하려면 별도 기능·scope 검토·승인이 필요합니다.

스크린샷 Library 등록은 후속 지시로 취소됐습니다. 로컬 QA 파일만 보존했고 Library 업로드/공유는 수행하지 않았습니다. 비밀값은 이 계획과 소스·검증 문서에 포함하지 않았습니다.

## 행 저장소 검증 및 한도

전체 JSON을 한 셀에 넣지 않습니다. [행 저장소](ROW-STORAGE.md), [1,000건 규모 증거](scale-evidence.json)를 참고하세요. 35,000바이트는 개별 셀/인덱스, 500행은 단일 aggregate/parent, 복원 조상은16세대 한도입니다. 실제 Apps Script 실행시간·동시실행·Sheets 셀 한도는 승인 후 실환경에서 확인해야 합니다. 모의340초는 서비스 처리시간 증거가 아닙니다. 재료 UI는 현재 별도8788로 staged되어 있으며 기본 Google Index.html에는 아직 활성화하지 않았습니다.
