# 새김솔루션 CI 원본

사용자가 요청한 MES 디자인 개선을 위해 확인된 원본 두 개를 보존한다. SVG 패스, viewBox, 색상, 메타데이터를 수정하지 않았다. 화면의 img와 favicon은 이 파일의 원본 바이트를 data URI로 포함하므로 브라우저가 비공개 Drive에 접속하지 않는다.

- 폴더: https://drive.google.com/drive/folders/1X5sDIIw-NqjPD6WufIjCWLvj25YrUTd0
- 가로형 원본: https://drive.google.com/file/d/16SssZJS9_XrKrR3oujzXiRmj7C0w756D/view
  - 원래 이름: 새김솔루션_가로형_투명(밝은배경용).svg
  - 로컬 파일: saekim-horizontal.svg (28,678 bytes)
  - SHA-256: 8b2f6e850c542056079fdae59b02718c50f23eba68dcfab468ea9a7af5d6078b
- 심볼 원본: https://drive.google.com/file/d/1nEIW4QWMIMiGeCeDYZCn0EEN8To9lBU2/view
  - 원래 이름: 새김솔루션_심볼_컬러.svg
  - 로컬 파일: saekim-symbol.svg (8,691 bytes)
  - SHA-256: 49061e0c5abdfe75247aa0c7c8c50e2f6791d17e062aa1cc578f6c4b45f25806

원본에서 파랑 #0057FF와 검정 #0B0B0B를 확인했다. 글자는 패스로 저장되어 있으므로 특정 로고 글꼴명을 추정하지 않았다. UI 본문은 별도 정식 배포 SUIT를 사용하며 로고에는 적용하지 않는다. 로컬 브라우저 렌더 증빙: qa/reports/saekim-ci-original.png.

다크모드 요청에 따라 추가된 원본 (패스·색·메타데이터 수정 없음):
- 가로형 블랙배경: https://drive.google.com/file/d/1DU5LjReBZW2IW66DRoTCySYH5uFaRHZp/view
  - `saekim-horizontal-dark.svg`, 28,727 bytes
  - SHA-256 `b599d32d8e2a2aa663f0e42818e3d00372e59d90905b590841a8e83ec28042f1`
- 화이트 심볼: https://drive.google.com/file/d/19__-zQ-7X0qhA7Um04DAUNW0XhlRJ61l/view
  - `saekim-symbol-white.svg`, 8,691 bytes
  - SHA-256 `7ce4cba779011bdd204e3a8fb02d0dd598d8e52a5f280869d648dd56593c53b6`

최초 다운로드는 명시적 승인 근거 부족으로 자동 검토에서 거절되어 실행되지 않았다. 사용자 원문 전달 후 재검토된 동일 작업은 승인됐고, 만료된 다운로드 주소를 공식 Drive fetch로 갱신하여 완료했다. 임시 서명 URL과 토큰은 이 문서에 저장하지 않는다. Google 파일·공유·권한·배포 설정을 변경하지 않았다.
