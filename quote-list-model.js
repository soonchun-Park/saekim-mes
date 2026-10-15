'use strict';
function dateOf(q){if(q.quoteDate)return q.quoteDate;const time=/^\d{4}-\d{2}-\d{2}T/.test(q.issuedAt||'')?Date.parse(q.issuedAt):NaN;return Number.isFinite(time)?new Date(time+32400000).toISOString().slice(0,10):'';}
function filterQuotes(quotes,options={}){
 const {quoteFrom='',quoteTo='',quoteSort='desc'}=options;
 for(const value of [quoteFrom,quoteTo])if(typeof value!=='string'||value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw Error('견적 조회 날짜 오류');
 if(quoteFrom&&quoteTo&&quoteFrom>quoteTo)throw Error('조회 시작일이 종료일보다 늦습니다');
 if(!['asc','desc'].includes(quoteSort))throw Error('견적 정렬 오류');
 return [...quotes].reverse().filter(q=>(!quoteFrom||dateOf(q)>=quoteFrom)&&(!quoteTo||dateOf(q)&&dateOf(q)<=quoteTo)).sort((a,b)=>{const x=dateOf(a),y=dateOf(b);if(!x||!y)return x?-1:y?1:0;return (quoteSort==='asc'?1:-1)*x.localeCompare(y);});
}
module.exports={dateOf,filterQuotes};
