// 새김 MES 외부 조회(읽기 전용).
// 사무실 PC가 구글 드라이브에 올리는 mes-view.json을 읽어 보여 줍니다. 쓰기·수정 기능은 없습니다.
// 배포: 웹앱 · 실행 사용자 = 나(배포자) · 액세스 = saekim.co.kr 도메인 사용자 (appsscript.json 참고)
var VIEW_FILE_NAME = 'mes-view.json';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('새김 MES 조회')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 같은 이름 파일이 여러 개면(드라이브 동기화로 새로 만들어진 경우) 가장 최근 것을 씁니다.
function getView() {
  var files = DriveApp.getFilesByName(VIEW_FILE_NAME), newest = null;
  while (files.hasNext()) {
    var f = files.next();
    if (f.isTrashed()) continue;
    if (!newest || f.getLastUpdated() > newest.getLastUpdated()) newest = f;
  }
  if (!newest) throw new Error('조회 자료(' + VIEW_FILE_NAME + ')를 구글 드라이브에서 찾지 못했습니다. 사무실 PC의 자동 내보내기를 확인하세요.');
  return newest.getBlob().getDataAsString('UTF-8');
}
