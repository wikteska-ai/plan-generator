import fs from "fs";

const TIME_LIMIT = 300000; // 5 min (możesz zwiększyć)

const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

function saveProgress(p){
  try { fs.writeFileSync("progress.json", JSON.stringify(p)); } catch {}
}

// ===== LEKCJE (GRUPY OK) =====
function getLessons(data){

  let grouped = {};

  data.lessons.forEach(l => {

    const key = l.group
      ? "G_"+l.group
      : `${l.class}_${l.subject}_${l.teacher}`;

    if(!grouped[key]){
      grouped[key] = {
        subject: l.subject,
        teacher: l.teacher,
        classes: [],
        hours: l.hours
      };
    }

    grouped[key].classes.push(l.class);
  });

  let out = [];

  Object.values(grouped).forEach((g,i)=>{
    for(let h=0; h<g.hours; h++){
      out.push({
        id: i+"_"+h,
        ...g
      });
    }
  });

  return out;
}

// ===== CHECK =====
function canPlace(l,d,h,s,tBusy,cBusy,data){

  const t = data.teachers.find(x=>x.id===l.teacher);
  if(!t.availability.includes(d+"_"+h)) return false;
  if(tBusy[l.teacher+"_"+d+"_"+h]) return false;

  for(let c of l.classes){
    if(cBusy[c+"_"+d+"_"+h]) return false;
  }

  // WF blok
  if(l.subject === "wych.fizy." && h === 8) return false;

  return true;
}

// ===== PLACE =====
function place(l,d,h,s,tBusy,cBusy){

  tBusy[l.teacher+"_"+d+"_"+h] = true;

  for(let c of l.classes){

    cBusy[c+"_"+d+"_"+h] = true;

    if(!s[c]) s[c] = {};
    if(!s[c][d]) s[c][d] = {};

    s[c][d][h] = l;
  }
}

// ===== KONSTRUKCJA =====
function construct(lessons,data){

  let s={}, tBusy={}, cBusy={};

  const sorted = lessons.sort((a,b)=>{

    const ta = data.teachers.find(x=>x.id===a.teacher);
    const tb = data.teachers.find(x=>x.id===b.teacher);

    return ta.availability.length - tb.availability.length;
  });

  for(let l of sorted){

    let best=null;
    let bestScore=-999;

    for(let d of DAYS){
      for(let h of HOURS){

        if(!canPlace(l,d,h,s,tBusy,cBusy,data)) continue;

        let score=0;

        // 🔥 poranek
        if(h===1) score+=15;
        if(h===2) score+=10;
        if(h===3) score+=6;

        // kara za późne
        if(h>=7) score-=5;

        for(let c of l.classes){
          const day=s[c]?.[d]||{};
          score -= Object.keys(day).length;
        }

        if(score>bestScore){
          bestScore=score;
          best={d,h};
        }
      }
    }

    if(best){
      place(l,best.d,best.h,s,tBusy,cBusy);
    }
  }

  return s;
}

// ===== SCORE =====
function score(s){

  let penalty=0;

  for(let cls in s){

    for(let d of DAYS){

      const day=s[cls]?.[d]||{};
      const hours=Object.keys(day).map(Number).sort((a,b)=>a-b);

      if(hours.length===0) penalty+=200;
      if(hours.length<4) penalty+=80;
      if(hours.length>7) penalty+=40;

      // okienka
      for(let i=1;i<hours.length;i++){
        if(hours[i]!==hours[i-1]+1) penalty+=100;
      }

      // start
      if(hours.length>0){
        if(Math.min(...hours)>2) penalty+=100;
      }

      // max 2 tego samego
      let subjects={};
      for(let h of hours){
        let sub=day[h].subject;
        subjects[sub]=(subjects[sub]||0)+1;
      }

      for(let sub in subjects){
        if(subjects[sub]>2) penalty+=50;
      }
    }
  }

  return -penalty;
}

// ===== HARD FIX OKIENEK =====
function fixGaps(s){

  for(let cls in s){
    for(let d in s[cls]){

      let hours=Object.keys(s[cls][d]).map(Number).sort((a,b)=>a-b);

      for(let i=1;i<hours.length;i++){

        if(hours[i]!==hours[i-1]+1){

          let l=s[cls][d][hours[i]];

          delete s[cls][d][hours[i]];
          s[cls][d][hours[i-1]+1]=l;
        }
      }
    }
  }
}

// ===== SWAP 2-3 LEKCJI =====
function chainSwap(s){

  const classes=Object.keys(s);
  if(!classes.length) return;

  for(let i=0;i<3;i++){

    const c=classes[Math.floor(Math.random()*classes.length)];
    const d=Object.keys(s[c]||{})[0];
    if(!d) continue;

    const h=Object.keys(s[c][d])[0];
    if(!h) continue;

    const l=s[c][d][h];

    const d2=DAYS[Math.floor(Math.random()*5)];
    const h2=HOURS[Math.floor(Math.random()*8)];

    delete s[c][d][h];

    if(!s[c][d2]) s[c][d2]={};
    s[c][d2][h2]=l;
  }
}

// ===== IMPROVE =====
function improve(s,data,ms){

  let best=JSON.parse(JSON.stringify(s));
  let bestScore=score(best);

  let current=JSON.parse(JSON.stringify(s));
  let currentScore=bestScore;

  const start=Date.now();

  while(Date.now()-start<ms){

    let next=JSON.parse(JSON.stringify(current));

    fixGaps(next);
    chainSwap(next);

    let sc=score(next);

    if(sc>currentScore || Math.random()<0.1){
      current=next;
      currentScore=sc;

      if(sc>bestScore){
        best=JSON.parse(JSON.stringify(next));
        bestScore=sc;
      }
    }
  }

  return {best,bestScore};
}

// ===== MAIN =====
async function generateSchedule(data){

  const lessons=getLessons(data);

  let globalBest=null;
  let globalScore=-999;

  const start=Date.now();
  let iter=0;

  while(true){

    if(Date.now()-start>TIME_LIMIT) break;

    iter++;

    let s=construct(lessons,data);

    const {best,bestScore}=improve(s,data,2000);

    if(bestScore>globalScore){
      globalScore=bestScore;
      globalBest=best;
    }

    if(iter%2===0){
      saveProgress({
        percent: Math.floor(((Date.now()-start)/TIME_LIMIT)*100),
        iter,
        score: globalScore
      });
    }
  }

  if(!globalBest) globalBest={};

  let placed=0;

  for(let c in globalBest){
    for(let d in globalBest[c]){
      placed+=Object.keys(globalBest[c][d]).length;
    }
  }

  saveProgress({percent:100});

  return {
    status:"OK",
    placed,
    total:lessons.length,
    elapsed:Math.floor((Date.now()-start)/1000),
    schedule:globalBest
  };
}

export { generateSchedule };
