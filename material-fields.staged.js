(function(root){'use strict';root.MaterialFields={
 fields:[
 {key:'length',label:'길이',unit:'mm',shapes:['plate','bar','tube'],width:1},
 {key:'width',label:'폭',unit:'mm',shapes:['plate'],width:1},
 {key:'height',label:'두께',unit:'mm',shapes:['plate'],width:1},
 {key:'diameter',label:'외경',unit:'mm',shapes:['bar','tube'],width:1},
 {key:'innerDiameter',label:'내경',unit:'mm',shapes:['tube'],width:1}],
 material:[{key:'density',label:'비중',unit:'g/cm³',width:1},{key:'kgRate',label:'소재 kg 단가',unit:'원/kg',width:1}],
 processing:[{key:'hours',label:'개당 가공시간',unit:'시간',width:1},{key:'hourRate',label:'시간당 단가',unit:'원/시간',width:1}],
 shapeLabels:{plate:'판재',bar:'봉재',tube:'파이프'}
};if(typeof module!=='undefined')module.exports=root.MaterialFields;
})(typeof globalThis==='undefined'?this:globalThis);
