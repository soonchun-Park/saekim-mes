# SUIT 서체와 화면 모드

- 사용자 참고 사이트 M3PN의 한글 본문·제목에서 실제 렌더링되는 SUIT를 전용 Headless Chrome 155로 확인했다. 참고 사이트의 일부 장식 영문 제목은 Orbitron이며, MES에서는 SUIT로 일관되게 표시한다.
- 공식 SUIT Variable v2.0.5 원본과 SIL OFL 1.1 라이선스를 `assets/fonts/suit/`에 보존한다. 생성 HTML에 내장하여 외부 CDN 요청이나 OS 서체 설치 없이 동작한다.
- 상단 **어둡게 / 밝게** 버튼으로 전환한다. 선택은 현재 브라우저와 앱 주소의 localStorage에 기억하며, 선택이 없으면 밝은 화면이다. 운영체제 설정과 업무 데이터는 변경하지 않는다.
- 모달을 연 상태에서는 **Alt+Shift+D**로도 전환할 수 있다. 입력값·커서와 팝업 상태를 유지한다.
- 다크모드는 원본 블랙 배경 로고와 흰 심볼을 사용한다. 로고 SVG 패스와 색상은 수정하지 않았다.
- 견적·생산 문서 미리보기와 인쇄/PDF는 흰 배경이다. 서체 로드가 끝난 후 인쇄 버튼을 활성화하며 실패 시 시스템 한글 서체로 표시한다. 생산 문서 HTML 저장에도 원본 폰트와 라이선스를 포함한다.
- 업데이트를 보려면 작성 중인 내용을 먼저 저장한 뒤 새로고침한다. 사용자의 기존 탭은 자동 새로고침하지 않는다.

출처: https://www.m3pn.com/main/ · https://github.com/sun-typeface/SUIT/tree/v2.0.5 · https://github.com/sun-typeface/SUIT/blob/v2.0.5/LICENSE

검증 기록: `qa/reports/m3pn-font-inspection.json`, `typography-browser.json`, `theme-browser.json`, `typography-final.json` 및 `qa/typography-full-tests.txt`.
