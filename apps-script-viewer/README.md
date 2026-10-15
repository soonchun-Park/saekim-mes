# 새김 MES 외부 조회 (읽기 전용)

사무실 PC의 MES는 인터넷에 열지 않습니다. 대신 PC가 30분마다 요약 자료 `mes-view.json`을 구글 드라이브(`G:\내 드라이브\saekim-mes-view`)에 올리고, 이 Apps Script 웹앱이 그 파일을 읽어 휴대폰·다른 PC에서 보여 줍니다.

- 볼 수 있는 것: 요약(납기 경과·7일 이내 납기·진행 수주·미수금), 납기·일정, 수주, 미수·청구, 견적. 검색 가능.
- 수정·입력은 할 수 없습니다. 입력은 사무실 PC의 MES에서 합니다.
- 화면은 마지막 내보내기 시점 기준입니다. 2시간 넘게 갱신이 없으면 화면 위에 경고가 뜹니다.
- 요약 자료에는 계좌·첨부·성적서 원본이 들어가지 않습니다(`ops/export-view.js`).
- 접속은 `saekim.co.kr` 회사 구글 계정만 가능합니다.

## 설치 (한 번만)

1. 사무실 PC에서 `ops/install-tasks.ps1`을 실행해 자동 실행·백업·내보내기를 등록합니다. 내보내기가 한 번 돌면 `G:\내 드라이브\saekim-mes-view\mes-view.json`이 생깁니다.
2. `saekim@saekim.co.kr`로 로그인한 브라우저에서 https://script.google.com 을 열고 **새 프로젝트**를 만듭니다. 이름은 `새김 MES 조회`.
3. 왼쪽 톱니바퀴(프로젝트 설정)에서 **"appsscript.json" 매니페스트 파일을 편집기에 표시**를 켭니다.
4. 편집기에서 세 파일 내용을 이 폴더의 파일로 바꿉니다.
   - `Code.gs` ← `Code.gs`
   - `appsscript.json` ← `appsscript.json`
   - 파일 추가(+) → HTML → 이름 `Index` ← `Index.html`
5. 오른쪽 위 **배포 → 새 배포 → 유형: 웹 앱**. 실행 사용자 "나", 액세스 권한 "saekim.co.kr 내 모든 사용자"로 되어 있는지 확인하고 배포합니다.
6. 처음 한 번 권한 확인 창이 뜹니다. 요청 권한은 **구글 드라이브 파일 보기(읽기 전용)** 하나뿐입니다.
7. 나온 웹 앱 주소(`https://script.google.com/a/macros/saekim.co.kr/s/.../exec`)를 휴대폰 즐겨찾기나 홈 화면에 추가합니다.

G: 드라이브가 `saekim@saekim.co.kr`이 아닌 다른 구글 계정이라면, `saekim-mes-view` 폴더를 `saekim@saekim.co.kr`에 보기 권한으로 공유해야 웹앱이 파일을 찾을 수 있습니다.

## 고칠 때

화면을 고치면 Apps Script 편집기에서 `Index`를 다시 붙여 넣고 **배포 → 배포 관리 → 수정 → 새 버전**으로 같은 주소에 다시 배포합니다.
