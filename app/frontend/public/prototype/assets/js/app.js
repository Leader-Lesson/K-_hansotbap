"use strict";
/* ================= 데이터 (합성) ================= */
const TOTAL=132, D0=new Date(2026,10,12), WD="일월화수목금토";
const z2=n=>String(n).padStart(2,"0");
const dDate=d=>{const x=new Date(D0);x.setDate(x.getDate()+d-1);return x;};
const md=d=>{const x=dDate(d);return `${x.getMonth()+1}/${x.getDate()}`;};
const mdw=d=>{const x=dDate(d);return `${x.getMonth()+1}/${x.getDate()}(${WD[x.getDay()]})`;};
const ymd=d=>{const x=dDate(d);return `${x.getFullYear()}.${z2(x.getMonth()+1)}.${z2(x.getDate())}(${WD[x.getDay()]})`;};
const hh=h=>`${z2(Math.floor(h))}:${h%1?"30":"00"}`;
const hr=(a,b)=>`${hh(a)}–${hh(b)}`;
const dayFromMD=(m,d)=>Math.round((new Date(m>=11?2026:2027,m-1,d)-D0)/864e5)+1;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $=s=>document.querySelector(s);
const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
const LV={"금지":"ban","조건부":"cond","결함":"def"}, LVC={"금지":"var(--red)","조건부":"var(--amber)","결함":"var(--violet)"}, LVO={"금지":0,"조건부":1,"결함":2};
const TYPES=["화기","밀폐","고소","중량물","가스","가연물"];
const NOW=10.5;

const ZONES={
  Z1:{name:"노정",floor:"최상층",elev:75,col:true},
  Z2:{name:"노 내부 상부",floor:"9층",elev:55,col:true},
  Z3:{name:"노 내부 중부",floor:"7층",elev:42,col:true},
  Z4:{name:"노 내부 하부",floor:"5층",elev:32,col:true},
  Z5:{name:"풍구 층",floor:"3층 외부",elev:24,col:false},
  Z6:{name:"노 내부 바닥",floor:"1층 노내",elev:12,col:true},
  Z7:{name:"외부 작업대",floor:"7층 외부",elev:40,col:false},
  Z8:{name:"주상",floor:"1층",elev:12,col:false},
  Z9:{name:"열풍로",floor:"옥외",elev:30,col:false}
};
const ZORDER=["Z1","Z2","Z3","Z7","Z4","Z5","Z6","Z8","Z9"];
const ADJ={Z7:{Z3:4,Z4:8,Z2:15},Z8:{Z6:8}};
function dist(a,b){if(a===b)return 0;const A=ZONES[a],B=ZONES[b];if(A.col&&B.col)return Math.abs(A.elev-B.elev);return (ADJ[a]&&ADJ[a][b])||(ADJ[b]&&ADJ[b][a])||99;}

const PARTNERS=[
  {id:"A",name:"A사",trade:"내화물",fmt:"HWPX",file:"A사_내화물_작업계획서.hwpx",lead:"이현수 소장",part:"정우진 파트장",head:["광양 2고로 개수공사 내화물 작업계획서","시공: A사 · 현장책임자 이현수 소장"]},
  {id:"B",name:"B사",trade:"철피·장입설비",fmt:"XLSX",file:"B사_공정표_1112.xlsx",lead:"최도윤 소장",part:"문가람 파트장",head:["No | 작업명 | 기간 | 시간 | 위치 | 구분 | 비고"]},
  {id:"C",name:"C사",trade:"배관",fmt:"PDF",file:"C사_배관_작업계획서.pdf",lead:"김태오 소장",part:"송재훈 파트장",head:["C사 배관 작업계획서 · 4/12쪽","3. 세부 작업 계획"]},
  {id:"D",name:"D사",trade:"전기·계장·보온",fmt:"HWPX",file:"D사_전기계장_작업계획(안).hwpx",lead:"정민아 소장",part:"임하늘 파트장",head:["D사 전기·계장 작업계획(안)","책임자 정민아 소장"]},
  {id:"E",name:"E사",trade:"비계·대형 인양",fmt:"XLSX",file:"E사_인양비계계획.xlsx",lead:"오승민 소장",part:"강도현 파트장",head:["작업 | 기간 | 시간 | 위치 | 장비 | 위험"]}
];
const HQ=["박정훈 과장 (포스코 본청 안전보건팀)","한예린 대리 (포스코 본청 공정관리팀)"];const HQN="포스코 본청";
function fmtBy(p,d){const x=dDate(d),m=x.getMonth()+1,dd=x.getDate(),y=x.getFullYear();
  if(p==="A")return `${m}월 ${dd}일`;if(p==="B"||p==="E")return `${y}-${z2(m)}-${z2(dd)}`;if(p==="C")return `${y}.${z2(m)}.${z2(dd)}`;return `${m}/${dd}`;}
const fill=(tpl,t)=>tpl.replace("{s}",fmtBy(t.p,t.s)).replace("{e}",fmtBy(t.p,t.e)).replace("{h}",hr(t.h0,t.h1));

const STD={
 "SOP-RF-01":{title:"노내 내화물 해체 작업표준",steps:["노내 가스 농도 측정","해체물 반출 경로 확보","상부 낙하물 방호"],tbm:[{label:"노내 가스 농도 측정",all:[/가스\s?농도|산소\s?농도/]}]},
 "SOP-RF-02":{title:"노내 내화물 축조 작업표준",steps:["환기·산소농도 측정","출입 인원 명부 관리","상부 작업 통제 확인"],tbm:[{label:"환기·산소농도 측정",all:[/환기|산소\s?농도/]}]},
 "SOP-ME-03":{title:"장입설비 해체·설치 작업표준",steps:["인양계획서","신호수 배치","하부 출입 통제"],tbm:[{label:"하부 출입 통제",all:[/하부|아래/,/통제|대피|금지/]}]},
 "SOP-HW-01":{title:"용접·용단 화기작업 표준",steps:["화재감시자 배치","불티 비산 방지","소화기 비치"],tbm:[{label:"소화기 비치",all:[/소화기/]}]},
 "SOP-GP-01":{title:"질소·가스 배관 연결 작업표준",steps:["선행 공정 완료 확인","노내 인원 철수 확인","밸브 잠금·표지","기밀시험","산소농도 측정"],tbm:[{label:"기밀시험 실시",all:[/기밀/]},{label:"산소농도 측정",all:[/산소\s?농도/]}]},
 "SOP-LF-01":{title:"중량물 인양 작업표준",steps:["인양계획서","신호수 배치","인양 반경 출입 통제"],req:[{name:"인양계획서",re:/인양\s?계획/},{name:"신호수 배치",re:/신호수/},{name:"인양 반경 출입 통제",re:/출입\s?통제/}],tbm:[{label:"신호수 배치",all:[/신호수/]}]},
 "SOP-EL-01":{title:"전기·계장 작업표준",steps:["정전·잠금 확인","케이블 트레이 고정"],tbm:[]},
 "SOP-IN-01":{title:"보온재 교체 작업표준",steps:["가연물 보관 위치","인접 화기작업 확인"],tbm:[{label:"인접 화기작업 확인",all:[/화기|용접|용단/,/확인|없/]}]},
 "SOP-SC-01":{title:"비계 설치·해체 작업표준",steps:["안전대 체결","하부 통제"],tbm:[{label:"안전대 체결",all:[/안전대/]}]}
};

const BASE=[
 {id:"T05",p:"B",name:"노정 장입설비 해체",zone:"Z1",s:1,e:7,h0:8,h1:16,crew:16,types:["화기","고소","중량물"],pre:[],fw:true,std:"SOP-ME-03",sc:.89,tpl:"1 | 노정 장입설비 해체 | {s}~{e} | {h} | 노정 EL.75 | 용단, 중량물 | 화재감시자 1"},
 {id:"T13",p:"E",name:"노 내부 비계 설치",zone:"Z3",s:8,e:12,h0:8,h1:17,crew:12,types:["고소"],pre:[],std:"SOP-SC-01",sc:.94,tpl:"노 내부 비계 설치 | {s}–{e} | {h} | 노 내부 중부 | — | 고소"},
 {id:"T03",p:"A",name:"노흉 내화물 해체",zone:"Z3",s:13,e:30,h0:8,h1:18,crew:30,types:["고소","밀폐"],pre:["T13"],std:"SOP-RF-01",sc:.96,tpl:"가. 노흉부 내화물 해체 — {s}부터 {e}까지 {h}, 노 내부 중부(EL.42m). 고소·밀폐공간, 비계 설치 완료 후 착수."},
 {id:"T01",p:"A",name:"노저 내화물 해체",zone:"Z6",s:31,e:45,h0:8,h1:18,crew:28,types:["밀폐","중량물"],pre:["T03"],std:"SOP-RF-01",sc:.95,tpl:"나. 노저 내화물 해체 — {s}~{e} {h}, 노 내부 바닥. 밀폐공간, 해체물 중량물 반출 포함."},
 {id:"T02",p:"A",name:"노저·노상 축조",zone:"Z6",s:50,e:72,h0:8,h1:18,crew:45,types:["밀폐"],pre:["T01"],std:"SOP-RF-02",sc:.97,tpl:"다. 노저·노상 축조 — {s}~{e} {h}, 노 내부 바닥 밀폐공간. 작업인원 45명."},
 {id:"T04",p:"A",name:"노흉 축조",zone:"Z3",s:60,e:100,h0:7,h1:19,crew:32,types:["고소","밀폐"],pre:["T03"],std:"SOP-RF-02",sc:.97,tpl:"라. 노흉 축조 — {s}~{e} {h}, 노 내부 중부. 고소·밀폐공간, 작업인원 32명."},
 {id:"T20",p:"A",name:"출선구·탕도 축조",zone:"Z8",s:60,e:80,h0:8,h1:17,crew:14,types:[],pre:[],std:"SOP-RF-02",sc:.82,tpl:"마. 출선구·탕도 축조 — {s}~{e} {h}, 주상."},
 {id:"T06",p:"B",name:"노정 장입설비 설치",zone:"Z1",s:52,e:70,h0:9,h1:12,crew:18,types:["화기","고소","중량물"],pre:["T05"],fw:true,std:"SOP-ME-03",sc:.93,tpl:"3 | 노정 장입설비(벨리스 탑) 설치 | {s}~{e} | {h} | 노정 EL.75 | 크레인 인양, 용접 | 화재감시자 1"},
 {id:"T07",p:"B",name:"외부 작업대 철피 용접",zone:"Z7",s:58,e:72,h0:8,h1:16,crew:10,types:["화기","고소"],pre:[],fw:false,conf:{f:"화재감시자",v:.64},std:"SOP-HW-01",sc:.91,tpl:"4 | 노체 철피 교체 용접 | {s}~{e} | {h} | 외부 작업대 EL.40 | 용접·용단, 고소 | (빈칸)"},
 {id:"T19",p:"B",name:"열풍로 연결관 용접",zone:"Z9",s:60,e:70,h0:8,h1:17,crew:8,types:["화기"],pre:[],fw:true,std:"SOP-HW-01",sc:.9,tpl:"5 | 열풍로 연결관 용접 | {s}~{e} | {h} | 열풍로 | 용접 | 화재감시자 1"},
 {id:"T10",p:"C",name:"풍구 냉각수 배관 용단",zone:"Z5",s:60,e:80,h0:8,h1:14,crew:12,types:["화기"],pre:[],fw:true,std:"SOP-HW-01",sc:.92,tpl:"3.1 풍구 냉각수 배관 용단·교체 · 기간 {s}~{e} · {h} · 풍구 층(3층) · 산소절단 · 화재감시자 배치"},
 {id:"T21",p:"C",name:"열풍로 BFG 배관 퍼지·연결",zone:"Z9",s:64,e:66,h0:13,h1:16,crew:5,types:["가스"],pre:[],std:"SOP-GP-01",sc:.9,tpl:"3.2 열풍로 BFG 배관 퍼지·연결 · 기간 {s}~{e} · {h} · 열풍로"},
 {id:"T11",p:"C",name:"노흉 질소·가스 라인 연결",zone:"Z3",s:105,e:110,h0:13,h1:18,crew:6,types:["가스"],pre:["T04","T14"],std:"SOP-GP-01",sc:.95,tpl:"3.3 노흉 질소·가스 라인 연결 · 기간 {s}~{e} · {h} · 노 내부 중부 · 선행: 노흉 축조, 노내 비계 해체 완료"},
 {id:"T16",p:"C",name:"노정 BFG 배관 연결",zone:"Z1",s:112,e:120,h0:9,h1:17,crew:8,types:["가스"],pre:["T06","T12"],std:"SOP-GP-01",sc:.91,tpl:"3.4 노정 BFG 배관 연결 · 기간 {s}~{e} · {h} · 노정 · 선행: 장입설비 설치, 노정 계장 교체"},
 {id:"T09",p:"D",name:"주상 계장 케이블 포설",zone:"Z8",s:62,e:75,h0:13,h1:17,crew:6,types:[],pre:[],conf:{f:"위치",v:.72},std:"SOP-EL-01",sc:.86,tpl:"○ 주상 계장 케이블 포설: {s} ~ {e}, {h}, 출선장 주변 트레이"},
 {id:"T15",p:"D",name:"풍구 배관 보온재 교체",zone:"Z5",s:63,e:70,h0:13,h1:17,crew:6,types:["가연물"],pre:[],std:"SOP-IN-01",sc:.93,tpl:"○ 풍구 배관 보온재 교체: {s} ~ {e}, {h}, 3층 풍구 배관 (보온재 가연성)"},
 {id:"T12",p:"D",name:"노정 계장 교체",zone:"Z1",s:65,e:80,h0:13,h1:17,crew:4,types:["고소"],pre:[],std:"SOP-EL-01",sc:.88,tpl:"○ 노정 계장 교체: {s} ~ {e}, {h}, 노정 (고소작업)"},
 {id:"T18",p:"D",name:"풍구 계장 결선",zone:"Z5",s:91,e:100,h0:8,h1:17,crew:5,types:[],pre:[],std:"SOP-EL-01",sc:.87,tpl:"○ 풍구 계장 결선: {s} ~ {e}, {h}, 3층 풍구"},
 {id:"T08",p:"E",name:"링블록 인양",zone:"Z8",s:64,e:66,h0:10,h1:12,crew:9,types:["중량물"],pre:[],std:"SOP-LF-01",sc:.94,tpl:"링블록 인양 | {s}–{e} | {h} | 주상 인양경로 | 650t 크롤러, 인양계획서 첨부 | 중량물 / 인양 반경 출입통제"},
 {id:"T14",p:"E",name:"노 내부 비계 해체",zone:"Z3",s:101,e:104,h0:8,h1:17,crew:12,types:["고소"],pre:["T04"],std:"SOP-SC-01",sc:.94,tpl:"노 내부 비계 해체 | {s}–{e} | {h} | 노 내부 중부 | — | 고소 / 노흉 축조 완료 후"}
];
const SEC=["N","E","S","W"],SECN={N:"북측",E:"동측",S:"남측",W:"서측"},ADJS={N:["E","W"],E:["N","S"],S:["E","W"],W:["N","S"]};
const POS={T05:{path:[[8,12,"N"],[12,16,"W"]]},T06:{path:[[9,10.5,"N"],[10.5,12,"E"]]},T08:{path:[[10,11,"S"],[11,12,"E"]]},T10:{pos:["S","E"]},T15:{pos:["S"]},T12:{pos:["W"]},T07:{pos:["E"]},T19:{pos:["W"]},T21:{pos:["W"]},T09:{pos:["W","S"]},T20:{pos:["S"]},T16:{pos:["N"]},T11:{pos:["N"]},T18:{pos:["S","E"]}};
BASE.forEach(t=>{const q=POS[t.id]||{};t.path=q.path||null;t.pos=q.pos||SEC.slice();});
const T11_V2="3.3 노흉 질소·가스 라인 연결 · 기간 {s}~{e} · {h} · 노 내부 중부 · 공기 단축을 위해 1/15로 앞당김 · 선행: 노흉 축조, 노내 비계 해체 완료";

const RISK_NOTE="선행 작업이 끝나기 전에 다른 업체가 가스·질소 라인을 연결하면, 안에서 일하는 인원이 연결 사실을 모른 채 가스에 노출될 수 있습니다.";
const LAW64="산안법 제64조 제1항 제7·8호";
const RULES={
 "R-SZ-01":{level:"금지",kind:"같은 시간·구역",title:"인양 반경 안 다른 업체 작업",law:["안전보건규칙 제14조 (낙하물에 의한 위험 방지)",LAW64],tbm:[{label:"인양 반경 출입 통제",all:[/인양|크레인/,/통제|출입\s?금지|접근\s?금지/]}]},
 "R-VT-01":{level:"조건부",kind:"위아래",title:"상부 인양 바로 아래 작업",law:["안전보건규칙 제14조 (낙하물에 의한 위험 방지)",LAW64],mitig:"방호선반을 설치하고, 노정 인양 시간에는 아래층 인원을 노외로 대피시키는 조건으로 동시 작업을 허용합니다.",tbm:[{label:"방호선반 설치 확인",all:[/방호선반|낙하물\s?방지/]},{label:"상부 인양 시 하부 대피",all:[/인양/,/대피|철수|비우/]}]},
 "R-HF-01":{level:"조건부",kind:"화기×가연물",title:"화기 작업 11m 안 가연물",law:["안전보건규칙 제241조 (화재위험작업 시의 준수사항)","안전보건규칙 제241조의2 (화재감시자)",LAW64],mitig:"불티 비산 방지포로 보온재 작업 구역을 막고 화재감시자를 배치하는 조건으로 동시 작업을 허용합니다.",tbm:[{label:"불티 비산 방지포 설치",all:[/불티|방지포|비산/]},{label:"화재감시자 배치",all:[/화재\s?감시자|감시자/]}]},
 "R-HG-01":{level:"금지",kind:"화기×가스",title:"화기 작업 11m 안 가스 작업",law:["안전보건규칙 제241조 (화재위험작업 시의 준수사항)",LAW64],tbm:[{label:"인접 화기작업 중지·가스 차단",all:[/가스|용접|화기/,/차단|중지|없/],confirm:/확인|중지|차단/}]},
 "R-CG-01":{level:"금지",kind:"같은 시간·구역",title:"축조 중 구역에 가스 라인 연결",law:["안전보건규칙 제619조 (밀폐공간 작업 프로그램의 수립·시행)",LAW64],tbm:[{label:"가스 라인 잠금·표지 유지",all:[/밸브|가스\s?라인|질소/,/잠금|태그|차단/]}]},
 "R-SQ-01":{level:"금지",kind:"작업 순서",title:"선행 작업 완료 전 착수",law:[LAW64,"안전보건규칙 제38조 (사전조사 및 작업계획서의 작성 등)"],tbm:[{label:"선행 작업 완료 확인",all:[/축조|선행/,/완료|끝/],confirm:/확인|받았|서명/},{label:"노내 인원 철수 확인",all:[/철수|사람\s?없|인원/],confirm:/확인|서명/}]},
 "R-DF-01":{level:"결함",kind:"계획 결함",title:"화기 작업 화재감시자 미기재",law:["안전보건규칙 제241조의2 (화재감시자)"],tbm:[{label:"화재감시자 배치",all:[/화재\s?감시자/]}]},
 "R-DF-03":{level:"결함",kind:"표준서 누락",title:"작업표준서 필수 단계 누락",law:["안전보건규칙 제38조 (사전조사 및 작업계획서의 작성 등)","원청 작업표준서"],tbm:[]}
};
/* 시연 녹음: 녹음 속 작업(tasks)이 그날 모두 진행 중일 때만 고른다 */
const TBM_SAMPLES={
 C:[{tasks:["T10","T21"],
    A:{file:"TBM_C사_0115_0650.m4a",len:"2분 40초",label:"녹음 A",text:"오늘 C사 작업은 풍구 냉각수 배관 용단, 오후에 열풍로 BFG 배관 퍼지·연결입니다.\n원청에서 공유한 사항부터 전달합니다. 풍구 쪽은 오후에 D사가 보온재 교체를 하니까 용단 전에 불티 비산 방지포 먼저 설치합니다.\n화재감시자는 박 반장이 맡고 용단 끝날 때까지 자리 지킵니다.\n용단 자리마다 소화기 비치하고 시작합니다.\n열풍로 쪽 B사 연결관 용접은 퍼지 끝날 때까지 중지, 가스 차단 상태는 제가 확인했습니다.\n13시부터 14시까지는 겹치는 작업이 몰리는 위험 시간대라 서로 위치 알리면서 작업합니다.\n연결 후 기밀시험 하고, 들어가기 전에 산소농도 측정합니다."},
    B:{file:"TBM_C사_0115_0650_B.m4a",len:"1분 05초",label:"녹음 B",text:"오늘 풍구 배관 용단하고 오후엔 열풍로 배관 연결합니다. 공정 밀렸으니 빨리 끝냅시다.\n소화기는 늘 있던 데 있습니다.\n열풍로 쪽 용접은 없다고 들었습니다.\n보호구 착용 철저히 하고 안전대 걸고 작업하세요."}},
   {tasks:["T11"],
    A:{file:"TBM_C사_0224_0650.m4a",len:"3분 12초",label:"녹음 A",text:"오늘 작업은 노 내부 중부 질소·가스 라인 연결입니다.\n원청에서 내려온 조정사항부터 전달합니다. 노흉 축조는 어제 완료됐고 A사 반장님께 완료 확인 받았습니다.\n노내 비계 해체도 끝났고, 노내 인원 철수 확인 서명까지 받았습니다.\n질소 밸브는 연결 끝날 때까지 잠금 걸고 태그 붙여둡니다.\n주변 용접 작업은 없는 것 확인했고 가스 차단 상태 유지합니다.\n연결 후 기밀시험까지 하고, 산소농도는 입구에서 한 번 더 재고 들어갑니다."},
    B:{file:"TBM_C사_0224_0650_B.m4a",len:"1분 48초",label:"녹음 B",text:"오늘 노흉 질소 라인 연결 들어갑니다. 공정 급하니까 빨리 끝냅시다.\n노흉 축조는 끝났다고 들었습니다.\n질소 밸브 잠금 태그는 제가 확인했고요.\n보호구 착용 철저히 하고 안전대 걸고 작업하세요."}}]
};
const tbmSet=(p,d)=>(TBM_SAMPLES[p]||[]).find(x=>x.tasks.every(id=>{const t=task(id);return t&&actOn(t,d);}))||null;
/* 보충 전달 시연 문장: 각 항목의 대조 조건을 만족하도록 쓴다 */
const TBM_SAY={
 "인양 반경 출입 통제":"인양 반경 안은 출입 통제합니다.",
 "방호선반 설치 확인":"방호선반 설치 상태 확인하고 들어갑니다.",
 "상부 인양 시 하부 대피":"노정에서 인양하는 동안 아래층 인원은 노외로 대피합니다.",
 "불티 비산 방지포 설치":"용단 전에 보온재 쪽으로 불티 비산 방지포 설치합니다.",
 "화재감시자 배치":"화재감시자는 박 반장이 맡아서 용단 끝날 때까지 자리 지킵니다.",
 "인접 화기작업 중지·가스 차단":"옆 구역 용접은 우리 작업 끝날 때까지 중지, 가스 차단 상태는 제가 직접 확인했습니다.",
 "가스 라인 잠금·표지 유지":"질소 밸브는 잠금 걸고 태그 붙여 둡니다.",
 "선행 작업 완료 확인":"노흉 축조 완료는 A사 반장님께 직접 확인 받았습니다.",
 "노내 인원 철수 확인":"노내 인원 철수는 명부로 확인하고 서명 받았습니다.",
 "기밀시험 실시":"연결 끝나면 기밀시험 하고 나서 엽니다.",
 "산소농도 측정":"들어가기 전에 입구에서 산소농도 측정합니다.",
 "소화기 비치":"용단 자리마다 소화기 비치합니다.",
 "노내 가스 농도 측정":"노내 가스 농도 측정하고 들어갑니다.",
 "환기·산소농도 측정":"환기 돌리고 산소농도 재고 들어갑니다.",
 "하부 출입 통제":"인양 중에는 하부 출입 통제합니다.",
 "신호수 배치":"인양할 때 신호수 한 명 붙입니다.",
 "인접 화기작업 확인":"옆에 용접 작업 없는지 확인하고 시작합니다.",
 "안전대 체결":"높은 데서는 안전대 반드시 체결합니다."
};
const tbmSay=it=>TBM_SAY[it.label]||(it.say||`${it.label} 전달합니다.`);

/* ================= 상태 ================= */
let S, upTimer=null;
function fresh(){
  const tasks=BASE.map(t=>({...t,types:[...t.types],pre:[...t.pre],fw:t.fw===undefined?null:t.fw,ok:!t.conf,src:fill(t.tpl,t),moved:null}));
  return {tasks,ver:{A:1,B:1,C:1,D:1,E:1},fst:{A:"ok",B:"ok",C:"ok",D:"ok",E:"ok"},files:[],role:"HQ",day:65,sel:null,
    conflicts:[],mitig:{},seen:new Set(),newKeys:new Set(),log:[],adjusted:[],shared:new Set(),riskSent:new Set(),banner:null,lastMs:0,lastApply:null,undo:null,
    chat:[],chatOpen:false,heard:null,drawer:null,upOpen:null,mmode:"conf",mview:"3d",mzone:null,
    tbm:{p:"C",sample:"A",text:"",rec:false,runs:{},key:null},hfilt:"전체",step:0,focus:null,ptab:"A",delays:{},urgent:[],useq:0,dform:{t:null,h1:null,why:""},events:[],holds:[],started:{},eseq:0,xseq:0,lvl:"hq",notes:[],notiOpen:false,mhour:10.5,extOpen:false,
    eform:{tab:"job",p:"C",name:"노 내부 중부 가스 배관 누설 긴급 차단",zone:"Z3",h0:13,h1:15,crew:4,types:["가스"],vk:"wind",vz:"Z3",vh1:15,secs:["N"]},
    review:Object.fromEntries(PARTNERS.map(p=>[p.id,{v:1,st:"반영"}])),
    hist:Object.fromEntries(PARTNERS.map(p=>[p.id,[{v:1,time:UPT[p.id],by:p.lead,st:"반영",note:"첫 제출 · 구조화 완료"}]]))};
}
const task=id=>S.tasks.find(t=>t.id===id);
const P=id=>PARTNERS.find(p=>p.id===id);
const zn=z=>ZONES[z].name;
const pc=p=>`var(--p${p})`;
function clock(){const x=new Date();return `${x.getMonth()+1}/${x.getDate()} ${z2(x.getHours())}:${z2(x.getMinutes())}`;}
const involves=(c,p)=>task(c.a)?.p===p||(c.b&&task(c.b)?.p===p);
const visC=()=>S.role==="HQ"?S.conflicts:S.conflicts.filter(c=>involves(c,S.role));
const actOn=(t,d)=>t.s<=d&&d<=t.e;
const fileName=p=>S.ver[p]>1?P(p).file.replace(/(\.[a-z]+)$/i,`_v${S.ver[p]}$1`):P(p).file;
const iso=d=>{const x=dDate(d);return `${x.getFullYear()}-${z2(x.getMonth()+1)}-${z2(x.getDate())}`;};
const dayOfIso=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||"");if(!m)return null;return Math.round((new Date(+m[1],+m[2]-1,+m[3])-D0)/864e5)+1;};
const own=t=>S.role==="HQ"||t.p===S.role;
const isBase=t=>!t.delayOf;
const HZ=t=>t.types.includes("중량물")?"인양 작업":t.types.includes("가스")?"가스 배관 작업":t.types.includes("화기")?"화기 작업":t.types.includes("가연물")?"가연물 작업":t.types.includes("밀폐")?"밀폐공간 작업":t.types.includes("고소")?"고소 작업":"작업";
const pn=t=>own(t)?P(t.p).name:"타사";
const tn=t=>inScope(t)?t.name:HZ(t);
function secAt(t,h){if(t.path){const g=t.path.find(([a,b])=>h>=a&&h<b);if(g)return [g[2]];if(t.delayOf&&h>=t.h0&&h<t.h1)return [t.path[t.path.length-1][2]];return [];}return t.pos||SEC.slice();}
function hz(s,o){if(s.id===o.id||s.p===o.p||(s.delayOf&&s.delayOf===o.id))return null;
  const hs=k=>s.types.includes(k),ho=k=>o.types.includes(k),dd=dist(s.zone,o.zone);
  if(hs("중량물")&&s.zone===o.zone)return {k:"같은 층 인양",lv:"ban",all:false};
  if(hs("중량물")&&ZONES[s.zone].col&&ZONES[o.zone].col&&ZONES[s.zone].elev>ZONES[o.zone].elev)return {k:"상부 인양",lv:"cond",all:false};
  if(hs("가스")&&(ho("밀폐")||ho("화기"))&&dd<=11)return {k:"가스 작업",lv:"ban",all:true};
  if(hs("화기")&&(ho("가연물")||ho("가스"))&&dd<=11)return {k:"화기 작업",lv:ho("가스")?"ban":"cond",all:false};
  return null;}
function relates(s,o,d){return actOn(s,d)&&actOn(o,d)&&s.h0<o.h1&&o.h0<s.h1&&!!hz(s,o);}
let _sc={k:"",set:new Set()};
function inScope(t){if(S.role==="HQ"||t.p===S.role)return true;const k=S.role+"|"+S.day+"|"+S.tasks.length+"|"+S.conflicts.length+"|"+S.lastMs;
  if(_sc.k!==k){const set=new Set(),mine=S.tasks.filter(o=>o.p===S.role);S.tasks.forEach(s=>{if(s.p!==S.role&&mine.some(o=>relates(s,o,S.day)))set.add(s.id);});
    S.conflicts.forEach(c=>{if(involves(c,S.role)){set.add(c.a);if(c.b)set.add(c.b);}});_sc={k,set};}
  return _sc.set.has(t.id);}
function guide(o,d){const bands=[];let cur=null;
  for(let h=o.h0;h<o.h1;h+=.5){const infl=[];
    S.tasks.forEach(s=>{if(!actOn(s,d)||!(h>=s.h0&&h<s.h1))return;const r=hz(s,o);if(!r)return;const secs=r.all?SEC.slice():secAt(s,h);if(secs.length)infl.push({s,r,secs});});
    const map={};SEC.forEach(k=>map[k]="safe");infl.forEach(i=>i.secs.forEach(k=>{map[k]="danger";}));
    infl.forEach(i=>{if(!i.r.all)i.secs.forEach(k=>ADJS[k].forEach(a=>{if(map[a]==="safe")map[a]="caution";}));});
    const sig=SEC.map(k=>map[k]).join(",")+"|"+infl.map(i=>i.s.id+":"+i.secs.join("")).join(",");
    if(cur&&cur.sig===sig)cur.h1=h+.5;else{cur={h0:h,h1:h+.5,map,infl,sig};bands.push(cur);}}
  return bands;}
function advice(b,o){const av=o.pos||SEC,safe=av.filter(k=>b.map[k]==="safe"),cau=av.filter(k=>b.map[k]==="caution"),dan=SEC.filter(k=>b.map[k]==="danger"),nm=a=>a.map(k=>SECN[k]).join("·");
  if(!b.infl.length)return {lv:"ok",txt:"영향 없음 · 계획대로 작업"};
  if(safe.length)return {lv:"ok",txt:`${nm(safe)}에서 작업${dan.length?` · ${nm(dan)} 출입 금지`:""}`};
  if(cau.length)return {lv:"cond",txt:`${nm(cau)}에서만 감시자 배치 후 작업 · ${nm(dan)} 출입 금지`};
  return {lv:"ban",txt:"이 시간에는 작업 보류 · 위험 작업이 끝난 뒤 착수"};}
function secSvg(map,sz=56){const c=sz/2,r=sz/2-2,col={danger:"var(--red)",caution:"var(--amber)",safe:"var(--ok-soft)"},A={N:[-135,-45],E:[-45,45],S:[45,135],W:[135,225]};
  const w=(a0,a1)=>{const q=a=>[c+r*Math.cos(a*Math.PI/180),c+r*Math.sin(a*Math.PI/180)],[x0,y0]=q(a0),[x1,y1]=q(a1);return `M${c},${c} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`;};
  return `<svg viewBox="0 0 ${sz} ${sz}" width="${sz}" height="${sz}" role="img" aria-label="${SEC.map(k=>SECN[k]+" "+({danger:"위험",caution:"주의",safe:"안전"}[map[k]])).join(", ")}">${SEC.map(k=>`<path d="${w(A[k][0],A[k][1])}" style="fill:${col[map[k]]};stroke:var(--surface)" stroke-width="1.5"/>`).join("")}<circle cx="${c}" cy="${c}" r="${(r*.32).toFixed(1)}" style="fill:var(--surface)"/><text x="${c}" y="10" text-anchor="middle" font-size="8" style="fill:var(--surface)">북</text></svg>`;}
function guideHtml(o,bands){return `<div class="gtask"><div><b>${esc(o.name)}</b> · ${zn(o.zone)} · <span class="t">${hr(o.h0,o.h1)}</span>${own(o)?` · <b>${o.crew}명</b>`:""}</div><div class="gbands">${bands.map(b=>{const a=advice(b,o),now=NOW>=b.h0&&NOW<b.h1;
  return `<div class="gb ${now?"now":""}">${secSvg(b.map)}<div class="gtx"><div><span class="t">${hr(b.h0,b.h1)}</span>${now?` <span class="pill mute" style="color:var(--blue)">지금</span>`:""}</div><div class="gadv ${a.lv}">${a.txt}</div>${b.infl.map(i=>`<div class="sub">${esc(pn(i.s)+" "+tn(i.s))} · ${i.r.k} · ${zn(i.s.zone)} ${i.secs.length===4?"전체":i.secs.map(k=>SECN[k]).join("·")}</div>`).join("")}</div></div>`;}).join("")}</div></div>`;}
function zoneMap(z,d,h){const tz=S.tasks.filter(t=>t.zone===z&&actOn(t,d)),o={id:"_z",p:"_z",zone:z,types:[...new Set(tz.flatMap(t=>t.types))],pos:SEC},map={},src=[];SEC.forEach(k=>map[k]="safe");
  S.tasks.forEach(s=>{if(!actOn(s,d)||!(h>=s.h0&&h<s.h1))return;if(S.role!=="HQ"&&!inScope(s))return;const r=hz(s,o);if(!r)return;const secs=r.all?SEC.slice():secAt(s,h);if(secs.length)src.push({s,r,secs});});
  src.forEach(i=>i.secs.forEach(k=>map[k]="danger"));src.forEach(i=>{if(!i.r.all)i.secs.forEach(k=>ADJS[k].forEach(a=>{if(map[a]==="safe")map[a]="caution";}));});return {map,src};}
const crewS=t=>own(t)?`<b>${t.crew}명</b>이`:"작업자가";
const strip=s=>String(s).replace(/<[^>]+>/g,"");
function mask(s){if(S.role==="HQ"||s==null)return s;let o=String(s);
  S.tasks.forEach(t=>{if(t.p!==S.role&&!inScope(t))o=o.split(t.name).join("타사 "+HZ(t));});
  PARTNERS.forEach(p=>{if(p.id!==S.role){o=o.split(p.lead).join("책임자");o=o.split(p.name).join("타사");}});
  return o.replace(/타사 타사/g,"타사");}

/* ================= F8 표준서 매칭 · F2 규칙 엔진 ================= */
function stdMissing(t){const s=STD[t.std];if(!s||!s.req)return [];return s.req.filter(r=>!r.re.test(t.src)).map(r=>r.name);}
function evaluate(tasks,mitig){
  const out=[],by=Object.fromEntries(tasks.map(t=>[t.id,t])),has=(t,k)=>t.types.includes(k);
  const ov=(a,b)=>{const f=Math.max(a.s,b.s),to=Math.min(a.e,b.e),h0=Math.max(a.h0,b.h0),h1=Math.min(a.h1,b.h1);return f<=to&&h0<h1?{f,to,h0,h1}:null;};
  const push=(rule,a,b,w,x)=>{const key=`${rule}:${a.id}${b?"-"+b.id:""}`;out.push({key,rule,level:RULES[rule].level,a:a.id,b:b?b.id:null,from:w.f,to:w.to,h0:w.h0,h1:w.h1,status:RULES[rule].level==="조건부"&&(mitig[key]||mitig[key.replace(/\+\d+/g,"")])?"met":"open",...(x||{})});};
  for(let i=0;i<tasks.length;i++)for(let j=0;j<tasks.length;j++){
    if(i===j)continue;const a=tasks[i],b=tasks[j];if(a.p===b.p)continue;const w=ov(a,b);if(!w)continue;const d=dist(a.zone,b.zone);
    if(a.zone===b.zone&&has(a,"중량물")&&(!has(b,"중량물")||i<j))push("R-SZ-01",a,b,w);
    if(ZONES[a.zone].col&&ZONES[b.zone].col&&ZONES[a.zone].elev>ZONES[b.zone].elev&&has(a,"중량물"))push("R-VT-01",a,b,w,{dist:d});
    if(has(a,"화기")&&has(b,"가연물")&&d<=11)push("R-HF-01",a,b,w,{dist:d});
    if(has(a,"화기")&&has(b,"가스")&&d<=11)push("R-HG-01",a,b,w,{dist:d});
    if(a.zone===b.zone&&has(a,"가스")&&has(b,"밀폐"))push("R-CG-01",a,b,w);
  }
  for(const t of tasks){
    if(t.delayOf)continue;
    for(const pid of t.pre){const q=by[pid];if(q&&t.s<=q.e)push("R-SQ-01",t,q,{f:t.s,to:Math.min(q.e,t.e),h0:t.h0,h1:t.h1});}
    if(has(t,"화기")&&t.fw!==true)push("R-DF-01",t,null,{f:t.s,to:t.e,h0:t.h0,h1:t.h1});
    const ms=stdMissing(t);if(ms.length)push("R-DF-03",t,null,{f:t.s,to:t.e,h0:t.h0,h1:t.h1},{missing:ms});
  }
  out.sort((x,y)=>(x.status==="met")-(y.status==="met")||LVO[x.level]-LVO[y.level]||x.from-y.from||x.h0-y.h0);
  return out;
}
function rejudge(){
  const t0=performance.now(),prev=new Set(S.conflicts.filter(c=>c.status==="open").map(c=>c.key));
  S.conflicts=evaluate(S.tasks,S.mitig);S.lastMs=performance.now()-t0;
  const open=S.conflicts.filter(c=>c.status==="open").map(c=>c.key);
  const added=open.filter(k=>!prev.has(k)),resolved=[...prev].filter(k=>!open.includes(k));
  added.forEach(k=>{if(!S.seen.has(k))S.newKeys.add(k);S.seen.add(k);});
  if(S.sel&&!S.conflicts.find(c=>c.key===S.sel))S.sel=null;
  return {added,resolved};
}
function labelOf(key){const [r,ids]=key.split(":");const [a,b]=ids.split("-");const A=task(a),B=b?task(b):null;const nm=t=>own(t)?t.name:"타사 "+tn(t);return `${A?nm(A):a}${B?(r==="R-SQ-01"?" ← 선행 ":" ↔ ")+nm(B):""}`;}

/* ================= F9 위험 시간대 ================= */
function riskSlots(day,role){
  const s=new Array(24).fill(0),why=Array.from({length:24},()=>[]);
  S.conflicts.filter(c=>c.status==="open"&&c.b&&c.from<=day&&day<=c.to&&(!role||role==="HQ"||involves(c,role))).forEach(c=>{
    const w=c.level==="금지"?3:2;for(let i=0;i<24;i++){const h=7+i*.5;if(h>=c.h0&&h<c.h1){s[i]+=w;why[i].push(c);}}});
  return {s,why};
}
function riskPeak(day,role){
  const {s,why}=riskSlots(day,role);let best=0;s.forEach(v=>{if(v>best)best=v;});if(!best)return null;
  let i0=s.indexOf(best),i1=i0;while(i1+1<24&&s[i1+1]===best)i1++;
  return {h0:7+i0*.5,h1:7+(i1+1)*.5,score:best,cs:[...new Set(why[i0].map(c=>c.key))].map(k=>S.conflicts.find(c=>c.key===k))};
}
const rcls=v=>v>=5?"r3":v>=3?"r2":v>0?"r1":"";

/* ================= 문장 (v2 규칙: 빨강 1개, 사람 수 진하게, 시각 파랑) ================= */
function sentence(c){
  const A=task(c.a),B=c.b?task(c.b):null,tm=`<span class="t">${hr(c.h0,c.h1)}</span>`,e=esc,dt=c.dist?`${c.dist}m 안`:"같은 구역";
  switch(c.rule){
    case "R-VT-01":return `${zn(A.zone)}에서 ${pn(A)}가 크레인 인양 중인데, <span class="kw">바로 아래</span> ${zn(B.zone)}에서 ${pn(B)} ${crewS(B)} 일하고 있습니다. ${tm}`;
    case "R-SZ-01":return `${zn(A.zone)}에서 ${pn(A)}가 ${e(tn(A))}을 하는 <span class="kw">인양 반경 안</span>에서 ${pn(B)} ${crewS(B)} 작업합니다. ${tm}`;
    case "R-HF-01":return `${zn(A.zone)}에서 ${pn(A)}가 용단하는 <span class="kw">${dt}</span>에서 ${pn(B)} ${crewS(B)} 가연성 보온재를 교체합니다. ${tm}`;
    case "R-HG-01":return `${pn(A)} 화기 작업 ${dt}에서 ${pn(B)}가 <span class="kw">가스 배관</span>을 엽니다. ${tm}`;
    case "R-CG-01":return `${pn(B)} ${crewS(B)} 축조 중인 ${zn(B.zone)}에 ${pn(A)}가 <span class="kw">질소·가스 라인</span>을 연결합니다. ${tm}`;
    case "R-SQ-01":return `${pn(A)}의 ${e(tn(A))}이 선행 작업 ${own(B)?"":"타사 "}${e(B.name)}의 <span class="kw">완료 전</span>에 시작합니다. 선행 작업은 <span class="t">${mdw(B.e)}</span>에 끝납니다.`;
    case "R-DF-01":return `${pn(A)} ${e(tn(A))} 계획서에 <span class="kw">화재감시자</span> 배치가 없습니다. ${tm}`;
    case "R-DF-03":return `${pn(A)} ${e(tn(A))} 계획서에 표준서 필수 단계 <span class="kw">${e(c.missing.join(", "))}</span>이 빠져 있습니다. ${tm}`;
  }
  return "";
}
function proposals(c){
  const A=task(c.a),B=c.b?task(c.b):null,R=RULES[c.rule],L=[];
  if(c.rule==="R-SQ-01"||c.rule==="R-CG-01"){
    const ns=Math.max(B.e,...A.pre.map(id=>task(id)?task(id).e:0))+1;
    L.push({id:"day",task:A.id,ns,kind:"순서 변경",short:`${A.name} ${md(A.s)} → ${md(ns)}`,text:`선행 작업 완료와 노내 인원 철수를 확인한 뒤 연결합니다. ${A.name} 시작을 ${mdw(A.s)}에서 ${mdw(ns)}로 옮깁니다.`});
  }else if(c.rule==="R-DF-01"){L.push({id:"fix",kind:"보완 반영",short:"화재감시자 배치 보완",text:`${P(A.p).name}에 화재감시자 배치 보완을 요청하고 보완본(화재감시자 1명)을 반영합니다.`});}
  else if(c.rule==="R-DF-03"){L.push({id:"fixstd",kind:"보완 반영",short:`${c.missing.join(", ")} 보완`,text:`${P(A.p).name}에 표준서 필수 단계(${c.missing.join(", ")}) 보완을 요청하고 보완본을 반영합니다.`});}
  else if(B){
    if(R.level==="조건부")L.push({id:"mitig",kind:"조건부 허용",short:"안전 조건 후 동시 작업",text:R.mitig});
    const mv=A.h0>B.h0?A:B,ot=mv===A?B:A,dur=mv.h1-mv.h0;
    if(ot.h1+dur<=19)L.push({id:"hour",task:mv.id,nh:ot.h1,kind:"시간대 분리",short:`${mv.name} ${hr(mv.h0,mv.h1)} → ${hr(ot.h1,ot.h1+dur)}`,text:`${P(mv.p).name}의 ${mv.name}을 ${hr(ot.h1,ot.h1+dur)}로 옮겨, 같은 날 시간이 겹치지 않게 합니다.`});
    const md2=A.s>B.s?A:B,od=md2===A?B:A;
    L.push({id:"day",task:md2.id,ns:od.e+1,kind:"일정 이동",short:`${md2.name} ${md(md2.s)} → ${md(od.e+1)}`,text:`${P(md2.p).name}의 ${md2.name} 시작을 ${od.name}이 끝난 다음 날인 ${mdw(od.e+1)}로 옮깁니다.`});
  }
  return L;
}

/* ================= F4 조정 · F5 공유 ================= */
const who=()=>($("#who")&&$("#who").value)||HQ[0];
function applyCore(key,pid,o){
  const c=S.conflicts.find(x=>x.key===key);if(!c)return null;const pr=proposals(c).find(p=>p.id===pid);if(!pr)return null;
  const w=o.who;S.undo={tasks:JSON.parse(JSON.stringify(S.tasks)),mitig:{...S.mitig},label:pr.short};
  const A=task(c.a),B=c.b?task(c.b):null;let mv=null;
  if(pr.id==="day"){const t=task(pr.task),d=t.e-t.s;mv={id:t.id,before:{s:t.s,e:t.e,h0:t.h0,h1:t.h1}};t.s=pr.ns;t.e=pr.ns+d;mv.after={s:t.s,e:t.e,h0:t.h0,h1:t.h1};t.moved=mv;}
  if(pr.id==="hour"){const t=task(pr.task),d=t.h1-t.h0;mv={id:t.id,before:{s:t.s,e:t.e,h0:t.h0,h1:t.h1}};t.h0=pr.nh;t.h1=pr.nh+d;mv.after={s:t.s,e:t.e,h0:t.h0,h1:t.h1};t.moved=mv;}
  if(pr.id==="mitig")S.mitig[key]=pr.text;
  if(pr.id==="fix")A.fw=true;
  if(pr.id==="fixstd"){A.src+=" / "+c.missing.join(", ")+" 반영(보완본)";}
  const lab=labelOf(key);const {added,resolved}=rejudge();const parties=[...new Set([A.p,B&&B.p].filter(Boolean))],t=clock();
  S.log.unshift({time:t,type:o.type,key,sum:lab,dec:pr.text,who:w,rule:c.rule,law:RULES[c.rule].law.join(" / "),parties});
  S.log.unshift({time:t,type:"공유",sum:`결과 → ${parties.map(p=>P(p).name).join("·")}`,dec:"자기 작업과 겹친 내용과 조정 결과만 전달",who:"시스템",rule:c.rule,law:"",parties});
  S.adjusted.unshift({key,rule:c.rule,rules:[...new Set([c.rule,...resolved.map(k=>k.split(":")[0])])],a:c.a,b:c.b,parties,dec:pr.text,short:pr.short,who:w,time:t,mv});
  parties.forEach(p=>S.shared.add(key+"|"+p));
  S.lastApply={label:lab,pr,added,resolved,who:w,time:t};
  return {added,resolved,pr};
}
function applyProp(key,pid){
  if(S.role!=="HQ")return;const r=applyCore(key,pid,{who:who(),type:"조정"});if(!r)return;
  if(r.pr.task){const tp=task(r.pr.task).p;S.hist[tp].push({v:S.ver[tp],time:clock(),by:HQN,st:"본청 조정",note:`포스코 본청 직접 조정 · ${r.pr.short}`});S.review[tp].st="반영";if(tp==="C")S.banner=null;}
  toast(`포스코 본청 조정 · 해소 ${r.resolved.length}건 · 새 충돌 ${r.added.length}건 (${S.lastMs.toFixed(1)}ms)`);
  S.sel=null;S.drawer={kind:"result",anim:false};renderAll();
}
function reject(key){
  if(S.role!=="HQ")return;const c=S.conflicts.find(x=>x.key===key);if(!c)return;
  const prq=proposals(c).find(x=>x.task)||proposals(c)[0];const tp=prq.task?task(prq.task).p:task(c.a).p;
  const rv=S.review[tp];rv.st="반려";rv.key=key;rv.pid=prq.id;rv.reason=strip(sentence(c));rv.req=prq.short;rv.by=who();rv.time=clock();
  const hs=S.hist[tp];Object.assign(hs[hs.length-1],{st:"반려",reason:rv.reason});
  S.shared.add(key+"|"+tp);
  S.log.unshift({time:rv.time,type:"반려",key,sum:`${P(tp).name} 계획서 v${rv.v} 반려`,dec:`사유: ${rv.reason} · 수정 요구: ${prq.short}`,who:rv.by,rule:c.rule,law:RULES[c.rule].law.join(" / "),parties:[tp]});
  note([tp,"HQ"],`계획서 반려 · ${P(tp).name} v${rv.v}`,`사유: ${rv.reason} · 수정 요구: ${prq.short}`,"반려");
  toast(`포스코 본청이 ${P(tp).name} 계획서 v${rv.v}를 반려했습니다 · 수정본을 기다립니다`);
  S.drawer=null;S.sel=null;renderAll();
}
function resubmit(p){
  const rv=S.review[p];if(!rv||rv.st!=="반려")return;const nv=rv.v+1,keep=S.role;let r=null;
  try{S.role="HQ";r=applyCore(rv.key,rv.pid,{who:`${P(p).name} ${P(p).lead} (수정본 v${nv})`,type:"재제출"});}finally{S.role=keep;}
  S.ver[p]=nv;rv.v=nv;rv.st="반영";S.hist[p].push({v:nv,time:clock(),by:P(p).lead,st:"반영",note:`포스코 본청 반려 사유 반영 · ${rv.req}`});
  if(p==="C")S.banner=null;S.lastApply=null;note(["HQ",p],`수정본 제출 · ${P(p).name} v${nv}`,rv.req,"재제출");
  toast(`${P(p).name} 수정본 v${nv} 반영 · 다시 대조: 해소 ${r?r.resolved.length:0}건 · 새 충돌 ${r?r.added.length:0}건`);renderAll();
}
function undoLast(){if(!S.undo)return;S.tasks=S.undo.tasks;S.mitig=S.undo.mitig;const {added}=rejudge();
  S.log.unshift({time:clock(),type:"되돌림",sum:`${S.undo.label} 취소`,dec:`다시 생긴 충돌 ${added.length}건`,who:who(),rule:"",law:"",parties:[]});
  S.adjusted.shift();S.undo=null;S.lastApply=null;S.drawer=null;toast("조정을 되돌렸습니다");renderAll();}
function shareC(key){const c=S.conflicts.find(x=>x.key===key);if(!c)return;const parties=[...new Set([task(c.a).p,c.b&&task(c.b).p].filter(Boolean))];
  parties.forEach(p=>S.shared.add(key+"|"+p));S.log.unshift({time:clock(),type:"공유",sum:`${labelOf(key)} → ${parties.map(p=>P(p).name).join("·")}`,dec:"조정 전 충돌 알림",who:who(),rule:c.rule,law:RULES[c.rule].law.join(" / "),parties});
  toast(`${parties.map(p=>P(p).name).join("·")}에 공유했습니다`);renderAll();}
function sendRisk(){const pk=riskPeak(S.day);if(!pk)return;const parties=[...new Set(pk.cs.flatMap(c=>[task(c.a).p,c.b&&task(c.b).p]).filter(Boolean))];
  S.riskSent.add(S.day);S.log.unshift({time:clock(),type:"위험 공지",sum:`${md(S.day)} ${hr(pk.h0,pk.h1)} 위험 시간대`,dec:pk.cs.map(c=>labelOf(c.key)).join(" / "),who:who(),rule:"F9",law:"",parties});
  toast(`${parties.map(p=>P(p).name).join("·")}에 위험 시간대를 공지했습니다`);renderAll();}
function receiveV2(){
  if(S.ver.C>=2)return [];const t=task("T11");const before={s:t.s,e:t.e,h0:t.h0,h1:t.h1};t.s=65;t.e=70;t.src=fill(T11_V2,t);S.ver.C=2;
  S.review.C={v:2,st:"검토 중"};S.hist.C.push({v:2,time:clock(),by:"김태오 소장",st:"검토 중",note:"T11 질소·가스 라인 연결 2/24 → 1/15 (공기 단축)"});
  const {added}=rejudge();S.banner={added,before};
  S.log.unshift({time:clock(),type:"계획 변경",sum:"C사_배관_작업계획서_v2.pdf 수신 · T11 2/24 → 1/15",dec:`자동 재대조 ${S.lastMs.toFixed(1)}ms · 새 충돌 ${added.length}건`,who:"C사 김태오 소장",rule:"",law:"",parties:["C"]});
  note(["HQ","C"],"계획서 변경 · C사 v2",`T11 2/24 → 1/15 · 새 충돌 ${added.length}건`,"변경");
  toast(`C사 변경본 반영 · 새 충돌 ${added.length}건`);return added;
}

/* ================= 실시간 지연 보고 · 긴급 알림 ================= */
function delayTasks(id,nh1,d){const t=task(id);const pid=id+"+"+d;const ts=S.tasks.filter(x=>x.id!==pid);
  ts.push({...JSON.parse(JSON.stringify(t)),id:pid,delayOf:id,name:t.name+" (지연)",s:d,e:d,h0:t.h1,h1:nh1,pre:[],moved:null,ok:true,src:`지연 보고 ${md(d)} · 종료 ${hh(t.h1)} → ${hh(nh1)}`});return ts;}
function previewDelay(id,nh1){const t=task(id);if(!t||!(nh1>t.h1))return [];const ts=delayTasks(id,nh1,S.day),by=Object.fromEntries(ts.map(x=>[x.id,x]));
  const open=new Set(S.conflicts.filter(c=>c.status==="open").map(c=>c.key));
  return evaluate(ts,S.mitig).filter(c=>c.status==="open"&&!open.has(c.key)&&c.b).map(c=>({c,o:by[c.a].delayOf===id?by[c.b]:by[c.a]}));}
function beep(){try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;const ac=new A();[0,.24].forEach((t,i)=>{const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=i?660:880;g.gain.setValueAtTime(.0001,ac.currentTime+t);g.gain.exponentialRampToValueAtTime(.18,ac.currentTime+t+.02);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+t+.18);o.connect(g);g.connect(ac.destination);o.start(ac.currentTime+t);o.stop(ac.currentTime+t+.2);});setTimeout(()=>ac.close(),900);}catch(e){}}
function reportDelay(id,nh1,why,by){
  const t=task(id);if(!t||!(nh1>t.h1))return;const d=S.day,oh1=t.h1;
  S.tasks=delayTasks(id,nh1,d);const {added}=rejudge();
  S.log.unshift({time:clock(),type:"지연 보고",sum:`${P(t.p).name} ${t.name} 종료 ${hh(oh1)} → ${hh(nh1)} (${md(d)})`,dec:`사유: ${why} · 자동 재대조 ${S.lastMs.toFixed(1)}ms · 새 겹침 ${added.length}건`,who:by,rule:"",law:"",parties:[t.p]});
  raiseEvent({kind:"지연",title:`작업 지연 · ${t.name} 종료 ${hh(oh1)} → ${hh(nh1)}`,desc:`${P(t.p).name} 보고 · 사유: ${why}`,by},affFromAdded(added,[id+"+"+d]));
  toast(added.length?`지연 반영 · 전체 알림 · 위험 해당 공정 ${added.length}건 착수 보류`:`지연을 기록하고 전체 알림을 보냈습니다 · 새로 겹치는 작업은 없습니다`);
}
const RCOND={"R-CG-01":"가스 차단·환기·산소농도 측정 정상 확인 후 착수","R-HG-01":"인접 가스 작업 종료·가스 차단 확인 후 화기 작업 착수","R-SZ-01":"인양 종료·인양 반경 출입통제 해제 확인 후 착수","R-SQ-01":"선행 작업 완료 확인 후 착수"};
const holdsOf=(tid,d)=>S.holds.filter(x=>x.tid===tid&&x.day===d);
const byWho=()=>S.role==="HQ"?HQ[0]:S.lvl==="lead"?`${P(S.role).name} ${P(S.role).part}`:`${P(S.role).name} 작업자`;
const canApprove=x=>S.role==="HQ"||(S.lvl==="lead"&&task(x.tid)&&task(x.tid).p===S.role);
function affFromAdded(added,srcIds){const keep=S.role,out=[];
  try{S.role="HQ";added.forEach(k=>{const c=S.conflicts.find(x=>x.key===k);if(!c||!c.b)return;const A=task(c.a),B=task(c.b);
    const o=srcIds.includes(A.id)?B:srcIds.includes(B.id)?A:null;if(!o)return;const pr=proposals(c);
    out.push({tid:o.delayOf||o.id,h0:c.h0,h1:c.h1,reason:strip(sentence(c)),key:k,cond:RCOND[c.rule]||RULES[c.rule].mitig||"인접 작업 종료 확인 후 착수"});
    S.shared.add(k+"|"+o.p);});}finally{S.role=keep;}
  return out;}
function note(tg,title,body,kind){S.notes.unshift({id:"n"+(++S.eseq),time:clock(),tg,title,body,kind,read:new Set()});
  try{if("Notification" in window&&Notification.permission==="granted")new Notification("한솥밥 · "+title,{body:strip(body||"")});}catch(e){}}
const myNotes=()=>S.notes.filter(n=>n.tg==="all"||n.tg.includes(S.role));
function renderNoti(){const L=myNotes(),un=L.filter(n=>!n.read.has(S.role)).length,b=$("#bellN");b.hidden=!un;b.textContent=un;document.title=(un?`(${un}) `:"")+"한솥밥 현장 상황판";
  const host=$("#notiHost");if(!S.notiOpen){host.innerHTML="";return;}
  const nst=typeof Notification==="undefined"?"이 환경은 브라우저 알림을 지원하지 않습니다":Notification.permission==="granted"?"브라우저 알림 켜짐":"화면 안 알림은 항상 표시됩니다";
  host.innerHTML=`<div class="npanel" role="dialog" aria-label="알림"><header><b>알림</b><span class="sub">${un}개 안 읽음</span><span class="grow"></span><button class="link" data-act="nall">모두 읽음</button><button class="x" data-act="bell" aria-label="닫기">×</button></header>
    <div class="nlist">${L.map(n=>`<button class="ni ${n.read.has(S.role)?"":"un"}" data-act="nread" data-id="${n.id}"><span class="nk ${n.kind}">${n.kind}</span><span class="nb"><span>${esc(mask(n.title))}</span><span class="sub">${esc(mask(strip(n.body||"")))}</span></span><span class="t" style="font-size:12px">${esc(n.time.split(" ")[1]||"")}</span></button>`).join("")||`<div class="empty">알림이 없습니다</div>`}</div>
    <footer><button class="btn sm" data-act="nperm">브라우저 알림 켜기</button><span class="sub">${nst}</span></footer></div>`;}
function raiseEvent(ev,aff){
  ev.id="e"+(++S.eseq);ev.time=clock();ev.day=S.day;ev.ack=new Set();S.events.unshift(ev);
  const seen=new Set();aff.forEach(a=>{const k=a.tid+"|"+ev.day;if(seen.has(k))return;seen.add(k);
    S.holds.unshift({id:"h"+(++S.eseq),tid:a.tid,day:ev.day,h0:a.h0,h1:a.h1,ev:ev.id,reason:a.reason,key:a.key||null,st:"대기",cond:a.cond||""});
    const t=task(a.tid);S.log.unshift({time:ev.time,type:"착수 보류",sum:`${P(t.p).name} ${t.name} ${hr(a.h0,a.h1)}`,dec:`포스코 본청 승인 전 착수 불가 · ${a.reason}`,who:"시스템",rule:"",law:LAW64,parties:[t.p]});});
  const parties=[...new Set([...seen].map(k=>task(k.split("|")[0]).p))];
  S.log.unshift({time:ev.time,type:"전체 알림",sum:ev.title,dec:`전 협력사·포스코 본청에 전체 알림 · 위험 해당 공정 ${seen.size}건 착수 보류${parties.length?" ("+parties.map(p=>P(p).name).join("·")+")":""}`,who:ev.by,rule:"",law:"",parties:PARTNERS.map(p=>p.id)});
  note("all",ev.title,`${ev.desc} · 위험 해당 공정 ${seen.size}곳 착수 보류`,"전체");
  [...seen].forEach(k=>{const t=task(k.split("|")[0]);note(["HQ",t.p],`착수 보류 · ${t.name}`,"직영관리자 또는 파트장 승인 전 착수 불가","보류");});
  beep();return seen.size;
}
const HOPT=from=>{const a=[];for(let v=from;v<=19;v+=.5)a.push(v);return a;};
const VARS=[{k:"wind",label:"강풍 경보",title:"강풍 경보 (순간 풍속 15m/s)",match:t=>t.types.includes("중량물")||t.types.includes("고소"),cond:"풍속 10m/s 이하 확인 후 착수"},
            {k:"gas",label:"가스 농도 이상",title:"가스 농도 이상",match:(t,f)=>dist(t.zone,f.vz)<=11,cond:"가스·산소 농도 재측정 정상 확인 후 착수"}];
function jobTask(f,id){const ty=[...f.types];return {id,p:f.p,name:f.name||"긴급 작업",zone:f.zone,s:S.day,e:S.day,h0:f.h0,h1:f.h1,crew:Math.max(1,+f.crew||1),types:ty,pre:[],fw:ty.includes("화기")?true:null,
  std:ty.includes("가스")?"SOP-GP-01":ty.includes("화기")?"SOP-HW-01":ty.includes("중량물")?"SOP-LF-01":"SOP-EL-01",sc:.8,ok:true,emerg:true,moved:null,path:null,pos:(f.secs&&f.secs.length?[...f.secs]:SEC.slice()),
  src:`긴급 작업 등록 ${md(S.day)} ${hr(f.h0,f.h1)} · ${f.name}${ty.includes("중량물")?" · 인양계획서·신호수·출입통제 포함":""}`};}
function previewJob(f){const X=jobTask(f,"XP"),ts=S.tasks.concat([X]),by=Object.fromEntries(ts.map(x=>[x.id,x]));const open=new Set(S.conflicts.filter(c=>c.status==="open").map(c=>c.key));
  return evaluate(ts,S.mitig).filter(c=>c.status==="open"&&c.b&&!open.has(c.key)&&(c.a==="XP"||c.b==="XP")).map(c=>({c,o:c.a==="XP"?by[c.b]:by[c.a]}));}
function varAffected(f){const v=VARS.find(x=>x.k===f.vk),h0=Math.ceil(NOW*2)/2;
  return S.tasks.filter(t=>isBase(t)&&actOn(t,S.day)&&v.match(t,f)&&t.h0<f.vh1&&t.h1>h0).map(t=>({tid:t.id,h0:Math.max(t.h0,h0),h1:Math.min(t.h1,f.vh1),reason:`${v.title}${f.vk==="gas"?" · "+zn(f.vz):""} · 해당 작업 ${hr(Math.max(t.h0,h0),Math.min(t.h1,f.vh1))}`,cond:v.cond}));}
function registerJob(f,by){
  const X=jobTask(f,"X"+(++S.xseq));S.tasks.push(X);const {added}=rejudge();const aff=affFromAdded(added,[X.id]);
  if(by!==HQ[0])aff.push({tid:X.id,h0:X.h0,h1:X.h1,reason:"협력사가 등록한 긴급 작업 · 본청 승인 필요",cond:"작업 범위·인원·차단 범위 확인 후 착수"});
  S.log.unshift({time:clock(),type:"긴급 작업",sum:`${P(X.p).name} ${X.name} · ${zn(X.zone)} ${hr(X.h0,X.h1)} · ${X.crew}명`,dec:`자동 재대조 · 새 겹침 ${added.length}건`,who:by,rule:"",law:"",parties:[X.p]});
  const n=raiseEvent({kind:"긴급 작업",title:`긴급 작업 · ${X.name}`,desc:`${P(X.p).name} · ${hr(X.h0,X.h1)} · ${X.crew}명`,by},aff);
  toast(`긴급 작업 등록 · 전체 알림 · 위험 해당 공정 ${n}건 착수 보류`);}
function registerVar(f,by){const v=VARS.find(x=>x.k===f.vk),h0=Math.ceil(NOW*2)/2,aff=varAffected(f);
  const n=raiseEvent({kind:"변수",title:`현장 변수 · ${v.title}${f.vk==="gas"?" · "+zn(f.vz):""}`,desc:`${hr(h0,f.vh1)} · 보고 ${by}`,by},aff);
  toast(`현장 변수 등록 · 전체 알림 · 위험 해당 공정 ${n}건 착수 보류`);}
function approveHold(id,cond){const x=S.holds.find(v=>v.id===id);if(!x||!canApprove(x))return;x.st="승인";x.cond=cond||x.cond;x.by=byWho();x.atime=clock();const t=task(x.tid);note([t.p,"HQ"],`착수 승인 · ${t.name}`,`조건: ${x.cond} · 승인 ${x.by}`,"승인");
  S.log.unshift({time:x.atime,type:"착수 승인",sum:`${P(t.p).name} ${t.name} ${hr(x.h0,x.h1)}`,dec:`조건: ${x.cond}`,who:x.by,rule:"",law:LAW64,parties:[t.p]});toast(`${P(t.p).name} ${t.name} 착수를 조건부 승인했습니다 · ${x.by}`);renderAll();}
function keepHold(id){const x=S.holds.find(v=>v.id===id);if(!x||!canApprove(x))return;x.st="보류";const t=task(x.tid);note([t.p,"HQ"],`보류 유지 · ${t.name}`,x.reason,"보류");
  S.log.unshift({time:clock(),type:"착수 보류",sum:`${P(t.p).name} ${t.name} 보류 유지`,dec:x.reason,who:byWho(),rule:"",law:LAW64,parties:[t.p]});toast("보류를 유지했습니다");renderAll();}
function startTask(tid){const d=S.day,t=task(tid);if(holdsOf(tid,d).some(x=>x.st!=="승인")){toast("포스코 본청 승인 전에는 착수할 수 없습니다");return;}
  S.started[tid+"|"+d]=clock();S.log.unshift({time:clock(),type:"착수",sum:`${P(t.p).name} ${t.name} 착수`,dec:holdsOf(tid,d).map(x=>"승인 조건: "+x.cond).join(" / ")||"보류 없음",who:`${P(t.p).name} ${P(t.p).lead}`,rule:"",law:"",parties:[t.p]});toast(`${t.name} 착수를 기록했습니다`);renderAll();}
function holdBadge(t,d){if(t.emerg&&!holdsOf(t.id,d).length&&!S.started[t.id+"|"+d])return `<span class="hb">긴급</span>`;
  if(S.started[t.id+"|"+d])return `<span class="hb go">착수</span>`;const hs=holdsOf(t.id,d);if(!hs.length)return "";
  return hs.some(x=>x.st!=="승인")?`<span class="hb">승인 대기</span>`:`<span class="hb ok">승인</span>`;}
function renderUrgent(){
  const me=S.role;let h="";
  const evs=S.events.filter(e=>!e.ack.has(me));
  if(evs.length)h+=`<div class="allb" role="alert"><div class="wrap">${evs.slice(0,2).map(e=>{const hs=S.holds.filter(x=>x.ev===e.id),mineH=me==="HQ"?hs:hs.filter(x=>task(x.tid).p===me);
    return `<div class="urow"><span class="apill"><i class="blink"></i>전체 알림</span><span class="ut">${esc(e.time.split(" ")[1]||"")}</span><span class="utext">${esc(e.title)} <span class="ucause">${esc(mask(e.desc))} · 위험 해당 공정 <b>${hs.length}곳</b> 착수 보류${me==="HQ"?"":mineH.length?` · <span class="kw">우리 작업 ${mineH.length}건 포함</span>`:" · 우리 작업은 해당 없음"}</span></span><button class="ubtn" data-act="eack" data-id="${e.id}">확인</button></div>`;}).join("")}${evs.length>2?`<div class="urow ucause">외 ${evs.length-2}건</div>`:""}</div></div>`;
  const pend=S.holds.filter(x=>x.day===S.day&&x.st!=="승인"&&(me==="HQ"||task(x.tid).p===me));
  if(pend.length)h+=`<div class="urg"><div class="wrap"><div class="urow"><span class="upill"><i class="blink"></i>${me==="HQ"?"착수 승인 대기":"착수 보류"}</span><span class="utext">${me==="HQ"?`위험 해당 공정 <b>${pend.length}건</b>이 승인을 기다립니다. 직영관리자 또는 해당 파트장이 승인하기 전에는 착수할 수 없습니다.`:`우리 작업 <b>${pend.length}건</b>은 ${S.lvl==="lead"?"파트장 또는 직영관리자":"파트장·직영관리자"} 승인 전에는 착수할 수 없습니다: ${pend.map(x=>`${esc(task(x.tid).name)} <span class="t">${hh(x.h0)}~</span>`).join(", ")}`}</span><button class="ubtn" data-act="gohold">${canApprove(pend[0])?"승인하러 가기":"보기"}</button></div></div></div>`;
  $("#urgentHost").innerHTML=h;
}
function evAck(d){const evs=S.events.filter(e=>e.day===d);if(!evs.length)return "";
  return `<div class="sub" style="padding:8px 14px;border-top:1px solid var(--line-2)">전체 알림 수신 · ${evs.slice(0,2).map(e=>`${esc(e.title)}: ${PARTNERS.map(p=>`${p.name} ${e.ack.has(p.id)?"확인":"미확인"}`).join(" · ")}`).join(" / ")}</div>`;}
function renderHolds(){
  const d=S.day,me=S.role,host=$("#bHold");
  if(me==="HQ"){const hs=S.holds.filter(x=>x.day===d);if(!hs.length){host.innerHTML="";return;}
    const pend=hs.filter(x=>x.st!=="승인"),done=hs.filter(x=>x.st==="승인");
    host.innerHTML=`<section class="card holdc" id="holdCard"><header><span class="hq">포스코 본청</span><h2>착수 승인 대기</h2><span class="big" style="font-size:22px;${pend.length?"color:var(--red)":""}">${pend.length}</span><span class="sub">건 · 직영관리자 또는 해당 협력사 파트장이 승인해야 착수할 수 있습니다</span></header><div class="hlist">
      ${pend.map(x=>{const t=task(x.tid),e=S.events.find(v=>v.id===x.ev);return `<div class="hitem"><div class="hinfo"><div class="row2"><span class="pill ${x.st==="보류"?"mute":"ban"}">${x.st==="보류"?"보류 유지":"승인 대기"}</span><b>${P(t.p).name}</b><span>${esc(t.name)}</span><span>${zn(t.zone)}</span><span class="t">${hr(x.h0,x.h1)}</span></div><div class="sub">원인: ${esc(e?e.title:"")}</div><div>${esc(x.reason)}</div></div>
        <div class="hact"><label class="sub" for="cond-${x.id}">승인 조건 (협력사에 함께 전달)</label><input type="text" id="cond-${x.id}" value="${esc(x.cond)}"><div class="row2"><button class="btn sm pri" data-act="happrove" data-id="${x.id}">조건부 승인</button>${x.st==="보류"?"":`<button class="btn sm rej" data-act="hkeep" data-id="${x.id}">보류 유지</button>`}${x.key&&S.conflicts.find(c=>c.key===x.key)?`<button class="link" data-act="sel" data-key="${x.key}">겹침 상세</button>`:""}</div></div></div>`;}).join("")||`<div class="sub" style="padding:10px 14px">대기 중인 공정이 없습니다</div>`}
      ${done.length?`<div class="sub" style="padding:8px 14px;border-top:1px solid var(--line-2)">승인 ${done.length}건 · ${done.map(x=>`${P(task(x.tid).p).name} ${esc(task(x.tid).name)} (${esc(x.cond)})${S.started[x.tid+"|"+d]?" · 착수함":""}`).join(" / ")}</div>`:""}${evAck(d)}</div></section>`;return;}
  const mine=S.tasks.filter(t=>isBase(t)&&t.p===me&&actOn(t,d)).sort((a,b)=>a.h0-b.h0);if(!mine.length){host.innerHTML="";return;}
  const lead=S.lvl==="lead";
  host.innerHTML=`<section class="card holdc" id="holdCard" style="${S.holds.some(x=>x.day===d&&task(x.tid).p===me&&x.st!=="승인")?"":"border-color:var(--line)"}"><header><h2>오늘 우리 작업 착수</h2><span class="sub">위험 해당 공정은 ${lead?"파트장(나) 또는 직영관리자":"파트장 또는 직영관리자"} 승인 후 착수</span></header><div class="hlist">${mine.map(t=>{const hs=holdsOf(t.id,d),pend=hs.filter(x=>x.st!=="승인"),ok=hs.filter(x=>x.st==="승인"),stt=S.started[t.id+"|"+d];
    return `<div class="hitem"><div class="hinfo"><div class="row2"><span class="t">${hr(t.h0,t.h1)}</span><span>${esc(t.name)}</span><span>${zn(t.zone)}</span><b>${t.crew}명</b>${t.emerg?`<span class="hb">긴급</span>`:""}${stt?`<span class="pill ok">착수 ${esc(stt.split(" ")[1]||"")}</span>`:pend.length?`<span class="pill ban">${pend.some(x=>x.st==="보류")?"보류 유지":"승인 대기"}</span>`:ok.length?`<span class="pill ok">승인</span>`:""}</div>
      ${pend.map(x=>`<div class="sub">보류 사유: ${esc(mask(x.reason))}</div>`).join("")}${ok.map(x=>`<div class="sub">승인 조건: <b>${esc(mask(x.cond))}</b> · ${esc(mask(x.by||""))} ${esc(x.atime||"")}</div>`).join("")}</div>
      <div class="hact">${stt?`<span class="sub">착수 기록됨</span>`:pend.length&&lead?pend.map(x=>`<label class="sub" for="cond-${x.id}">승인 조건</label><input type="text" id="cond-${x.id}" value="${esc(mask(x.cond))}"><div class="row2"><button class="btn sm pri" data-act="happrove" data-id="${x.id}">파트장 승인</button>${x.st==="보류"?"":`<button class="btn sm rej" data-act="hkeep" data-id="${x.id}">보류 유지</button>`}</div>`).join(""):`<button class="btn ${pend.length?"":"pri"}" data-act="hstart" data-t="${t.id}" ${pend.length?"disabled":""}>${pend.length?"승인 대기 · 착수 불가":"작업 착수"}</button>`}</div></div>`;}).join("")}</div></section>`;
}
function renderGuide(){const host=$("#bGuide");if(S.role==="HQ"){host.innerHTML="";return;}const d=S.day;
  const cards=S.tasks.filter(t=>isBase(t)&&t.p===S.role&&actOn(t,d)).map(o=>({o,b:guide(o,d)})).filter(x=>x.b.some(b=>b.infl.length));
  host.innerHTML=`<section class="card gcard"><header><h2>안전 작업 가이드</h2><span class="sub">우리 작업에 영향을 주는 작업의 위치에 따라 시간별 위험·안전 구역 · 긴급 작업·지연이 생기면 다시 계산</span><span class="grow"></span><span class="glegend"><span><i class="sw" style="background:var(--red)"></i>위험</span><span><i class="sw" style="background:var(--amber)"></i>주의</span><span><i class="sw" style="background:var(--ok-soft);border:1px solid var(--ok)"></i>안전</span></span></header>${cards.length?`<div class="glist">${cards.map(({o,b})=>guideHtml(o,b)).join("")}</div>`:`<div class="pbody"><div class="sub">오늘 우리 작업에 영향을 주는 다른 작업이 없습니다.</div></div>`}</section>`;}

/* ================= 화면 전환 ================= */
const VIEWS=["board","model","tbm","history"];let cur="board";
function go(v){if(location.hash!=="#"+v)location.hash=v;else show(v);}
function show(v){cur=VIEWS.includes(v)?v:"board";VIEWS.forEach(x=>$("#view-"+x).hidden=x!==cur);
  document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-current",b.dataset.view===cur?"page":"false"));
  if(cur==="model")renderModel();}
addEventListener("hashchange",()=>show(location.hash.slice(1)));
let tT;function toast(m){$("#toastHost").innerHTML=`<div class="toast" role="status">${esc(m)}</div>`;clearTimeout(tT);tT=setTimeout(()=>$("#toastHost").innerHTML="",3400);}

/* ================= 헤더 · 시연 ================= */
const STEPS=[
 {n:1,t:"계획서 5건 올리기",f:()=>s1()},{n:2,t:"오늘 겹침 보기",f:()=>s2()},{n:3,t:"C사 변경본 도착",f:()=>s3()},{n:4,t:"포스코 본청 반려",f:()=>s4()},
 {n:5,t:"C사 수정본 재제출",f:()=>s5()},{n:6,t:"C사 화면",f:()=>s6()},{n:7,t:"3D에서 겹침 보기",f:()=>s7()},{n:8,t:"챗봇 음성 질문",f:()=>s8()},{n:9,t:"TBM 전달 확인",f:()=>s9()},{n:10,t:"작업 지연 → 전체 알림",f:()=>s10()},{n:11,t:"긴급 작업 → 착수 승인",f:()=>s11()}];
function renderHeader(){
  if(S.role==="HQ")S.lvl="hq";else if(S.lvl==="hq")S.lvl="lead";
  $("#role").innerHTML=`<option value="HQ">포스코 직영관리자 (본청)</option>`+PARTNERS.map(p=>`<optgroup label="${p.name} · ${p.trade}"><option value="${p.id}:lead">${p.name} 파트장</option><option value="${p.id}:worker">${p.name} 작업자</option></optgroup>`).join("");$("#role").value=S.role==="HQ"?"HQ":`${S.role}:${S.lvl}`;
  $("#hClock").textContent=hh(NOW);$("#dateIn").value=iso(S.day);$("#hD").innerHTML=`D<b>${S.day}</b> / ${TOTAL} · ${WD[dDate(S.day).getDay()]}요일 · 날짜를 바꾸면 일차가 따라 바뀝니다`;
  const need=S.tasks.filter(t=>!t.ok&&(S.role==="HQ"||t.p===S.role)).length;const b=$("#upBadge");b.hidden=!need;b.textContent=need;
  $("#scen").innerHTML=STEPS.map(s=>`<li><button class="step ${S.step>=s.n?"done":""}" data-act="step" data-n="${s.n}"><i>${s.n}</i>${s.t}</button></li>`).join("");
}
function initialJudge(){S.conflicts=[];rejudge();S.newKeys.clear();S.conflicts.forEach(c=>S.seen.add(c.key));
  S.log.unshift({time:clock(),type:"구조화",sum:`계획서 5건 → 작업 ${S.tasks.length}건`,dec:`확인 필요 ${S.tasks.filter(t=>!t.ok).length}건 · 표준서 매칭 ${S.tasks.length}건`,who:"시스템",rule:"F1·F8",law:"",parties:[]});
  S.log.unshift({time:clock(),type:"판정",sum:`첫 대조 ${S.lastMs.toFixed(1)}ms`,dec:`충돌 ${S.conflicts.length}건`,who:"시스템",rule:"F2",law:"",parties:[]});}
function finishUp(){if(upTimer){clearTimeout(upTimer);upTimer=null;}if(PARTNERS.some(p=>S.fst[p.id]!=="ok")){PARTNERS.forEach(p=>S.fst[p.id]="ok");initialJudge();}}
function s1(){if(upTimer)clearTimeout(upTimer);S=fresh();S.step=1;PARTNERS.forEach(p=>S.fst[p.id]="wait");S.conflicts=[];S.drawer={kind:"up",anim:true};S.upOpen="A";go("board");renderAll();
  const seq=[];PARTNERS.forEach(p=>{["텍스트 추출","항목 인식","표준서 매칭"].forEach(st=>seq.push([p.id,st]));seq.push([p.id,"ok"]);});let i=0;
  const tick=()=>{if(i>=seq.length){upTimer=null;initialJudge();toast(`작업 ${S.tasks.length}건을 표로 정리하고 대조했습니다 · 충돌 ${S.conflicts.length}건`);renderAll();return;}
    const [p,st]=seq[i++];S.fst[p]=st;S.upOpen=p;renderDrawer();renderHeader();upTimer=setTimeout(tick,reduced?40:160);};tick();}
function s2(){finishUp();S.role="HQ";S.day=65;S.step=Math.max(S.step,2);S.sel="R-VT-01:T06-T02";S.drawer={kind:"conf",anim:true};go("board");renderAll();}
function s3(){finishUp();S.role="HQ";S.day=65;receiveV2();S.step=Math.max(S.step,3);S.sel=S.conflicts.find(c=>c.key==="R-SQ-01:T11-T04")?"R-SQ-01:T11-T04":null;S.drawer=S.sel?{kind:"conf",anim:true}:null;go("board");renderAll();}
function s4(){if(S.ver.C<2)s3();S.role="HQ";S.step=Math.max(S.step,4);go("board");
  if(S.review.C.st==="검토 중"){const k=["R-SQ-01:T11-T04","R-CG-01:T11-T04"].find(k=>S.conflicts.find(c=>c.key===k&&c.status==="open"));if(k){reject(k);return;}}renderAll();}
function s10(){finishUp();S.role="HQ";S.day=65;S.drawer=null;S.chatOpen=false;S.step=Math.max(S.step,10);go("board");reportDelay("T06",13.5,"벨리스 탑 부품 반입 지연","B사 최도윤 소장");renderAll();}
function s11(){finishUp();S.role="HQ";S.day=65;S.drawer=null;S.chatOpen=false;S.step=Math.max(S.step,11);go("board");registerJob(JSON.parse(JSON.stringify(fresh().eform)),HQ[0]);renderAll();}
function ensureFixed(){if(S.ver.C<2)s3();if(S.review.C.st==="검토 중")s4();if(S.review.C.st==="반려")resubmit("C");}
function s5(){if(S.review.C.st!=="반려")s4();S.role="C";S.step=Math.max(S.step,5);S.drawer=null;go("board");resubmit("C");renderAll();}
function s6(){ensureFixed();S.role="C";S.step=Math.max(S.step,6);S.drawer=null;go("board");renderAll();}
function s7(){ensureFixed();S.role="HQ";S.day=65;S.focus="R-VT-01:T06-T02";S3.pendingSelect="T02";S.mmode="conf";S.mview="3d";S.drawer=null;S.step=Math.max(S.step,7);go("model");renderAll();}
function s8(){ensureFixed();S.role="C";S.step=Math.max(S.step,8);S.chatOpen=true;renderAll();voiceAsk("내 작업과 겹치는 작업은?");}
function s9(){ensureFixed();S.role="C";S.step=Math.max(S.step,9);S.day=105;S.tbm.p="C";S.tbm.sample="B";S.tbm.key=tbmKey("C",105);S.tbm.text=tbmSet("C",105).B.text;S.chatOpen=false;S.drawer=null;go("tbm");renderAll();runTbm();}

/* ================= 1. 현재 상황판 (시안4) ================= */
function dayTasks(d){return S.tasks.filter(t=>actOn(t,d)&&own(t));}
function bannerHtml(){
  let h="";const rv=S.review.C;
  if(S.role==="HQ"){
    if(S.banner&&rv.st==="검토 중"){const k=S.banner.added.find(k=>k.startsWith("R-SQ"))||S.banner.added[0];
      h+=`<div class="banner"><span class="pill ban">계획 변경</span><span>C사 배관 계획서 v2가 들어와 다시 대조했습니다. 질소 라인 연결이 <span class="t">1/15</span>로 당겨져 <span class="kw">새 충돌</span> <b>${S.banner.added.length}건</b>이 생겼습니다.</span><span class="grow"></span>${k?`<button class="btn sm" data-act="sel" data-key="${k}">새 충돌 보기</button><button class="btn sm rej" data-act="reject" data-key="${k}">포스코 본청 반려</button>`:""}<button class="link" data-act="closebanner">닫기</button></div>`;}
    PARTNERS.filter(p=>S.review[p.id].st==="반려").forEach(p=>{const r=S.review[p.id];h+=`<div class="banner rejb"><span class="hq">포스코 본청 반려</span><span>${p.name} 계획서 v${r.v}를 반려했습니다. 수정 요구: <b>${esc(r.req)}</b> · 수정본을 기다리는 중</span><span class="grow"></span><button class="btn sm" data-act="resubmit" data-p="${p.id}">시연: ${p.name} 수정본 제출</button></div>`;});
  }else if(S.review[S.role]&&S.review[S.role].st==="반려")h+=rejBanner(S.role);
  return h;
}
function rejBanner(p){const rv=S.review[p];return `<div class="banner rejb"><span class="hq">포스코 본청 반려</span><span>${P(p).name} 계획서 v${rv.v}가 반려됐습니다. 사유: ${esc(mask(rv.reason))} · 수정 요구: <b>${esc(mask(rv.req))}</b></span><span class="grow"></span><button class="btn sm pri" data-act="resubmit" data-p="${p}">수정본 v${rv.v+1} 제출</button></div>`;}
function dayConf(d){return visC().filter(c=>c.from<=d&&d<=c.to);}
function renderBoard(){
  const d=S.day,ts=dayTasks(d),cs=dayConf(d),open=cs.filter(c=>c.status==="open"),pair=open.filter(c=>c.b||c.rule==="R-SQ-01");
  const ban=open.filter(c=>c.level==="금지").length,nowC=open.filter(c=>c.h0<=NOW&&NOW<c.h1),pk=riskPeak(d,S.role);
  const tb0=ts.filter(isBase),firms=new Set(tb0.map(t=>t.p)),crew=tb0.reduce((a,t)=>a+t.crew,0);
  $("#bBanner").innerHTML=bannerHtml()+(S.role!=="HQ"?`<p class="note" style="margin:0 0 10px">우리 작업과, 우리 작업에 영향을 주는 다른 작업(빗금 막대)만 보입니다. 그 밖의 다른 회사 일정은 볼 수 없습니다.</p>`:"");
  const stat=(k,v,u,dd,red)=>`<div class="stat"><span class="k">${k}</span><span class="v"><span class="big" ${red?'style="color:var(--red)"':""}>${v}</span><small>${u}</small></span><span class="d">${dd}</span></div>`;
  $("#bStats").innerHTML=[
    stat(S.role==="HQ"?"작업 업체":"우리 업체 작업",S.role==="HQ"?firms.size:tb0.length,S.role==="HQ"?"곳":"건",S.role==="HQ"?`작업 ${tb0.length}건`:P(S.role).trade),
    stat("투입 인원",crew,"명",S.role==="HQ"?"오늘 계획 기준":"우리 업체"),
    stat("겹침",pair.length,"건",`조건부 ${open.filter(c=>c.level==="조건부").length} · 금지 ${ban}`),
    stat("금지",ban,"건","같이 하면 안 되는 조합",ban>0),
    stat("지금 진행 중 겹침",nowC.length,"건",nowC.length?esc(labelOf(nowC[0].key)):"없음"),
    `<div class="stat"><span class="k">위험 시간대 <span class="fx">F9</span></span><span class="v"><span class="big t">${pk?hh(pk.h0):"—"}</span><small>${pk?"~"+hh(pk.h1):""}</small></span><span class="d">${pk?`겹침 ${pk.cs.length}건 동시 · `:"없음"}${pk&&S.role==="HQ"?`<button class="link" data-act="risk" style="padding:0">${S.riskSent.has(d)?"공지함":"공지하기"}</button>`:""}</span></div>`,
    tbmStat(d)
  ].join("");
  const days=[...new Set(visC().filter(c=>c.status==="open").map(c=>c.from))].sort((a,b)=>a-b).slice(0,6);
  $("#bJumps").innerHTML=`<button class="btn sm rej" data-act="openevent">긴급·변수 등록</button><span class="sub">충돌 있는 날</span>`+[...new Set([65,...days])].sort((a,b)=>a-b).map(x=>`<button class="jump" data-act="day" data-d="${x}" aria-pressed="${x===d}">${md(x)}</button>`).join("");
  $("#bTl").innerHTML=renderTl(d,ts,cs);
  renderActs(d,cs);renderHolds();renderGuide();
}
function lanes(ts){const L=[];ts.slice().sort((a,b)=>a.h0-b.h0||b.crew-a.crew).forEach(t=>{let i=L.findIndex(l=>l[l.length-1].h1<=t.h0);if(i<0){L.push([t]);i=L.length-1;}else L[i].push(t);t._lane=i;});return L.length;}
function renderTl(d,ts,cs){
  const x=h=>((h-7)/12*100),{s:risk}=riskSlots(d,S.role),isHQ=S.role==="HQ";
  const selC=S.sel?S.conflicts.find(c=>c.key===S.sel):null,hit=new Set(selC?[selC.a,selC.b].filter(Boolean):[]);
  let h=`<div class="tl ${selC?"sel":""}"><div class="tl-risk"><div class="lab">위험 시간대</div><div class="risk">${risk.map((v,i)=>`<span class="${rcls(v)}" title="${hh(7+i*.5)} 위험도 ${v}"></span>`).join("")}</div></div>`;
  h+=`<div class="tl-scale"><div class="sub" style="padding:5px 12px">구역</div><div class="ticks">${[7,9,11,13,15,17,19].map(v=>`<span style="left:${x(v)}%">${hh(v)}</span>`).join("")}<span class="nowchip" style="left:${x(NOW)}%">지금 ${hh(NOW)}</span></div></div>`;
  for(const z of ZORDER){
    const zt=ts.filter(t=>t.zone===z),n=lanes(zt);
    const zc=cs.filter(c=>(task(c.a).zone===z||(c.b&&task(c.b).zone===z))&&(c.b||c.rule==="R-SQ-01"));
    const gh=isHQ?[]:S.tasks.filter(t=>!own(t)&&t.zone===z&&actOn(t,d)&&inScope(t)).map(o=>({o}));
    const crew=zt.filter(isBase).reduce((a,t)=>a+t.crew,0),nowRisk=zc.find(c=>c.status==="open"&&c.h0<=NOW&&NOW<c.h1);
    const L=Math.max(1,n+gh.length),rowH=L*30+8+zc.length*8;
    h+=`<div class="tl-row" style="height:${rowH}px"><div class="lab"><span class="z">${zn(z)}${nowRisk?`<span class="rk">● ${nowRisk.level==="금지"?"작업 금지":"위험 높음"}</span>`:""}</span><span class="sub">${ZONES[z].floor} · ${crew?`<b style="color:var(--ink)">${crew}명</b>`:gh.length?"타사 작업 (우리 작업에 영향)":"작업 없음"}</span></div><div class="track">`;
    zt.forEach(t=>{h+=`<button class="tb ${t.moved?"moved":""} ${t.delayOf?"late":""} ${t.emerg?"emerg":""} ${holdsOf(t.id,d).some(x=>x.st!=="승인")?"held":""} ${hit.has(t.id)?"hit":""}" style="--pc:${pc(t.p)};left:${x(t.h0)}%;width:${(t.h1-t.h0)/12*100}%;top:${t._lane*30+4}px" data-act="task" data-t="${t.id}" title="${esc(`${P(t.p).name} ${t.name} ${hr(t.h0,t.h1)} · ${t.crew}명`)}">${t.delayOf?`<span class="who">${P(t.p).name}</span>지연 ~<span class="t">${hh(t.h1)}</span>`:`<span class="who">${P(t.p).name}</span>${esc(t.name)}<b>${t.crew}명</b>${holdBadge(t,d)}`}</button>`;});
    gh.forEach((g,i)=>{const o=g.o;h+=`<button class="tb ghost ${hit.has(o.id)?"hit":""}" style="left:${x(o.h0)}%;width:${(o.h1-o.h0)/12*100}%;top:${(n+i)*30+4}px" data-act="task" data-t="${o.id}" title="우리 작업에 영향을 주는 타사 작업">타사 ${esc(o.name.replace(" (지연)",""))}${o.delayOf?" 지연":""} · ${HZ(o)}${o.path?" · "+o.path.map(q=>SECN[q[2]]).join("→"):o.pos.length<4?" · "+o.pos.map(k=>SECN[k]).join("·"):""}</button>`;});
    zc.forEach((c,i)=>{h+=`<span class="ov ${c.status==="met"?"met":""}" style="--c:${LVC[c.level]};left:${x(c.h0)}%;width:${(c.h1-c.h0)/12*100}%;top:${L*30+4+i*8}px" data-act="sel" data-key="${c.key}" title="${esc(labelOf(c.key))}"></span>`;});
    h+=`</div></div>`;
  }
  h+=`<div class="tl-lines">${Array.from({length:12},(_,i)=>`<span class="h" style="left:${x(8+i)}%"></span>`).join("")}<span class="now" style="left:${x(NOW)}%"></span></div></div>`;
  return h;
}
function whenTxt(c){if(c.h1<=NOW)return "오늘 종료";if(c.h0<=NOW)return `<span class="kw">진행 중</span>`;const m=Math.round((c.h0-NOW)*60);return `<span class="t">${m>=60?Math.floor(m/60)+"시간 "+(m%60?m%60+"분":""):m+"분"}</span> 후 시작`;}
function renderActs(d,cs){
  const open=cs.filter(c=>c.status==="open").sort((a,b)=>LVO[a.level]-LVO[b.level]||((a.h1<=NOW)-(b.h1<=NOW))||a.h0-b.h0);
  const isHQ=S.role==="HQ";
  let h=`<div class="acts-h"><h2>${isHQ?"지금 조치할 것":"원청에서 받은 공지"}</h2><span class="big" style="font-size:22px;${open.length?"color:var(--red)":""}">${open.length}</span><span class="sub">건 · 금지 먼저, 시작이 가까운 순</span><span class="grow"></span>${isHQ?`<span class="sub">카드를 누르면 근거와 조정안이 오른쪽에 열립니다</span>`:""}</div><div class="acts-grid">`;
  h+=open.map(c=>{const R=RULES[c.rule];return `<button class="ac" style="--c:${LVC[c.level]}" data-act="sel" data-key="${c.key}" aria-pressed="${S.sel===c.key}">
    <span class="top2"><span class="pill ${LV[c.level]}">${c.level}</span><span>${R.kind}</span>${S.newKeys.has(c.key)?`<span class="kw" style="font-size:12px">신규</span>`:""}${!isHQ&&S.shared.has(c.key+"|"+S.role)?`<span class="pill mute">원청 공유</span>`:""}<span class="when">${c.b||c.rule==="R-SQ-01"?whenTxt(c):""}</span></span>
    <p>${sentence(c)}</p><span class="ev">${c.rule} · ${esc(R.law[0])}</span></button>`;}).join("");
  if(!isHQ){const adj=S.adjusted.filter(a=>a.parties.includes(S.role));const pk=riskPeak(d,S.role);
    if(pk&&S.riskSent.has(d))h+=`<div class="ac" style="--c:var(--blue)"><span class="top2"><span class="pill mute">위험 시간대 공지</span></span><p>오늘 <span class="t">${hr(pk.h0,pk.h1)}</span>에 우리 작업과 겹치는 작업이 <b>${pk.cs.length}건</b> 몰려 있습니다.</p></div>`;
    h+=adj.map(a=>`<div class="ac" style="--c:var(--ok)"><span class="top2"><span class="pill ok">조정 반영</span><span class="hq">포스코 본청</span><span class="when">${esc(a.time)}</span></span><p>${esc(mask(a.short))}</p><span class="ev">${esc(mask(a.who))} · ${a.rule}</span></div>`).join("");
}
  if(!open.length&&isHQ)h+=`<div class="empty">오늘 조치할 겹침이 없습니다</div>`;
  $("#bActs").innerHTML=h+`</div>`;
}

/* ================= 서랍: 충돌 상세(F2·F4) / 업로드(F1·F8) ================= */
function etabs(cur){return `<div class="seg" role="group" aria-label="종류">${[["job","긴급 작업"],["delay","작업 지연"],["var","현장 변수"]].map(([k,l])=>`<button data-act="etab" data-t="${k}" aria-pressed="${cur===k}">${l}</button>`).join("")}</div>`;}
function renderDrawer(){
  const host=$("#drawerHost");const d=S.drawer;if(!d){host.innerHTML="";return;}
  const an=!!d.anim;d.anim=false;const prevBody=host.querySelector(".body"),keep=prevBody&&!an?prevBody.scrollTop:0;
  const restore=()=>{const b=host.querySelector(".body");if(b&&keep)b.scrollTop=keep;};
  if(d.kind==="up"){host.innerHTML=`<div class="scrim" data-act="closedrawer"></div><div class="modal ${an?"pop":""}" role="dialog" aria-modal="true" aria-labelledby="upT"><header><h2 id="upT">작업계획서 올리기</h2><span class="fx">F1</span><span class="fx">F8</span><span class="grow"></span><button class="x" data-act="closedrawer" aria-label="닫기">×</button></header><div class="body">${upBody()}</div></div>`;restore();if(an){const x=host.querySelector(".x");if(x)x.focus();}return;}
  if(d.kind==="event"){const f=S.eform,tab=f.tab;let body="";
    if(tab==="job"){if(S.role!=="HQ")f.p=S.role;const pv=previewJob(f);
      body=`<div class="sec"><span class="h">긴급 작업 내용</span><div class="ef">
        <label>업체<select id="ejP" ${S.role!=="HQ"?"disabled":""}>${PARTNERS.map(x=>`<option value="${x.id}" ${x.id===f.p?"selected":""}>${x.name} (${x.trade})</option>`).join("")}</select></label>
        <label class="wide">작업명<input type="text" id="ejN" value="${esc(f.name)}"></label>
        <label>구역<select id="ejZ">${ZORDER.map(z=>`<option value="${z}" ${z===f.zone?"selected":""}>${zn(z)}</option>`).join("")}</select></label>
        <label>시작<select id="ejH0">${HOPT(7).filter(v=>v<19).map(v=>`<option value="${v}" ${v===f.h0?"selected":""}>${hh(v)}</option>`).join("")}</select></label>
        <label>종료<select id="ejH1">${HOPT(f.h0+.5).map(v=>`<option value="${v}" ${v===f.h1?"selected":""}>${hh(v)}</option>`).join("")}</select></label>
        <label>인원<input type="number" id="ejC" min="1" max="99" value="${f.crew}"></label></div>
        <div class="chips">${TYPES.map(k=>`<button class="jump" data-act="ejT" data-k="${k}" aria-pressed="${f.types.includes(k)}">${k}</button>`).join("")}</div><div class="row2"><span class="sub">위치</span>${SEC.map(k=>`<button class="jump" data-act="ejS" data-k="${k}" aria-pressed="${f.secs.includes(k)}">${SECN[k]}</button>`).join("")}</div></div>
        <div class="sec"><span class="h">위험 해당 공정 ${pv.length}건 · 포스코 본청 승인 전 착수 보류</span>${pv.length?pv.map(({c,o})=>`<div class="pnote" style="--c:${LVC[c.level]}"><span class="pill ${LV[c.level]}">${c.level}</span> ${esc(pn(o)+" "+tn(o))} · ${zn(o.zone)} · <span class="t">${hr(c.h0,c.h1)}</span> · ${RULES[c.rule].kind}</div>`).join(""):`<div class="sub">겹치는 공정이 없습니다. 전체 알림만 보냅니다.</div>`}${S.role!=="HQ"?`<div class="sub">협력사가 등록한 긴급 작업은 그 작업도 본청 승인 후 착수합니다.</div>`:""}</div>
        <div class="row2"><button class="btn pri" data-act="esubmit" data-t="job">등록하고 전체 알림</button></div>`;}
    else{const aff=varAffected(f),h0=Math.ceil(NOW*2)/2;
      body=`<div class="sec"><span class="h">변수 종류</span><div class="chips">${VARS.map(v=>`<button class="jump" data-act="evK" data-k="${v.k}" aria-pressed="${f.vk===v.k}">${v.label}</button>`).join("")}</div>
        <div class="row2">${f.vk==="gas"?`<label for="evZ">구역</label><select id="evZ">${ZORDER.map(z=>`<option value="${z}" ${z===f.vz?"selected":""}>${zn(z)}</option>`).join("")}</select>`:""}<label for="evH1">지금(<span class="t">${hh(h0)}</span>)부터</label><select id="evH1">${HOPT(h0+.5).map(v=>`<option value="${v}" ${v===f.vh1?"selected":""}>${hh(v)}</option>`).join("")}</select><span>까지</span></div></div>
        <div class="sec"><span class="h">위험 해당 공정 ${aff.length}건 · 포스코 본청 승인 전 착수 보류</span>${aff.map(a=>{const t=task(a.tid);return `<div class="pnote" style="--c:var(--red)">${esc(pn(t)+" "+tn(t))} · ${zn(t.zone)} · <span class="t">${hr(a.h0,a.h1)}</span></div>`;}).join("")||`<div class="sub">해당 공정 없음</div>`}</div>
        <div class="row2"><button class="btn pri" data-act="esubmit" data-t="var">등록하고 전체 알림</button></div>`;}
    host.innerHTML=`<div class="scrim" data-act="closedrawer"></div><div class="modal ${an?"pop":""}" role="dialog" aria-modal="true" aria-labelledby="eT" style="width:min(660px,calc(100% - 32px))"><header><span class="pill ban">긴급</span><h2 id="eT">긴급·변수 등록</h2>${etabs(tab)}<span class="grow"></span><button class="x" data-act="closedrawer" aria-label="닫기">×</button></header><div class="body">${body}<p class="note">등록하면 모든 협력사와 포스코 본청에 전체 알림이 가고, 위험 해당 공정은 포스코 본청이 승인해야 착수할 수 있습니다.</p></div></div>`;restore();return;}
  if(d.kind==="delay"){const f=S.dform,opts=S.tasks.filter(t=>isBase(t)&&actOn(t,S.day)&&own(t)&&t.h1<19).sort((a,b)=>a.h1-b.h1);
    if(!opts.find(t=>t.id===f.t))f.t=opts[0]?opts[0].id:null;const t=f.t?task(f.t):null;
    if(t&&!(f.h1>t.h1))f.h1=Math.min(19,t.h1+1.5);const ends=[];if(t)for(let v=t.h1+.5;v<=19;v+=.5)ends.push(v);
    const pv=t?previewDelay(t.id,f.h1):[];
    host.innerHTML=`<div class="scrim" data-act="closedrawer"></div><div class="modal ${an?"pop":""}" role="dialog" aria-modal="true" aria-labelledby="dT" style="width:min(580px,calc(100% - 32px))"><header><span class="pill ban">긴급</span><h2 id="dT">긴급·변수 등록</h2>${etabs("delay")}<span class="sub">${ymd(S.day)}</span><span class="grow"></span><button class="x" data-act="closedrawer" aria-label="닫기">×</button></header><div class="body">
      ${!t?`<div class="empty">${md(S.day)}에 지연 보고할 ${S.role==="HQ"?"":"우리 회사 "}작업이 없습니다</div>`:`
      <label class="sec" for="dTask"><span class="h">늦어지는 작업</span><select id="dTask">${opts.map(o=>`<option value="${o.id}" ${o.id===t.id?"selected":""}>${esc(P(o.p).name+" "+o.name)} · ${hr(o.h0,o.h1)}</option>`).join("")}</select></label>
      <div class="sec"><span class="h">언제 끝날 것 같나요</span><div class="row2"><span>예정 <span class="t">${hh(t.h1)}</span> →</span><select id="dEnd" aria-label="새 종료 시각">${ends.map(v=>`<option value="${v}" ${v===f.h1?"selected":""}>${hh(v)}</option>`).join("")}</select><span><b>${Math.round((f.h1-t.h1)*60)}분</b> 늦어짐</span></div></div>
      <div class="sec"><span class="h">사유</span><div class="chips">${["자재 반입 지연","장비 고장","작업량 증가","기상 악화"].map(r=>`<button class="jump" data-act="dwhy" data-r="${r}" aria-pressed="${f.why===r}">${r}</button>`).join("")}</div><input type="text" id="dWhy" value="${esc(f.why||"")}" placeholder="직접 입력" aria-label="지연 사유"></div>
      <div class="sec"><span class="h">보고하면 새로 겹치는 작업 ${pv.length}건 · 포스코 본청 승인 전 착수 보류</span>${pv.length?pv.map(({c,o})=>`<div class="pnote" style="--c:${LVC[c.level]}"><span class="pill ${LV[c.level]}">${c.level}</span> ${RULES[c.rule].kind} · ${esc(pn(o)+" "+tn(o))} · ${zn(o.zone)} · <span class="t">${hr(c.h0,c.h1)}</span></div>`).join(""):`<div class="sub">새로 겹치는 작업이 없습니다. 지연만 기록됩니다.</div>`}</div>
      <div class="row2"><button class="btn pri" data-act="dsubmit">지연 보고하고 전체 알림</button><span class="note">시스템은 작업을 멈추지 않습니다. 겹침 조정·반려는 포스코 본청이 합니다.</span></div>`}
    </div></div>`;restore();return;}
  if(d.kind==="result"&&S.lastApply){const L=S.lastApply;
    host.innerHTML=`<aside class="drawer ${an?"pop":""}" aria-label="조정 결과"><header><span class="pill ok">조정 적용</span><span class="sub">${esc(L.time)} · ${esc(L.who)}</span><span class="grow"></span><button class="x" data-act="closedrawer" aria-label="닫기">×</button></header><div class="body">
      <h3 style="font-size:16px;font-weight:500">${esc(L.label)}</h3><p style="margin:0"><span class="ai">AI 문장</span>${esc(L.pr.text)}</p>
      <div class="sec"><span class="h">재대조 결과 · ${S.lastMs.toFixed(1)}ms</span><ul class="res">${L.resolved.map(k=>`<li><span class="pill ok">해소</span>${esc(labelOf(k))}</li>`).join("")||`<li class="sub">해소된 충돌 없음</li>`}${L.added.map(k=>`<li><span class="pill ban">새 충돌</span><button class="link" data-act="sel" data-key="${k}">${esc(labelOf(k))}</button></li>`).join("")}</ul></div>
      ${L.added.length?`<div class="case">조정 때문에 <span class="kw">새 충돌</span> <b>${L.added.length}건</b>이 생겼습니다. 다른 조정안을 고르거나 되돌리세요.</div>`:""}
      <div class="row2">${S.undo?`<button class="btn" data-act="undo">되돌리기</button>`:""}<span>조정 결정과 책임자는 이력 탭에 제64조 이행 기록으로 남고, 관련 협력사에 공유됐습니다.</span></div></div></aside>`;return;}
  if(d.kind==="conf"){const c=S.conflicts.find(x=>x.key===S.sel);if(!c){host.innerHTML="";S.drawer=null;return;}
    const A=task(c.a),B=c.b?task(c.b):null,R=RULES[c.rule],isHQ=S.role==="HQ",props=proposals(c);
    const tc=t=>own(t)?`<div class="tc" style="--pc:${pc(t.p)}"><div class="sub">${t.id} · ${P(t.p).name}</div><div>${esc(t.name)} · <b>${t.crew}명</b></div><div class="l">${zn(t.zone)} (${ZONES[t.zone].floor}) · <span class="t">${hr(t.h0,t.h1)}</span></div><div class="l">${mdw(t.s)}~${mdw(t.e)}</div></div>`:`<div class="tc" style="--pc:var(--ink-3)"><div class="sub">타사 · 우리 작업에 영향</div><div>${esc(tn(t))} · ${HZ(t)}</div><div class="l">${zn(t.zone)} · <span class="t">${hr(t.h0,t.h1)}</span>${t.path?" · "+t.path.map(q=>SECN[q[2]]).join("→"):""}</div><div class="l">회사명·인원은 비공개</div></div>`;
    const srcq=t=>own(t)?`<blockquote>${esc(t.src)}<cite>${esc(fileName(t.p))} · ${t.id}</cite></blockquote>`:`<blockquote class="sub">타사 계획서 원문은 포스코 본청만 볼 수 있습니다.</blockquote>`;
    const rel=c.rule==="R-SQ-01"?"선행 ←":c.rule==="R-VT-01"?`위 ↕ 아래<br>${c.dist}m`:c.dist!==undefined?`${c.dist}m`:"겹침";
    const showCase=(c.rule==="R-SQ-01"||c.rule==="R-CG-01")&&A.types.includes("가스");
    host.innerHTML=`<aside class="drawer ${an?"pop":""}" aria-label="충돌 상세"><header><span class="pill ${LV[c.level]}">${c.level}</span><span>${R.kind}</span><span class="mono">${c.rule}</span><span class="grow"></span><button class="btn sm" data-act="to3d" data-key="${c.key}">3D로 보기</button><button class="x" data-act="closedrawer" aria-label="닫기">×</button></header><div class="body">
      <p style="margin:0;font-size:15px">${sentence(c)}</p>
      ${B?`<div class="pair">${tc(A)}<div class="rel">${rel}</div>${tc(B)}</div>`:tc(A)}
      ${B&&["R-VT-01","R-SZ-01","R-HF-01","R-HG-01","R-CG-01"].includes(c.rule)?(()=>{const tg=S.role==="HQ"?B:(own(B)?B:A);const gb=guide(tg,S.day);return gb.some(b=>b.infl.length)?`<div class="sec"><span class="h">안전 작업 가이드 · ${esc(tn(tg))} (시간별 위험·안전 구역)</span>${guideHtml(tg,gb)}</div>`:"";})():""}
      <div class="sec"><span class="h">근거 <span class="fx">F2</span></span><div class="chips"><span class="chip">${c.rule} ${esc(R.title)}</span>${R.law.map(l=>`<span class="chip law">${esc(l)}</span>`).join("")}</div>
        ${srcq(A)}${B?srcq(B):""}
        <div class="sub">매칭 표준서 <span class="fx">F8</span> ${[A,B].filter(t=>t&&own(t)).map(t=>`${t.std} ${esc(STD[t.std].title)} (${t.sc.toFixed(2)})`).join(" · ")||"—"}</div>
        ${showCase?`<div class="case"><b>왜 위험한가</b> · ${esc(RISK_NOTE)}</div>`:""}</div>
      ${c.status==="met"?`<div class="sec"><span class="h">충족한 조건</span><p style="margin:0">${esc(S.mitig[c.key])}</p>${isHQ?`<div><button class="btn sm" data-act="unmet" data-key="${c.key}">조건 해제</button></div>`:""}</div>`:
      `<div class="hqbox"><span class="hq">반려·조정 주체 · 포스코 본청</span><span class="sub">협력사는 판정을 바꾸지 않습니다. 본청의 반려 사유와 수정 요구에 맞춰 수정본을 다시 제출합니다.</span>${isHQ?`<button class="btn sm rej" data-act="reject" data-key="${c.key}">반려하고 수정 요청</button>`:""}</div>
      <div class="sec"><span class="h">조정안 <span class="fx">F4</span> <span class="ai">AI 문장</span> 본청이 직접 적용하거나, 반려할 때 수정 요구로 보냅니다</span>${props.map((p,i)=>`<div class="prop"><div><div class="k">${p.kind}${i===0?" · 추천":""}</div><div>${esc(p.text)}</div></div><button class="btn ${i===0?"pri":""}" data-act="apply" data-key="${c.key}" data-pid="${p.id}" ${isHQ?"":"disabled"}>적용</button></div>`).join("")}
        ${isHQ?`<div class="row2"><label for="who">책임자</label><select id="who">${HQ.map(x=>`<option>${esc(x)}</option>`).join("")}</select><button class="btn sm" data-act="share" data-key="${c.key}">${S.shared.has(c.key+"|"+A.p)?"다시 공유":"조정 전에 공유"}</button></div>`:`<p class="note">반려·조정은 포스코 본청이 합니다. 우리 회사는 반려 사유에 맞춰 수정본을 다시 냅니다.</p>`}</div>`}
      <p class="note">시스템은 작업을 승인하거나 중지하지 않습니다. 적용하면 즉시 다시 대조하고 결정과 책임자를 기록합니다.</p></div></aside>`;return;}
  host.innerHTML="";
}
const FMTC={PDF:"var(--red)",XLSX:"var(--ok)",XLS:"var(--ok)",CSV:"var(--ok)",HWPX:"var(--blue)",HWP:"var(--blue)"};
const UPT={A:"11/09 09:12",B:"11/09 09:20",C:"11/09 09:31",D:"11/09 09:40",E:"11/09 09:44"};
function histSt(x){return x.st==="반려"?`<span class="fst" style="color:var(--red)">반려 · 포스코 본청</span>`:x.st==="검토 중"?`<span class="fst warn">포스코 본청 검토 중</span>`:x.st==="본청 조정"?`<span class="fst" style="color:var(--blue)">본청 조정 반영</span>`:`<span class="fst ok">반영</span>`;}
function revSt(p){const r=S.review[p];return r.st==="반려"?`<span class="fst" style="color:var(--red)">v${r.v} 반려 · 포스코 본청</span>`:r.st==="검토 중"?`<span class="fst warn">v${r.v} 포스코 본청 검토 중</span>`:`<span class="fst ok">v${S.ver[p]} 반영</span>`;}
function histHtml(pid){const rv=S.review[pid];
  return `<div class="sec"><span class="h">${P(pid).name} 제출 이력 · 최신 v${S.ver[pid]} · 반려 주체는 포스코 본청</span><div class="fl2">${S.hist[pid].slice().reverse().map(x=>`<div class="fr hrow"><b>v${x.v}</b><span style="min-width:0">${esc(mask(x.note||""))}${x.reason?`<br><span class="sub">반려 사유: ${esc(mask(x.reason))}</span>`:""}</span><span class="c3 t">${esc(x.time)}</span><span>${histSt(x)}</span></div>`).join("")}</div>
  ${rv.st==="반려"?`<div class="row2"><span class="hq">포스코 본청 반려</span><span>수정 요구: <b>${esc(mask(rv.req))}</b></span><button class="btn sm pri" data-act="resubmit" data-p="${pid}">수정본 v${rv.v+1} 제출</button></div>`:""}</div>`;}
const ficon=f=>`<span class="ficon" style="--fc:${FMTC[f]||"var(--ink-3)"}">${esc(String(f).slice(0,4))}</span>`;
function upBody(){
  const isHQ=S.role==="HQ",plist=isHQ?PARTNERS:PARTNERS.filter(p=>p.id===S.role);
  const st=s=>s==="ok"?`<span class="fst ok">구조화 완료</span>`:s==="wait"?`<span class="fst wait">대기</span>`:`<span class="fst run">${s}…</span>`;
  let h=`<div class="drop2" id="drop"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 36h-2a9 9 0 0 1-1.5-17.9A12 12 0 0 1 34 15a8 8 0 0 1 2 21h-2"/><path d="M24 40V24M18 30l6-6 6 6"/></svg>
    <div class="big1">파일을 여기로 끌어다 놓으세요</div><div class="sub">또는</div>
    <label class="pickbtn" for="fileIn">내 PC에서 찾아보기<input type="file" id="fileIn" multiple accept=".hwpx,.hwp,.xlsx,.xls,.pdf,.csv"></label>
    <div class="sub">HWPX · 엑셀 · PDF 등 지금 쓰는 양식 그대로 · 계획이 바뀌면 수정한 계획서를 다시 올립니다</div>
    ${isHQ||S.role==="C"?`<button class="link" data-act="v2" ${S.ver.C>1?"disabled":""}>${S.ver.C>1?"C사 변경본(v2) 반영됨":"시연: C사 변경본(v2) 올리기"}</button>`:""}</div>`;
  const rows=[];
  S.files.filter(f=>!f.p||isHQ||f.p===S.role).forEach(f=>rows.push(`<${f.p?`button data-act="upfile" data-p="${f.p}" aria-expanded="${S.upOpen===f.p}"`:"div"} class="fr"><span class="nm">${ficon(f.fmt)}<span>${esc(f.name)}${f.note?`<br><span class="sub">${esc(f.note)}</span>`:""}</span></span><span class="c2">${f.p?P(f.p).name:"—"}</span><span class="c3 t">${esc(f.time)}</span><span>${f.st==="ok"?`<span class="fst ok">v${f.ver} 반영</span>`:`<span class="fst wait">시연판은 보관만</span>`}</span></${f.p?"button":"div"}>`));
  plist.forEach(p=>{const n=S.tasks.filter(t=>isBase(t)&&!t.emerg&&t.p===p.id).length,need=S.tasks.filter(t=>isBase(t)&&!t.emerg&&t.p===p.id&&!t.ok).length,ms=S.tasks.filter(t=>isBase(t)&&!t.emerg&&t.p===p.id&&stdMissing(t).length).length;
    rows.push(`<button class="fr" data-act="upfile" data-p="${p.id}" aria-expanded="${S.upOpen===p.id}"><span class="nm">${ficon(p.fmt)}<span>${esc(fileName(p.id))}<br><span class="sub">v${S.ver[p.id]} · 제출 ${S.hist[p.id].length}회 · 작업 ${n}건${need?` · <span style="color:var(--amber)">확인 필요 ${need}</span>`:""}${ms?` · <span style="color:var(--red)">표준서 누락 ${ms}</span>`:""}</span></span></span><span class="c2">${p.name}</span><span class="c3 t">${esc(S.hist[p.id][S.hist[p.id].length-1].time)}</span><span>${S.fst[p.id]==="ok"?revSt(p.id):st(S.fst[p.id])}</span></button>`);});
  h+=`<div class="sec"><div class="flh"><span>올린 파일</span><b>${rows.length}</b><span class="sub">개 · 파일을 누르면 추출 결과가 펼쳐집니다</span></div><div class="fl2"><div class="fr hd"><span>이름</span><span class="c2">업체</span><span class="c3">올린 시각</span><span>상태</span></div>${rows.join("")}</div></div>`;
  const p=S.upOpen&&plist.find(x=>x.id===S.upOpen);
  if(p&&S.fst[p.id]==="ok"){
    h+=histHtml(p.id);
    const ts=S.tasks.filter(t=>isBase(t)&&!t.emerg&&t.p===p.id).sort((a,b)=>a.s-b.s);
    const zo=z=>Object.entries(ZONES).map(([k,v])=>`<option value="${k}" ${k===z?"selected":""}>${v.name}</option>`).join("");
    h+=`<div class="sec"><span class="h">${p.name} 추출 결과 <span class="ai">AI 추출</span> 값을 고치면 바로 다시 대조합니다</span><div class="xt-wrap"><table class="xt"><thead><tr><th>확인</th><th>작업</th><th>기간 (날짜 입력 · 일차 자동)</th><th>시간</th><th>위치</th><th>유형</th><th>작업표준서 매칭</th></tr></thead><tbody>${ts.map(t=>{const ms=stdMissing(t);return `<tr>
      <td><input type="checkbox" data-f="ok" data-t="${t.id}" ${t.ok?"checked":""} aria-label="${t.id} 확인">${!t.ok&&t.conf?`<div class="flag">${t.conf.f} ${t.conf.v.toFixed(2)}</div>`:""}</td>
      <td><span class="mono">${t.id}</span> ${esc(t.name)}<div class="sub" title="${esc(t.src)}" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">원문: ${esc(t.src)}</div></td>
      <td style="white-space:nowrap"><input type="date" min="2026-11-12" max="2027-04-30" value="${iso(t.s)}" data-f="sd" data-t="${t.id}" aria-label="${t.id} 시작 날짜"> ~ <input type="date" min="2026-11-12" max="2027-04-30" value="${iso(t.e)}" data-f="ed" data-t="${t.id}" aria-label="${t.id} 종료 날짜"><div class="sub">D<b>${t.s}</b>~D<b>${t.e}</b> · ${t.e-t.s+1}일</div></td>
      <td class="t" style="white-space:nowrap">${hr(t.h0,t.h1)}</td>
      <td><select data-f="zone" data-t="${t.id}" aria-label="${t.id} 위치">${zo(t.zone)}</select></td>
      <td>${t.types.join("·")||"—"}${t.types.includes("화기")?`<div class="${t.fw?"sub":"miss"}">화재감시자 ${t.fw?"배치":"미기재"}</div>`:""}</td>
      <td>${t.std} ${esc(STD[t.std].title)}<div class="sub">임베딩 유사도 ${t.sc.toFixed(2)}</div>${ms.length?`<div class="miss">필수 단계 누락: ${esc(ms.join(", "))}</div>`:""}</td></tr>`;}).join("")}</tbody></table></div></div>`;
  }
  return h;
}
function editTask(id,f,val){const t=task(id);if(!t)return;
  if(f==="ok"){t.ok=!!val;renderAll();return;}
  if(f==="sd"||f==="ed"){const n=dayOfIso(val);if(!n){renderAll();return;}f=f==="sd"?"s":"e";val=n;}
  if(f==="s"||f==="e"){const n=Math.max(1,Math.min(160,parseInt(val,10)||1));t[f]=n;if(t.e<t.s){if(f==="s")t.e=t.s;else t.s=t.e;}}
  if(f==="zone"){t.zone=val;t.ok=true;}
  const {added,resolved}=rejudge();
  S.log.unshift({time:clock(),type:"계획 수정",sum:`${t.id} ${t.name} ${f==="zone"?"위치":"기간"} 수정`,dec:`자동 재대조 · 해소 ${resolved.length} · 새 충돌 ${added.length}`,who:S.role==="HQ"?HQ[0]:P(S.role).lead,rule:"",law:"",parties:[t.p]});
  toast(`다시 대조했습니다 · 해소 ${resolved.length}건 · 새 충돌 ${added.length}건`);renderAll();}

/* ================= 2. 3D · 충돌 (F3) ================= */
/* 3D · 충돌 탭은 scene3d(app/frontend/public/scene3d) 하나만 쓴다. 데이터·역할·시각은 아래 s3Sync가 postMessage로 넘긴다 */
function renderModel(){$("#s3card").hidden=false;s3Sync();}

/* ================= scene3d 연동 (app/frontend/public/scene3d, 같은 출처 iframe + postMessage) =================
   보내는 것: data{tasks, conflicts} (src/types.ts 모양) · role(ViewerRole + level) · time · selectTask
   받는 것: ready · select{taskId, zoneId} · decision{changeId, taskId, decision, by}
   협력사로 보면 권한 범위(자기 작업 + 영향을 주는 작업) 안의 작업만 넘긴다. 서버 권한 필터를 대신하지 않는다 */
const S3={ready:false,sig:"",src:"",hour:null,pendingSelect:null,timer:null};
const S3ZONE={Z1:"TOP",Z2:"STACK",Z3:"STACK",Z4:"BELLY_BOSH",Z5:"TUYERE",Z6:"HEARTH",Z7:"SHELL",Z8:"CASTHOUSE",Z9:"STOVE"};
const S3HZ={"화기":"hot_work","밀폐":"confined","고소":"height","중량물":"heavy_lift","가스":"gas"};
const S3TYPE={"R-SZ-01":"same_time_zone","R-CG-01":"same_time_zone","R-VT-01":"vertical","R-HF-01":"hot_gas","R-HG-01":"hot_gas","R-SQ-01":"sequence","R-DF-01":"sop_missing","R-DF-03":"sop_missing"};
const s3Contractor=p=>`가상-${P(p).name}`;
function s3Payload(){const d=S.day,ds=iso(d),at=h=>`${ds}T${hh(h)}:00`;
  const ts=S.tasks.filter(t=>actOn(t,d)&&inScope(t)),ids=new Set(ts.map(t=>t.id));
  const tasks=ts.map(t=>({id:t.id,contractor:s3Contractor(t.p),name:(t.emerg?"[긴급] ":"")+tn(t),trade:own(t)?P(t.p).trade:null,zone_id:S3ZONE[t.zone],
    start:at(t.h0),end:at(t.h1),shift:"day",hazards:t.types.map(k=>S3HZ[k]).filter(Boolean),risk_codes:[],predecessors:t.pre.filter(id=>ids.has(id)),
    source:own(t)?{file:fileName(t.p),locator:t.id,text:t.src}:null,crew:own(t)?t.crew:null,sectors:(t.pos||t.path)?s3Sectors(t,d):null}));
  const conflicts=visC().filter(c=>c.status==="open"&&c.from<=d&&d<=c.to).map(c=>({id:c.key,type:S3TYPE[c.rule]||"same_time_zone",grade:c.level,
    task_ids:[c.a,c.b].filter(x=>x&&ids.has(x)),rule_id:c.rule,legal_basis:RULES[c.rule].law.join(" / "),window_start:at(c.h0),window_end:at(c.h1),
    reason:strip(sentence(c)),suggestion:(proposals(c)[0]||{}).text||null,
    sources:[c.a,c.b].filter(Boolean).map(task).filter(t=>t&&own(t)).map(t=>({file:fileName(t.p),locator:t.id,text:t.src}))}));
  const role=S.role==="HQ"?{kind:"prime"}:{kind:"contractor",contractor:s3Contractor(S.role),level:S.lvl==="worker"?"worker":"lead"};
  return {tasks,conflicts,role,restrictions:s3Restrictions(d)};}
/* 작업 방위(북·동·남·서)를 30분 단위로 묶음 → scene3d가 작업자를 그 방위에 세우고, 출입 제한 방위와 겹치면 긴급 알림 */
function s3Sectors(t,d){const at=h=>`${iso(d)}T${hh(h)}:00`,out=[];
  for(let h=t.h0;h<t.h1;h+=0.5){const dirs=secAt(t,h),k=dirs.join(""),l=out[out.length-1];if(l&&l.k===k){l.end=at(h+0.5);continue;}out.push({k,start:at(h),end:at(h+0.5),dirs});}
  return out.filter(x=>x.dirs.length).map(({k,...r})=>r);}
/* 방위별 출입 제한: 구역·30분마다 zoneMap의 위험 방위(북·동·남·서) → scene3d가 허용·금지 방위 경계에 안전띠·러버콘을 세운다
   (경고 문구를 여러 개 띄우는 대신 현장 조치를 3D로 보여 준다). 07~19시, 같은 상태가 이어지면 한 구간으로 묶는다 */
function s3Restrictions(d){const at=h=>`${iso(d)}T${hh(h)}:00`,out=[];
  Object.keys(ZONES).forEach(z=>{let cur=null;
    for(let h=7;h<19;h+=0.5){const {map,src}=zoneMap(z,d,h),blocked=SEC.filter(k=>map[k]==="danger"),key=blocked.join("");
      if(cur&&cur.key===key){cur.end=at(h+0.5);src.forEach(i=>cur.source_ids.includes(i.s.id)||cur.source_ids.push(i.s.id));continue;}
      if(cur&&cur.key)out.push(cur);
      cur={key,zone_id:S3ZONE[z],start:at(h),end:at(h+0.5),blocked,source_ids:[...new Set(src.map(i=>i.s.id))],reason:[...new Set(src.map(i=>own(i.s)?`${P(i.s.p).name} ${tn(i.s)}`:tn(i.s)))].join(" · ")};}
    if(cur&&cur.key)out.push(cur);});
  return out.map(({key,...r})=>r);}
function s3Post(msg){const f=$("#s3frame iframe");if(f&&f.contentWindow)f.contentWindow.postMessage({source:"hansotbap",...msg},location.origin);}
function s3Fail(why){$("#s3info").textContent="연결 안 됨";$("#s3frame").innerHTML=`<div class="empty"><div>scene3d 화면을 불러오지 못했습니다.</div><div class="sub">${why}</div><div class="row2"><button class="btn sm" data-act="s3retry">다시 불러오기</button></div></div>`;}
// 3D 준비가 늦어도 iframe은 지우지 않는다 (GPU 없는 PC에서는 첫 표시가 수십 초 걸릴 수 있음). 늦어지면 안내만 띄운다 [팀 설정값: 20초]
function s3Slow(){$("#s3info").innerHTML=`3D 준비가 늦어지고 있습니다 · <button class="link" data-act="s3retry" style="padding:0">다시 불러오기</button>`;}
function s3Sync(force){
  if(cur!=="model"&&!$("#s3frame iframe"))return;
  const ds=iso(S.day),host=$("#s3frame");
  if(location.protocol==="file:"){s3Fail("파일을 직접 열면 scene3d와 통신할 수 없습니다. 레포 루트에서 npm run dev로 열어 주세요.");return;}
  if(S3.src!==ds||!host.querySelector("iframe")){
    S3.ready=false;S3.sig="";S3.hour=S.mhour;S3.src=ds;$("#s3info").textContent="불러오는 중…";
    host.innerHTML=`<iframe src="/scene3d/index.html?embed=1&date=${ds}&now=${ds}T${hh(S.mhour)}" title="고로 3D · 충돌 (scene3d)"></iframe>`;
    clearTimeout(S3.timer);S3.timer=setTimeout(()=>{if(!S3.ready)s3Slow();},20000);return;}
  if(!S3.ready)return;
  const p=s3Payload(),sig=JSON.stringify(p);
  if(force||sig!==S3.sig){S3.sig=sig;s3Post({type:"data",tasks:p.tasks,conflicts:p.conflicts,restrictions:p.restrictions});s3Post({type:"role",role:p.role});}
  if(S3.hour!==S.mhour){S3.hour=S.mhour;s3Post({type:"time",iso:`${ds}T${hh(S.mhour)}`});}
  if(S3.pendingSelect&&p.tasks.some(t=>t.id===S3.pendingSelect)){s3Post({type:"selectTask",taskId:S3.pendingSelect});S3.pendingSelect=null;}
  $("#s3info").textContent=`${ymd(S.day)} · ${S.role==="HQ"?"포스코 직영관리자":`${P(S.role).name} ${S.lvl==="worker"?"작업자":"파트장"}`} · 작업 ${p.tasks.length}건 · 충돌 ${p.conflicts.length}건`;
}
addEventListener("message",e=>{const m=e.data;if(e.origin!==location.origin||!m||m.source!=="scene3d")return;
  if(m.type==="ready"){S3.ready=true;clearTimeout(S3.timer);s3Sync(true);}
  else if(m.type==="select"&&m.taskId){const t=task(m.taskId);if(t){const c=visC().find(x=>(x.a===t.id||x.b===t.id)&&x.status==="open"&&x.from<=S.day&&S.day<=x.to);if(c)S.focus=c.key;}}
  else if(m.type==="handover"){S.log.unshift({time:clock(),type:"교대 인계",sum:`${m.title||"교대 인계"} · 인계 항목 ${m.items||0}건`,dec:`${m.from==="day"?"주간조 → 야간조":"야간조 → 주간조"} 인계 확인`,who:m.by&&m.by.id?String(m.by.id).replace(/^가상-/,"")+(m.by.level==="manager"?" 직영관리자":" 파트장"):byWho(),rule:"F5",law:"",parties:[]});renderHistory();toast("교대 인계를 이력에 남겼습니다");}
  else if(m.type==="overtime"){const t=task(m.taskId);if(t)note(["HQ",t.p],`잔업 계획서 · ${tn(t)}`,`${String(m.start).slice(11,16)}–${String(m.end).slice(11,16)} · ${m.crew}명 · ${m.reason||""} — 승인 전 착수 불가`,"잔업");renderNoti();}
  else if(m.type==="violation"){S3.vseen=S3.vseen||new Set();
    (m.items||[]).forEach(v=>{const t=task(v.taskId);if(!t)return;const k=v.taskId+"|"+v.zone+"|"+v.until;if(S3.vseen.has(k))return;S3.vseen.add(k);
      note(["HQ",t.p],`긴급 · 출입 제한 구역 안 작업 · ${tn(t)}`,`${v.where} 출입 제한(${v.until}까지, ${v.cause||"상부 작업"}) 구역 안에서 작업 중입니다. 3D·충돌 탭에서 시정 명령을 내려 주세요.`,"긴급");});
    renderNoti();if(m.items&&m.items.length)toast(`출입 제한 구역 안 작업 ${m.items.length}건 · 책임자·직영관리자에게 알렸습니다`);}
  else if(m.type==="correction"){const t=task(m.taskId),how=m.action==="move"?`${m.dirName||m.dir}으로 작업 위치 이동`:`${m.until||"제한 해제"}까지 작업 중지`;
    S.log.unshift({time:clock(),type:"시정 명령",sum:`${t?tn(t):m.taskId} · ${how}`,dec:`출입 제한 구역 안 작업 시정 (${m.where||""} 금지)`,who:m.by&&m.by.id?String(m.by.id).replace(/^가상-/,"")+(m.by.level==="manager"?" 직영관리자":" 파트장"):byWho(),rule:"F3",law:"",parties:t?[t.p]:[]});
    if(t)note([t.p,"HQ"],`시정 명령 · ${tn(t)}`,how,"시정");renderNoti();renderHistory();toast(`시정 명령을 전달했습니다 · ${how}`);}
  else if(m.type==="decision"){const t=task(m.taskId);S.log.unshift({time:clock(),type:m.decision==="approved"?"착수 승인":"착수 보류",sum:`3D 화면 결정 · ${t?tn(t):m.taskId}`,dec:`scene3d 긴급 변경 ${m.changeId||""} ${m.decision==="approved"?"승인":"반려"}`,who:m.by&&m.by.id?String(m.by.id).replace(/^가상-/,"")+(m.by.level?` ${m.by.level==="manager"?"직영관리자":m.by.level==="worker"?"작업자":"파트장"}`:""):byWho(),rule:"F3",law:"",parties:t?[t.p]:[]});renderHistory();toast(`3D 화면에서 ${m.decision==="approved"?"승인":"반려"}했습니다 · 이력에 남겼습니다`);}
});

/* ================= 3. TBM 확인 (F7) ================= */
function tbmItems(p,d){
  const items=[],add=(it,src,rule)=>{if(!items.find(x=>x.label===it.label))items.push({...it,src,rule});};
  const act=S.tasks.filter(t=>t.p===p&&actOn(t,d)),ids=new Set(act.map(t=>t.id)),hit=(a,b)=>ids.has(a)||(b&&ids.has(b));
  S.adjusted.filter(a=>a.parties.includes(p)&&hit(a.a,a.b)).forEach(a=>a.rules.forEach(r=>RULES[r].tbm.forEach(it=>add(it,`원청 조정 · ${a.short}`,r))));
  S.conflicts.filter(c=>c.from<=d&&d<=c.to&&hit(c.a,c.b)).forEach(c=>RULES[c.rule].tbm.forEach(it=>add(it,`${c.status==="met"?"조건부 허용":"충돌"} · ${labelOf(c.key)}`,c.rule)));
  const pk=riskPeak(d,p);if(pk){const H=Math.floor(pk.h0),pat=new RegExp(`${H}\\s?시|${H}:|오후\\s?${H>12?H-12:H}\\s?시|${H>12?H-12:H}\\s?시`);add({label:`${hr(pk.h0,pk.h1)} 위험 시간대 안내`,all:[pat],say:`${H}시부터 ${Math.ceil(pk.h1)}시까지는 겹치는 작업이 몰리는 위험 시간대라 특히 조심합니다.`},"위험 시간대 예보 F9","F9");}
  act.forEach(t=>STD[t.std].tbm.forEach(it=>add(it,`작업표준서 ${t.std} · ${t.name}`,"F8")));
  return {items,act};
}
const tbmKey=(p,d)=>`${p}|${d}`;
const tbmRun=(p,d)=>S.tbm.runs[tbmKey(p,d)]||null;
/* 업체별 오늘 TBM 상태: none 작업 없음 · todo 미실시 · miss 빠짐 있음 · ok 모두 전달 */
function tbmStatus(p,d){
  const {items,act}=tbmItems(p,d);if(!act.length)return {k:"none",txt:"작업 없음"};
  const r=tbmRun(p,d);if(!r)return {k:"todo",txt:items.length?`미실시 · ${items.length}개 전달할 것`:"미실시"};
  const m=r.res.filter(x=>x.st!=="ok").length;
  if(m)return {k:"miss",txt:`빠짐 ${m}건${r.notified?" · 알림 보냄":""}`};
  return {k:"ok",txt:r.sup?`보충 완료 ${r.sup}`:`모두 전달 ${r.time.split(" ")[1]||r.time}`};
}
function runTbm(sup){const p=S.tbm.p,d=S.day,{items}=tbmItems(p,d),key=tbmKey(p,d),prev=S.tbm.runs[key],pp=P(p);
  const sents=S.tbm.text.split(/\n+/).flatMap(l=>l.split(/(?<=[.?!])\s+/)).map(s=>s.trim()).filter(Boolean);
  const was=sup&&prev?Object.fromEntries(prev.res.map(r=>[r.label,r])):{};
  const res=items.map(it=>{const m=x=>it.all.every(r=>r.test(x)),s=(it.confirm&&sents.find(x=>m(x)&&it.confirm.test(x)))||sents.find(m);const r=!s?{...it,st:"miss"}:it.confirm&&!it.confirm.test(s)?{...it,st:"weak",q:s}:{...it,st:"ok",q:s};
    const w=was[it.label];if(w&&r.st==="ok"&&(w.st!=="ok"||w.sup))r.sup=true;return r;});
  const ok=res.filter(r=>r.st==="ok").length,ms=res.filter(r=>r.st!=="ok");
  S.tbm.runs[key]={res,text:S.tbm.text,sample:S.tbm.sample,time:sup&&prev?prev.time:clock(),notified:sup&&prev?prev.notified:null,sup:sup?clock().split(" ")[1]:null};
  if(sup){const fixed=res.filter(r=>r.sup).length;
    S.log.unshift({time:clock(),type:"TBM 확인",sum:`${pp.name} TBM ${md(d)} 보충 전달 · 보충 ${fixed} / 남은 빠짐 ${ms.length}`,dec:ms.length?`아직 빠진 항목: ${ms.map(m=>m.label).join(", ")}`:"빠진 항목 모두 보충 전달됨",who:`${pp.name} ${pp.lead}`,rule:"F7",law:"",parties:[p]});
    if(!ms.length)note([p,"HQ"],`TBM 보충 전달 완료 · ${pp.name}`,`빠졌던 ${fixed}건을 작업 시작 전에 다시 전달했습니다`,"알림");
    toast(ms.length?`보충 전달 후에도 ${ms.length}건이 남았습니다`:"빠진 항목을 모두 보충 전달했습니다");}
  else S.log.unshift({time:clock(),type:"TBM 확인",sum:`${pp.name} TBM ${md(d)} · 전달 ${ok} / 빠짐·불충분 ${ms.length}`,dec:ms.length?`빠진 항목: ${ms.map(m=>m.label).join(", ")}`:"모두 전달됨",who:`${pp.name} ${pp.lead}`,rule:"F7",law:"",parties:[p]});
  renderTbm();renderBoard();renderHistory();renderNoti();}
let recT=null;
/* 받아쓰기 시연: base 뒤에 full을 조금씩 채우고, 끝나면 done() */
function typeOut(full,base,done){S.tbm.rec=true;renderTbm();let i=0;
  const step=()=>{i=Math.min(full.length,i+(reduced?full.length:6));S.tbm.text=base+full.slice(0,i);const ta=$("#tbmText");if(ta)ta.value=S.tbm.text;const lv=document.querySelector(".m1rec .live");if(lv)lv.textContent=full.slice(0,i).split(/\n+/).filter(Boolean).pop()||"";if(i<full.length)recT=setTimeout(step,30);else{S.tbm.rec=false;done();}};step();}
function startRec(){if(S.tbm.rec){stopRec();return;}const set=tbmSet(S.tbm.p,S.day);
  if(!set){toast("이 날짜·업체에는 시연 녹음이 없습니다. 받아쓰기 칸에 직접 입력하세요");return;}
  delete S.tbm.runs[tbmKey(S.tbm.p,S.day)];typeOut(set[S.tbm.sample].text,"",()=>runTbm());}
function startSup(){if(S.tbm.rec){stopRec();return;}const r=tbmRun(S.tbm.p,S.day),ms=r?r.res.filter(x=>x.st!=="ok"):[];if(!ms.length)return;
  typeOut(ms.map(tbmSay).join("\n"),S.tbm.text.replace(/\s+$/,"")+`\n\n[보충 전달 ${clock().split(" ")[1]}]\n`,()=>runTbm(true));}
function stopRec(){clearTimeout(recT);S.tbm.rec=false;renderTbm();}
/* 상황판 숫자 띠: 본청은 업체별 TBM 완료 수, 협력사는 우리 TBM 상태 */
function tbmStat(d){const go_=`<button class="link" data-act="tbmpick" style="padding:0">보기</button>`;
  if(S.role!=="HQ"){const s=tbmStatus(S.role,d);return `<div class="stat"><span class="k">우리 TBM <span class="fx">F7</span></span><span class="v"><span class="big" ${s.k==="miss"?'style="color:var(--red)"':""}>${s.k==="ok"?"완료":s.k==="miss"?"보충":s.k==="todo"?"전":"—"}</span></span><span class="d">${esc(s.txt)} · ${go_}</span></div>`;}
  const rows=PARTNERS.map(x=>({x,s:tbmStatus(x.id,d)})).filter(o=>o.s.k!=="none"),ok=rows.filter(o=>o.s.k==="ok").length,ms=rows.filter(o=>o.s.k==="miss"),todo=rows.filter(o=>o.s.k==="todo");
  return `<div class="stat"><span class="k">TBM 확인 <span class="fx">F7</span></span><span class="v"><span class="big" ${ms.length?'style="color:var(--red)"':""}>${ok}</span><small>/${rows.length}곳</small></span><span class="d">${ms.length?`빠짐 ${ms.map(o=>o.x.name).join("·")}`:todo.length?`미실시 ${todo.length}곳`:"모두 전달"} · ${go_}</span></div>`;}
function renderTbm(){
  if(S.role!=="HQ")S.tbm.p=S.role;const p=P(S.tbm.p),d=S.day,{items,act}=tbmItems(p.id,d),key=tbmKey(p.id,d),run=S.tbm.runs[key],res=run?run.res:null,set=tbmSet(p.id,d);
  if(S.tbm.key!==key&&!S.tbm.rec){S.tbm.key=key;S.tbm.text=run?run.text:"";S.tbm.sample=run&&run.sample||"A";}
  const rm=res?Object.fromEntries(res.map(r=>[r.label,r])):{};const miss=res?res.filter(r=>r.st!=="ok"):[];
  const lastLine=S.tbm.text.split(/\n+/).filter(Boolean).pop()||"";
  let h="";
  if(S.role==="HQ"){const rows=PARTNERS.map(x=>({x,s:tbmStatus(x.id,d)})),need=rows.filter(o=>o.s.k!=="none");
    h+=`<section class="card tbmall"><header><h2>오늘 업체별 TBM</h2><span class="sub">${md(d)} · 작업 있는 ${need.length}곳 중 <b style="color:var(--ink)">${need.filter(o=>o.s.k==="ok").length}곳</b> 모두 전달</span></header><div class="tbmall-row">${rows.map(({x,s})=>`<button class="tst ${s.k}" data-act="tbmpick" data-p="${x.id}" aria-pressed="${x.id===p.id}" ${s.k==="none"?"disabled":""}><span class="dot" style="background:${pc(x.id)}"></span><b>${x.name}</b><span class="tsx">${esc(s.txt)}</span></button>`).join("")}</div></section>`;}
  h+=`<div class="tbm-h"><span class="pn">${p.name} TBM</span><span><span class="t">${ymd(d)}</span> · 작업 시작 전</span>
    ${S.role==="HQ"?`<label for="tbmP" class="sub">협력사</label><select id="tbmP">${PARTNERS.map(x=>`<option value="${x.id}" ${x.id===p.id?"selected":""}>${x.name}</option>`).join("")}</select>`:""}
    <span class="sub">오늘 작업: ${act.map(t=>`${esc(t.name)} <span class="t">${hr(t.h0,t.h1)}</span> <b>${t.crew}명</b>`).join(" · ")||"없음"}</span><span class="grow"></span>
    ${res?`<span class="sumbox"><span class="big" style="font-size:34px;color:var(--ok)">${res.length-miss.length}</span><span class="sub">전달됨</span><span class="big" style="font-size:34px;${miss.length?"color:var(--red)":""}">${miss.length}</span><span class="sub">빠짐·불충분</span></span>`:`<span class="sumbox"><span class="big" style="font-size:34px">${items.length}</span><span class="sub">개 전달할 것</span></span>`}</div>`;
  const ph=S.tasks.filter(t=>isBase(t)&&t.p===p.id&&actOn(t,d)).flatMap(t=>holdsOf(t.id,d).map(x=>({x,t}))),pw=ph.filter(o=>o.x.st!=="승인");
  if(pw.length)h+=`<div class="banner rejb"><span class="hq">포스코 본청 승인 대기</span><span>${pw.map(o=>esc(o.t.name)).join(", ")}: 승인 전에는 착수할 수 없습니다. TBM에서 대기 사실을 전달하세요.</span></div>`;
  else if(ph.length)h+=`<div class="banner"><span class="pill ok">본청 승인</span><span>승인 조건 ${ph.map(o=>`<b>${esc(mask(o.x.cond))}</b>`).join(" · ")}을 TBM에서 꼭 전달하세요.</span></div>`;
  if(miss.length)h+=`<div class="banner rejb"><span class="hq">작업 시작 전 보충 전달</span><span>빠진 ${miss.length}건을 작업자에게 다시 전달한 뒤 착수하세요. 항목마다 전달할 문장을 붙여 두었습니다.</span></div>`;
  else if(run&&run.sup)h+=`<div class="banner"><span class="pill ok">보충 완료</span><span>${run.sup}에 빠졌던 항목을 모두 다시 전달했습니다.</span></div>`;
  h+=`<section class="card"><header><h2>오늘 꼭 전달할 것</h2><span class="sub">포스코 본청이 공유한 충돌·조정 · 위험 시간대 · 작업표준서</span><span class="grow"></span><span class="ai">AI 판단</span></header><div class="m1list">`;
  h+=items.length?items.map(it=>{const r=rm[it.label],st=r?r.st:"";return `<div class="bck ${st}"><span class="mk">${st==="ok"?"✓":st==="weak"?"!":st==="miss"?"✕":"·"}</span><div><div class="lb">${esc(it.label)}${r&&r.sup?` <span class="pill ok">보충 전달</span>`:""}</div><div class="src">${esc(mask(it.src))}</div>
    ${r&&r.q?`<blockquote>${esc(r.q)}</blockquote>`:""}${st==="weak"?`<div class="why" style="color:var(--amber)">말은 했지만 확인한 사실이 아니라 전해 들은 말입니다</div>`:""}${st==="miss"?`<div class="why"><span class="kw">회의에서 나오지 않았습니다</span></div>`:""}
    ${st==="miss"||st==="weak"?`<div class="say"><span class="sub">이렇게 전달하세요</span> “${esc(tbmSay(it))}”</div>`:""}</div></div>`;}).join(""):`<div class="empty">${md(d)}에 ${p.name} 작업과 관련해 전달할 항목이 없습니다.<br><button class="btn" data-act="step" data-n="9" style="margin-top:10px">시연 9단계로 이동</button></div>`;
  h+=`</div></section>`;
  const sup=miss.length>0;
  h+=`<section class="card m1rec"><button class="recb ${S.tbm.rec?"on":""}" data-act="${sup?"suprec":"rec"}" aria-label="${S.tbm.rec?"녹음 중지":sup?"보충 전달 녹음 시작":"녹음 시작"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${S.tbm.rec?'<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>':'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'}</svg></button>
    <span>${S.tbm.rec?`<span class="kw">듣는 중</span> <span class="live">${esc(lastLine)}</span>`:sup?`보충 전달 녹음 <span class="sub">· 빠진 ${miss.length}건만 다시 말하면 이어서 대조합니다</span>`:`팀장 발언 녹음 <span class="sub">· 회의가 끝나면 자동으로 대조합니다</span>`}</span>
    ${set?`<span class="row2"><span class="sub">시연 녹음</span>${["A","B"].map(k=>`<button class="jump" data-act="sample" data-k="${k}" aria-pressed="${S.tbm.sample===k}">${set[k].label} · ${set[k].len}</button>`).join("")}${sup&&!S.tbm.rec?`<button class="link" data-act="rec" style="padding:0 4px">처음부터 다시 녹음</button>`:""}</span>`:""}
    <span class="grow"></span><button class="btn ${sup?"":"pri"}" data-act="runtbm" ${items.length?"":"disabled"}>체크리스트와 대조</button>
    ${sup?(run.notified?`<span class="pill mute">알림 보냄 ${esc(run.notified.split(" ")[1]||run.notified)}</span>`:`<button class="btn rej" data-act="notify">빠진 ${miss.length}건 ${esc(p.lead)}·포스코 본청에 알림</button>`):""}
    <details ${S.tbm.tx||!set?"open":""} id="txd"><summary>받아쓴 내용 ${S.tbm.text?"보기·수정":"직접 입력"}</summary><textarea id="tbmText" placeholder="팀장이 말한 내용이 여기에 받아써집니다">${esc(S.tbm.text)}</textarea>
      <div class="row2" style="margin-top:6px"><label class="link" for="audioIn" style="cursor:pointer">녹음 파일 올리기<input type="file" id="audioIn" accept="audio/*" style="position:absolute;width:1px;height:1px;opacity:0"></label><span class="note">녹음은 동의를 받고, 받아쓴 뒤 원본은 삭제합니다.</span></div></details></section>`;
  $("#tbmBody").innerHTML=h;
  const dt=$("#txd");if(dt)dt.addEventListener("toggle",()=>{S.tbm.tx=dt.open;});
}

/* ================= 4. 이력 (F5) ================= */
const HTYPES=["전체","전체 알림","착수 보류","착수 승인","착수","긴급 작업","지연 보고","TBM 확인","계획 변경","반려","재제출","조정","공유","위험 공지","알림","판정","계획 수정","되돌림","구조화"];
function csv(){return [["시각","구분","내용","결정","책임자","규칙","근거"]].concat(S.log.map(l=>[l.time,l.type,l.sum,l.dec,l.who,l.rule,l.law])).map(r=>r.map(x=>`"${String(x??"").replace(/"/g,'""')}"`).join(",")).join("\n");}
function renderHistory(){
  const isHQ=S.role==="HQ";let logs=isHQ?S.log:S.log.filter(l=>l.parties&&l.parties.includes(S.role));
  if(S.hfilt!=="전체")logs=logs.filter(l=>l.type===S.hfilt);
  const tc={"전체 알림":"var(--red)","착수 보류":"var(--red)","긴급 작업":"var(--red)","착수 승인":"var(--ok)","착수":"var(--blue)","TBM 확인":"var(--blue)","긴급 알림":"var(--red)","지연 보고":"var(--red)","조정":"var(--blue)","공유":"var(--ok)","계획 변경":"var(--red)","반려":"var(--red)","재제출":"var(--ok)","알림":"var(--red)","위험 공지":"var(--amber)","되돌림":"var(--amber)"};
  const st=(k,v,u)=>`<div class="stat"><span class="k">${k}</span><span class="v"><span class="big">${v}</span><small>${u}</small></span></div>`;
  let h=`<div class="hgrid">${st("착수 전 찾아낸 충돌 누계",S.seen.size,"건")}${st("조정 결정",S.adjusted.length,"건")}${st("미조치",visC().filter(c=>c.status==="open").length,"건")}${st("이행 기록",S.log.length,"건")}</div>
  <div class="two"><section class="card"><header><h2>이행 기록</h2><span class="sub">산안법 제64조 혼재작업 확인·조정 기록</span><span class="grow"></span><button class="btn sm" data-act="copycsv">CSV 복사</button></header>
  <div style="padding:10px 14px" class="filt">${HTYPES.map(t=>`<button class="fchip" data-act="hf" data-t="${t}" aria-pressed="${S.hfilt===t}">${t}</button>`).join("")}</div>
  <div style="overflow-x:auto"><table class="lt"><thead><tr><th>시각</th><th>구분</th><th>내용</th><th>결정</th><th>책임자</th><th>근거</th></tr></thead><tbody>${logs.map(l=>`<tr><td class="t" style="white-space:nowrap">${esc(l.time)}</td><td><span class="ty" style="color:${tc[l.type]||"var(--ink-3)"}">${esc(l.type)}</span></td><td>${l.type==="반려"?`<span class="hq">포스코 본청</span> `:""}${esc(mask(l.sum))}</td><td>${esc(mask(l.dec))}</td><td>${esc(mask(l.who))}</td><td>${l.rule?`<span class="mono">${esc(l.rule)}</span> `:""}<span class="sub">${esc(l.law)}</span></td></tr>`).join("")||`<tr><td colspan="6" class="empty">기록이 없습니다</td></tr>`}</tbody></table></div>
  <div style="padding:0 14px 14px" id="csvbox" hidden><textarea id="csvta" readonly style="height:140px;font-family:var(--mono);font-size:11.5px"></textarea></div></section>
  <section class="card"><header><h2>계획서 버전</h2></header><div class="vers">${PARTNERS.filter(p=>isHQ||p.id===S.role).map(p=>`<div class="ver"><span><span class="dot" style="background:${pc(p.id)}"></span> ${p.name} · v<b>${S.ver[p.id]}</b></span><span class="sub">${esc(fileName(p.id))}</span>${S.hist[p.id].map(x=>`<span class="sub">v${x.v} · ${esc(x.time)} · ${strip(histSt(x))}${x.reason?" · 사유 있음":""}</span>`).join("")}</div>`).join("")}</div>
  <header style="border-top:1px solid var(--line-2)"><h2>공유 현황</h2></header><div class="vers">${PARTNERS.filter(p=>isHQ||p.id===S.role).map(p=>{const n=[...S.shared].filter(k=>k.endsWith("|"+p.id)).length,o=S.conflicts.filter(c=>c.status==="open"&&involves(c,p.id)).length;return `<div class="ver"><span>${p.name} · ${esc(p.lead)}</span><span class="sub">공유 <b>${n}</b>건 · 미조치 <b>${o}</b>건</span>${isHQ?`<span><button class="link" style="padding:0" data-act="roleas" data-p="${p.id}">${p.name} 화면으로 보기</button></span>`:""}</div>`;}).join("")}</div></section></div>`;
  $("#hBody").innerHTML=h;
}

/* ================= AI 챗봇 (F6) ================= */
const SUGG=["내 작업과 겹치는 작업은?","내일 노정에서 누가 무슨 작업?","지금 노 내부 바닥에 몇 명?","오늘 금지 충돌은?","C사 작업 일정"];
function parseZ(q){if(/노정/.test(q))return["Z1"];if(/상부/.test(q))return["Z2"];if(/중부|노흉/.test(q))return["Z3"];if(/하부/.test(q))return["Z4"];if(/풍구|3층/.test(q))return["Z5"];if(/바닥|노저|노상/.test(q))return["Z6"];if(/작업대|철피/.test(q))return["Z7"];if(/주상|출선/.test(q))return["Z8"];if(/열풍로/.test(q))return["Z9"];return null;}
function parseD(q){if(/모레/.test(q))return[S.day+2,"모레"];if(/내일/.test(q))return[S.day+1,"내일"];if(/오늘|지금|현재/.test(q))return[S.day,"오늘"];let m=q.match(/D\s*\+?\s*(\d{1,3})/);if(m)return[+m[1],""];m=q.match(/(\d{1,2})\s*(?:월|\/)\s*(\d{1,2})/);if(m)return[dayFromMD(+m[1],+m[2]),""];return null;}
const evT=t=>!own(t)?"":`<span class="evc" title="${esc(t.src)}">${t.id} ${esc(fileName(t.p))}</span>`;
const evC=c=>`<span class="evc">${c.rule} ${esc(RULES[c.rule].law[0])}</span>`;
function answer(q){
  const me=S.role==="HQ"?null:S.role,pH=PARTNERS.find(p=>q.includes(p.name)),zs=parseZ(q),dd=parseD(q),lvl=/금지/.test(q)?"금지":/조건부/.test(q)?"조건부":null;
  if(/겹치|충돌|부딪|위험|금지/.test(q)){
    if(me&&pH&&pH.id!==me)return `<p>다른 협력사의 충돌 정보는 원청과 해당 협력사만 볼 수 있습니다.</p>`;
    const tg=pH?pH.id:me;let L=S.conflicts.filter(c=>c.status==="open"&&(!tg||involves(c,tg)));if(lvl)L=L.filter(c=>c.level===lvl);if(dd)L=L.filter(c=>c.from<=dd[0]&&dd[0]<=c.to);if(zs)L=L.filter(c=>zs.includes(task(c.a).zone)||(c.b&&zs.includes(task(c.b).zone)));
    let h=`<p>${dd?`${dd[1]||""} ${mdw(dd[0])} `:""}${tg?P(tg).name+" 작업과 ":""}겹치는 ${lvl||""} 작업은 <b>${L.length}건</b>입니다.</p>`;
    if(L.length)h+=`<ul>${L.slice(0,5).map(c=>`<li>${sentence(c)}<br>${evC(c)}${evT(task(c.a))}${c.b?evT(task(c.b)):""}<br><button class="goto" data-act="sel" data-key="${c.key}">상황판에서 보기</button></li>`).join("")}</ul>`;
    const adj=S.adjusted.filter(a=>!tg||a.parties.includes(tg)).slice(0,2);if(adj.length)h+=`<p class="sub">최근 조정: ${adj.map(a=>`${esc(mask(a.short))} (${esc(mask(a.who))})`).join(" / ")}</p>`;return h;}
  let day=dd?dd[0]:null;const pid=pH?pH.id:(/내 작업|우리/.test(q)&&me?me:null);if(!zs&&!pid&&day===null)day=S.day;if(zs&&day===null)day=S.day;
  let L=S.tasks.filter(t=>isBase(t)&&(!zs||zs.includes(t.zone))&&(!pid||t.p===pid)&&(day===null||actOn(t,day))).sort((a,b)=>a.s-b.s||a.h0-b.h0);
  const hid=S.role!=="HQ"&&L.some(t=>!own(t));L=L.filter(own);const hnote=hid?`<p class="sub">다른 협력사 일정은 포스코 본청만 볼 수 있습니다. 우리 작업과 겹친 시간은 "겹치는 작업"으로 물어보세요.</p>`:"";
  const head=`${day!==null?`${dd&&dd[1]?dd[1]+" ":""}${mdw(day)} `:""}${zs?zs.map(zn).join("·")+"에서 ":""}${pid?P(pid).name+"의 ":""}`;
  if(/몇\s?명/.test(q)){const n=L.filter(t=>t.h0<=NOW&&NOW<t.h1).reduce((a,t)=>a+t.crew,0);return `<p>${head}<span class="t">${hh(NOW)}</span> 기준 <b>${n}명</b>이 일하고 있습니다.</p><ul>${L.filter(t=>t.h0<=NOW&&NOW<t.h1).map(t=>`<li>${P(t.p).name} ${esc(t.name)} <b>${t.crew}명</b> ${evT(t)}</li>`).join("")}</ul>`;}
  if(!L.length)return `<p>${head}${S.role==="HQ"?"":"우리 회사 "}예정된 작업이 없습니다.</p>`+hnote;
  return `<p>${head}작업은 <b>${L.length}건</b>입니다.</p><ul>${L.map(t=>`<li>${P(t.p).name} · ${esc(t.name)} · ${zn(t.zone)} · <span class="t">${hr(t.h0,t.h1)}</span> · <b>${t.crew}명</b>${day===null?` · ${md(t.s)}~${md(t.e)}`:""}<br>${evT(t)}</li>`).join("")}</ul>`+hnote;
}
function ask(q){q=q.trim();if(!q)return;S.chat.push({w:"u",h:esc(q)});S.chat.push({w:"a",h:answer(q)});S.heard=null;renderChat();}
function voiceAsk(q){S.chatOpen=true;S.heard={q,listening:true};renderChat();setTimeout(()=>{S.heard={q,listening:false};renderChat();},reduced?50:900);}
function renderChat(){
  const host=$("#chatHost");if(!S.chatOpen){host.innerHTML="";return;}
  const ctx=S.role==="HQ"?"원청":P(S.role).name;
  host.innerHTML=`<aside class="chatp" aria-label="AI 챗봇"><header><b style="font-weight:500">AI에게 묻기</b><span class="fx">F6</span><span class="sub">${ctx} 권한 · 기준 ${md(S.day)} <span class="t">${hh(NOW)}</span></span><span class="grow"></span><button class="x" data-act="chat" aria-label="닫기">×</button></header>
  <div class="msgs" id="msgs"><div class="msg a"><p>언제, 어디서, 어느 협력사가 무슨 작업을 하는지 물어보세요. 마이크를 누르고 말해도 됩니다. 답에는 근거 계획서와 판정을 붙입니다.</p></div>${S.chat.map(m=>`<div class="msg ${m.w}">${m.h}</div>`).join("")}</div>
  ${S.heard?`<div class="heard">${S.heard.listening?`<span class="kw">듣는 중…</span>`:`<span>들은 문장: “${esc(S.heard.q)}”</span><span class="grow"></span><button class="btn sm pri" data-act="heardok">이대로 묻기</button><button class="btn sm" data-act="heardno">다시</button>`}</div>`:""}
  <div class="sugg">${SUGG.map(s=>`<button data-act="ask" data-q="${esc(s)}">${esc(s)}</button>`).join("")}</div>
  <form class="cin" id="chatForm"><button type="button" class="mic ${S.heard&&S.heard.listening?"on":""}" data-act="mic" aria-label="음성으로 묻기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><input type="text" id="chatIn" placeholder="질문 입력" autocomplete="off" aria-label="질문"><button class="btn pri" type="submit">묻기</button></form></aside>`;
  const m=$("#msgs");m.scrollTop=m.scrollHeight;
  $("#chatForm").addEventListener("submit",e=>{e.preventDefault();const i=$("#chatIn");ask(i.value);i.value="";});
}

/* ================= 이벤트 ================= */
function renderAll(){renderUrgent();renderNoti();renderHeader();renderBoard();renderDrawer();renderModel();renderTbm();renderHistory();renderChat();}
document.addEventListener("click",e=>{
  const el=e.target.closest("[data-act]");if(!el)return;const a=el.dataset.act;
  if(a==="step"){STEPS.find(s=>s.n===+el.dataset.n).f();return;}
  if(a==="reset"){if(upTimer)clearTimeout(upTimer);upTimer=null;S=fresh();initialJudge();go("board");renderAll();toast("처음 상태로 돌렸습니다");return;}
  if(a==="openup"){S.drawer={kind:"up",anim:true};S.upOpen=el.dataset.p||(S.role==="HQ"?(S.upOpen||null):S.role);renderDrawer();return;}
  if(a==="closedrawer"){S.drawer=null;S.sel=null;renderAll();return;}
  if(a==="upfile"){S.upOpen=S.upOpen===el.dataset.p?null:el.dataset.p;renderDrawer();return;}
  if(a==="v2"){receiveV2();S.step=Math.max(S.step,3);S.drawer=null;S.day=65;go("board");renderAll();return;}
  if(a==="sel"){S.sel=el.dataset.key;S.newKeys.delete(S.sel);const c=S.conflicts.find(x=>x.key===S.sel);if(c&&(S.day<c.from||S.day>c.to))S.day=c.from;S.drawer={kind:"conf",anim:!(S.drawer&&S.drawer.kind==="conf")};if(cur!=="board"&&cur!=="model")go("board");renderAll();return;}
  if(a==="task"){const t=task(el.dataset.t);const c=visC().find(x=>(x.a===t.id||x.b===t.id)&&x.from<=S.day&&S.day<=x.to);if(c){S.sel=c.key;S.drawer={kind:"conf",anim:!(S.drawer&&S.drawer.kind==="conf")};}else toast(own(t)?`${P(t.p).name} ${t.name} · ${hr(t.h0,t.h1)} · ${t.crew}명 · 겹침 없음`:`타사 ${tn(t)} · ${zn(t.zone)} · ${hr(t.h0,t.h1)}${t.path?" · "+t.path.map(q=>hr(q[0],q[1])+" "+SECN[q[2]]).join(", "):""}`);renderAll();return;}
  if(a==="apply"){applyProp(el.dataset.key,el.dataset.pid);return;}
  if(a==="reject"){reject(el.dataset.key);return;}
  if(a==="bell"){S.notiOpen=!S.notiOpen;renderNoti();return;}
  if(a==="nread"){const n=S.notes.find(x=>x.id===el.dataset.id);if(n)n.read.add(S.role);renderNoti();return;}
  if(a==="nall"){myNotes().forEach(n=>n.read.add(S.role));renderNoti();return;}
  if(a==="nperm"){try{if(typeof Notification==="undefined")throw 0;Notification.requestPermission().then(r=>{toast(r==="granted"?"브라우저 알림을 켰습니다":"브라우저 알림이 허용되지 않았습니다. 화면 안 알림은 계속 표시됩니다");renderNoti();}).catch(()=>toast("이 화면에서는 브라우저 알림을 켤 수 없습니다. 화면 안 알림은 계속 표시됩니다"));}catch(e){toast("이 화면에서는 브라우저 알림을 켤 수 없습니다. 화면 안 알림은 계속 표시됩니다");}return;}
  if(a==="mhour"){S.mhour=+el.dataset.h;renderModel();return;}
  if(a==="s3retry"){S3.src="";renderModel();return;}
  if(a==="openevent"){S.eform.tab="job";S.drawer={kind:"event",anim:true};renderDrawer();return;}
  if(a==="etab"){const t=el.dataset.t;if(t==="delay"){S.dform={t:null,h1:null,why:""};S.drawer={kind:"delay"};}else{S.eform.tab=t;S.drawer={kind:"event"};}renderDrawer();return;}
  if(a==="ejT"){const k=el.dataset.k,f=S.eform;f.types=f.types.includes(k)?f.types.filter(x=>x!==k):[...f.types,k];renderDrawer();return;}
  if(a==="ejS"){const k=el.dataset.k,f=S.eform;f.secs=f.secs.includes(k)?f.secs.filter(x=>x!==k):[...f.secs,k];renderDrawer();return;}
  if(a==="evK"){S.eform.vk=el.dataset.k;renderDrawer();return;}
  if(a==="esubmit"){const nm=$("#ejN");if(nm)S.eform.name=nm.value;if(el.dataset.t==="job")registerJob({...S.eform,types:[...S.eform.types],secs:[...S.eform.secs]},byWho());else registerVar({...S.eform},byWho());S.drawer=null;renderAll();return;}
  if(a==="happrove"){const i=$("#cond-"+el.dataset.id);approveHold(el.dataset.id,i?i.value:"");return;}
  if(a==="hkeep"){keepHold(el.dataset.id);return;}
  if(a==="hstart"){startTask(el.dataset.t);return;}
  if(a==="eack"){const e=S.events.find(x=>x.id===el.dataset.id);if(e){e.ack.add(S.role);S.log.unshift({time:clock(),type:"알림",sum:`전체 알림 수신 확인 · ${e.title}`,dec:"",who:byWho(),rule:"",law:"",parties:S.role==="HQ"?[]:[S.role]});}renderUrgent();renderHolds();renderHistory();return;}
  if(a==="gohold"){S.drawer=null;renderDrawer();go("board");setTimeout(()=>{const c=$("#holdCard");if(c)c.scrollIntoView({block:"start",behavior:reduced?"auto":"smooth"});},30);return;}
  if(a==="opendelay"){S.dform={t:el.dataset.t||null,h1:null,why:""};S.drawer={kind:"delay",anim:true};renderDrawer();return;}
  if(a==="dwhy"){S.dform.why=el.dataset.r;renderDrawer();return;}
  if(a==="dsubmit"){const f=S.dform;if(!f.t)return;const t=task(f.t);reportDelay(f.t,f.h1,f.why||"사유 미기재",S.role==="HQ"?`${HQ[0]} (대리 보고)`:`${P(t.p).name} ${P(t.p).lead}`);S.drawer=null;renderAll();return;}
  if(a==="uack"){const u=S.urgent.find(x=>x.id===el.dataset.id);if(u){u.ack.add(S.role);S.log.unshift({time:clock(),type:"알림",sum:`긴급 알림 수신 확인 · ${labelOf(u.key)}`,dec:"",who:S.role==="HQ"?HQ[0]:`${P(S.role).name} ${P(S.role).lead}`,rule:"",law:"",parties:S.role==="HQ"?[]:[S.role]});}renderUrgent();renderHistory();return;}
  if(a==="resubmit"){resubmit(el.dataset.p);return;}
  if(a==="to3d"){S.focus=el.dataset.key;const c=S.conflicts.find(x=>x.key===S.focus);if(c)S3.pendingSelect=c.b||c.a;if(c&&(S.day<c.from||S.day>c.to))S.day=c.from;S.mmode="conf";S.mview="3d";S.drawer=null;go("model");renderAll();return;}
  if(a==="focus"){S.focus=S.focus===el.dataset.key?null:el.dataset.key;const c=S.conflicts.find(x=>x.key===S.focus);if(c&&(S.day<c.from||S.day>c.to))S.day=c.from;S.mview="3d";renderHeader();renderModel();return;}
  if(a==="undo"){undoLast();return;}
  if(a==="share"){shareC(el.dataset.key);return;}
  if(a==="unmet"){delete S.mitig[el.dataset.key];rejudge();renderAll();return;}
  if(a==="risk"){sendRisk();return;}
  if(a==="closebanner"){S.banner=null;renderBoard();return;}
  if(a==="dprev"||a==="dnext"){S.day=Math.max(1,Math.min(TOTAL,S.day+(a==="dprev"?-1:1)));renderAll();return;}
  if(a==="day"){S.day=+el.dataset.d;renderAll();return;}
  if(a==="chat"){S.chatOpen=!S.chatOpen;renderChat();if(S.chatOpen)setTimeout(()=>$("#chatIn")&&$("#chatIn").focus(),0);return;}
  if(a==="ask"){ask(el.dataset.q);return;}
  if(a==="mic"){voiceAsk(SUGG[(S.chat.length/2|0)%SUGG.length]);return;}
  if(a==="heardok"){ask(S.heard.q);return;}
  if(a==="heardno"){S.heard=null;renderChat();return;}
  if(a==="rec"){startRec();return;}
  if(a==="sample"){const set=tbmSet(S.tbm.p,S.day);if(!set)return;S.tbm.sample=el.dataset.k;S.tbm.text=set[el.dataset.k].text;renderTbm();return;}
  if(a==="suprec"){startSup();return;}
  if(a==="tbmpick"){if(S.role==="HQ"&&el.dataset.p)S.tbm.p=el.dataset.p;go("tbm");renderTbm();return;}
  if(a==="runtbm"){S.tbm.text=$("#tbmText").value;runTbm();return;}
  if(a==="notify"){const p=P(S.tbm.p),run=tbmRun(p.id,S.day);if(!run||run.notified)return;const m=run.res.filter(r=>r.st!=="ok");run.notified=clock();
    S.log.unshift({time:clock(),type:"알림",sum:`TBM 미전달 ${m.length}건 · ${p.name}`,dec:m.map(x=>x.label).join(", "),who:`${p.lead} · ${HQ[0]}`,rule:"F7",law:LAW64,parties:[p.id]});
    note([p.id,"HQ"],`TBM 빠진 항목 ${m.length}건 · ${p.name}`,`작업 시작 전 보충 전달 필요: ${m.map(x=>x.label).join(", ")}`,"알림");
    toast(`${p.lead}와 원청 담당자에게 알렸습니다`);renderTbm();renderBoard();renderHistory();renderNoti();return;}
  if(a==="hf"){S.hfilt=el.dataset.t;renderHistory();return;}
  if(a==="roleas"){S.role=el.dataset.p;S.drawer=null;S.sel=null;renderAll();return;}
  if(a==="copycsv"){const t=csv(),box=$("#csvbox"),ta=$("#csvta");ta.value=t;const fb=()=>{box.hidden=false;ta.select();toast("복사가 막혀 있어 내용을 펼쳤습니다");};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(()=>toast(`이행 기록 ${S.log.length}건을 CSV로 복사했습니다`),fb);else fb();return;}
});
document.addEventListener("change",e=>{const el=e.target;
  const ef=S.eform;
  if(el.id==="ejP"){ef.p=el.value;renderDrawer();return;}
  if(el.id==="ejZ"){ef.zone=el.value;renderDrawer();return;}
  if(el.id==="ejH0"){ef.h0=+el.value;if(ef.h1<=ef.h0)ef.h1=Math.min(19,ef.h0+1);renderDrawer();return;}
  if(el.id==="ejH1"){ef.h1=+el.value;renderDrawer();return;}
  if(el.id==="ejC"){ef.crew=Math.max(1,+el.value||1);renderDrawer();return;}
  if(el.id==="evZ"){ef.vz=el.value;renderDrawer();return;}
  if(el.id==="evH1"){ef.vh1=+el.value;renderDrawer();return;}
  if(el.id==="dTask"){S.dform.t=el.value;S.dform.h1=null;renderDrawer();return;}
  if(el.id==="dEnd"){S.dform.h1=+el.value;renderDrawer();return;}
  if(el.id==="dateIn"){const n=dayOfIso(el.value);if(n){S.day=Math.max(1,Math.min(TOTAL,n));renderAll();}return;}
  if(el.id==="role"){const [r,l]=el.value.split(":");S.role=r;S.lvl=l||"hq";S.drawer=S.drawer&&S.drawer.kind==="up"?S.drawer:null;S.sel=null;S.upOpen=S.role==="HQ"?null:S.role;renderAll();return;}
  if(el.dataset&&el.dataset.f){editTask(el.dataset.t,el.dataset.f,el.type==="checkbox"?el.checked:el.value);return;}
  if(el.id==="fileIn"){addFiles(el.files);el.value="";return;}
  if(el.id==="tbmP"){S.tbm.p=el.value;renderTbm();return;}
  if(el.id==="tbmText"){S.tbm.text=el.value;return;}
  if(el.id==="audioIn"&&el.files[0]){toast(`${el.files[0].name} 수신 · 음성 인식은 Whisper 연동 단계에서 붙습니다`);el.value="";return;}
});
document.addEventListener("input",e=>{if(e.target.id==="dWhy"){S.dform.why=e.target.value;return;}if(e.target.id==="ejN"){S.eform.name=e.target.value;return;}if(e.target.id==="mday"){S.day=+e.target.value;renderHeader();renderModel();}});
function addFiles(fl){[...fl].forEach(f=>S.files.unshift({p:S.role==="HQ"?null:S.role,name:f.name,fmt:(f.name.split(".").pop()||"").toUpperCase().slice(0,4),time:clock(),ver:1,st:"keep"}));toast(`${fl.length}개 파일을 받았습니다`);renderDrawer();}
document.addEventListener("dragover",e=>{const d=e.target.closest&&e.target.closest("#drop");if(d){e.preventDefault();d.classList.add("over");}});
document.addEventListener("dragleave",e=>{const d=e.target.closest&&e.target.closest("#drop");if(d)d.classList.remove("over");});
document.addEventListener("drop",e=>{const d=e.target.closest&&e.target.closest("#drop");if(d){e.preventDefault();d.classList.remove("over");addFiles(e.dataTransfer.files);}});
addEventListener("keydown",e=>{if(e.key==="Escape"){if(S.notiOpen){S.notiOpen=false;renderNoti();}else if(S.chatOpen){S.chatOpen=false;renderChat();}else if(S.drawer){S.drawer=null;S.sel=null;renderAll();}}});
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>go(b.dataset.view)));

/* ================= 시작 ================= */
S=fresh();initialJudge();
renderAll();show(VIEWS.includes(location.hash.slice(1))?location.hash.slice(1):"board");
