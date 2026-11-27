const SCHEMA="CREATE TABLE IF NOT EXISTS matches (id SERIAL PRIMARY KEY, stage TEXT NOT NULL, home TEXT NOT NULL, away TEXT NOT NULL, cutoff BIGINT NOT NULL, result TEXT);\n\nCREATE TABLE IF NOT EXISTS players (id SERIAL PRIMARY KEY, name TEXT NOT NULL, token TEXT NOT NULL UNIQUE);\n\nCREATE TABLE IF NOT EXISTS picks (player INTEGER NOT NULL REFERENCES players(id), match_id INTEGER NOT NULL REFERENCES matches(id), pick TEXT NOT NULL CHECK(pick IN ('L','E','V')), PRIMARY KEY(player,match_id));\n";
const stages = ['Cuartos · Ida','Cuartos · Vuelta','Semifinal · Ida','Semifinal · Vuelta','Final · Ida','Final · Vuelta'];
const options = {L:'Local', E:'Empate', V:'Visita'};
const valid = value => Object.hasOwn(options, value);
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))), x=>x.toString(16).padStart(2,'0')).join('');
const send = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function page(admin) {
 return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quiniela Liguilla MX</title><style>
 body{margin:0;background:#f1f5f2;color:#13251e;font:16px system-ui}header{background:#10392c;color:white;padding:24px}main,header div{max-width:760px;margin:auto}main{padding:16px}section{background:white;padding:18px;border-radius:14px;margin-bottom:14px}h1,h2{margin-top:0}label{display:block;margin:10px 0}input,select,button{font:inherit;padding:9px;border:1px solid #adbdb5;border-radius:7px;max-width:100%;box-sizing:border-box}button{background:#14553d;color:white;cursor:pointer;margin:5px 0}li{padding:6px 0}.match{border-top:1px solid #ccd8d1;padding:12px 0}p{line-height:1.45}#message{font-weight:bold}small{display:block}
 .picks-scroll{overflow-x:auto}.picks-table{width:100%;border-collapse:collapse;text-align:center}.picks-table th,.picks-table td{padding:10px;border:1px solid #ccd8d1;min-width:76px}.picks-table thead{background:#10392c;color:white}.picks-table tbody th{text-align:left;background:white;position:sticky;left:0}.picks-correct{background:#def3e5;font-weight:bold}.picks-table small{margin-top:4px}
 </style><header><div><h1>Quiniela Liguilla MX</h1>${admin?'Panel de administrador':'Pronósticos · Local, Empate o Visita'}</div></header><main>
 ${admin?`<section><h2>Administración</h2><label>Contraseña de administrador <input id="secret" type="password" autocomplete="current-password"></label><form id="register"><label>Nombre del participante <input name="name" minlength="2" maxlength="60" required></label><button>Generar código</button><output id="issued" aria-live="polite"></output></form></section><section><h2>Publicar partido</h2><form id="publish"><label>Etapa <select name="stage">${stages.map(s=>'<option>'+s+'</option>').join('')}</select></label><label>Local <input name="home" maxlength="65" required></label><label>Visitante <input name="away" maxlength="65" required></label><label>Fecha y hora del partido (Zacatecas) <input type="datetime-local" name="kickoff" required></label><button id="save-match">Publicar partido</button> <button type="button" id="cancel-edit" hidden>Cancelar edición</button></form></section><section><h2>Todos los pronósticos</h2><button type="button" id="view-players">Mostrar tabla de pronósticos</button><div id="players"></div></section>`:`<section><h2>Mi participación</h2><label>Código de participante <input id="code" autocomplete="off"></label><small>Usa el código que te dio el organizador. Puedes actualizar tu boleta hasta el cierre de la ronda.</small></section>`}
 <p id="message" role="status"></p><section><h2>Partidos y resultados</h2><div id="matches"></div></section><section><h2>Tabla general</h2><ol id="ranking"></ol></section></main>
 <script>
 const admin=${admin}, opts=${JSON.stringify(options)};
 const byId=id=>document.getElementById(id);
 const report=text=>byId('message').textContent=text;
 function rememberCode(code){try{localStorage.setItem('quiniela-code',code)}catch{}}
 async function api(path,data){
  const response=await fetch('/api/'+path,data?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}:{cache:'no-store'});
  const result=await response.json();
  if(!response.ok)throw Error(result.error);
  return result;
 }
 function run(action){return async event=>{event.preventDefault();try{await action(event)}catch(error){report(error.message)}}}
 let editingMatch=null;
 const secret=()=>byId('secret').value;
 function resetMatch(){
  editingMatch=null;
  byId('publish').reset();
  byId('save-match').textContent='Publicar partido';
  byId('cancel-edit').hidden=true;
 }
 if(admin){
  byId('cancel-edit').onclick=resetMatch;
  byId('secret').oninput=()=>byId('players').replaceChildren();
  byId('view-players').onclick=run(async ()=>{
   const password=secret();
   const data=await api('participants',{secret:password});
   if(secret()!==password)return;
   const list=byId('players');
   list.replaceChildren();
   if(!data.matches.length){
    list.textContent='Todavía no hay partidos publicados.';
    return;
   }
   const rounds=[...new Set(data.matches.map(match=>match.stage))];
   const selector=document.createElement('select');
   const label=document.createElement('label');
   label.append('Ronda ',selector);
   for(const round of rounds)selector.add(new Option(round,round));
   const viewport=document.createElement('div');
   viewport.className='picks-scroll';
   viewport.tabIndex=0;
   viewport.setAttribute('role','region');
   viewport.setAttribute('aria-label','Tabla de pronósticos');
   list.append(label,viewport);
   selector.onchange=()=>{
    const matches=data.matches.filter(match=>match.stage===selector.value);
    const table=document.createElement('table');
    table.className='picks-table';
    const header=table.createTHead().insertRow();
    function heading(row,text,scope){
     const cell=document.createElement('th');
     cell.scope=scope;
     cell.textContent=text;
     row.append(cell);
     return cell;
    }
    heading(header,'Participante','col');
    for(const match of matches){
     const cell=heading(header,match.home+' vs. '+match.away,'col');
     const official=document.createElement('small');
     official.textContent='Oficial · '+(opts[match.result]||'Pendiente');
     cell.append(official);
    }
    heading(header,'Aciertos','col');
    const body=table.createTBody();
    for(const player of data.players){
     const picks=new Map(player.picks.map(pick=>[pick.id,pick.pick]));
     const row=body.insertRow();
     heading(row,player.name,'row');
     let correct=0;
     for(const match of matches){
      const cell=row.insertCell();
      const pick=picks.get(match.id);
      cell.textContent=opts[pick]||'—';
      if(pick&&pick===match.result){
       correct++;
       cell.className='picks-correct';
       cell.textContent+=' ✓';
      }
     }
     row.insertCell().textContent=matches.some(match=>match.result)?correct:'—';
    }
    if(!data.players.length){
     const empty=body.insertRow().insertCell();
     empty.colSpan=matches.length+2;
     empty.textContent='Todavía no hay participantes registrados.';
    }
    viewport.replaceChildren(table);
   };
   selector.onchange();
  });
  byId('register').onsubmit=run(async e=>{
   byId('issued').textContent='';
   const player=await api('register',{...Object.fromEntries(new FormData(e.currentTarget)),secret:byId('secret').value});
   byId('issued').textContent=' Código para '+player.name+': '+player.code;
   e.target.reset();
  });
  byId('publish').onsubmit=run(async e=>{
   const fields=Object.fromEntries(new FormData(e.currentTarget));
   const id=editingMatch;
   await api('match',{...fields,id,secret:secret()});
   resetMatch();
   byId('players').replaceChildren();
   report(id===null?'Partido publicado.':'Partido actualizado.');
   await load();
  });
 }else{
  try{byId('code').value=localStorage.getItem('quiniela-code')||''}catch{}
  byId('code').oninput=()=>{
   for(const label of document.querySelectorAll('[data-match-id]')){
    if(label.textContent&&label.parentElement.querySelector('select')){
     const select=label.parentElement.querySelector('select');
     if(select.value===label.dataset.savedPick)select.value='';
    }
    label.textContent='';
   }
  };
  byId('code').onchange=()=>restorePicks();
 }
 let picksRevision=0;
 async function restorePicks(){
  const revision=++picksRevision;
  const code=byId('code').value.trim();
  try{
   const saved=code?await api('my-picks',{code}):{picks:[]};
   if(revision!==picksRevision||code!==byId('code').value.trim())return;
   if(code)rememberCode(code);
   const picks=new Map(saved.picks.map(row=>[String(row.match_id),row.pick]));
   for(const label of document.querySelectorAll('[data-match-id]')){
    const pick=picks.get(label.dataset.matchId);
    label.dataset.savedPick=pick||'';
    label.textContent=pick?'Tu pronóstico guardado: '+opts[pick]:'';
    const select=label.parentElement.querySelector('select');
    if(pick&&select&&select.value==='')select.value=pick;
   }
  }catch(error){
   if(revision===picksRevision)report(error.message);
  }
 }
 async function load(){
  const data=await api('state');
  byId('matches').replaceChildren();
  if(!data.matches.length)byId('matches').textContent='Todavía no hay partidos publicados.';
  const rounds=new Map();
  if(!admin){
   for(const match of data.matches){
    if(rounds.has(match.stage))continue;
    const form=document.createElement('form');
    const heading=document.createElement('h3');heading.textContent=match.stage;
    form.append(heading);
    rounds.set(match.stage,form);
    byId('matches').append(form);
    if(Date.now()<match.round_cutoff&&!match.round_closed){
     const button=document.createElement('button');button.textContent='Guardar boleta';
     form.onsubmit=run(async ()=>{
      const code=byId('code').value.trim();
      const picks=Object.fromEntries(new FormData(form));
      button.disabled=true;
      status.textContent='Guardando boleta…';
      try{
       await api('pick',{stage:match.stage,picks,code});
       status.textContent='Boleta guardada para '+match.stage+'.';
       if(code===byId('code').value.trim()){
        rememberCode(code);
        await restorePicks();
       }
      }catch(error){
       status.textContent=error.message;
      }finally{button.disabled=false;}
     });
     const status=document.createElement('p');
     status.setAttribute('role','status');
     form.append(button,status);
    }
   }
  }
  for(const match of data.matches){
   const form=document.createElement(admin?'form':'div');form.className='match';
   const title=document.createElement('strong');title.textContent=match.home+' vs. '+match.away;
   const meta=document.createElement('p');
   meta.textContent=match.stage+' · Cierre '+new Date(match.round_cutoff).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})+' · '+(opts[match.result]||'Resultado pendiente');
   form.append(title,meta);
   if(admin||(!match.round_closed&&Date.now()<match.round_cutoff)){
    const select=document.createElement('select');select.setAttribute('aria-label',admin?'Resultado oficial':'Pronóstico');
    if(!admin){
     select.name=String(match.id);select.required=true;
     select.add(new Option('Elige tu pronóstico',''));
    }
    for(const [value,label] of Object.entries(opts))select.add(new Option(label,value));
    if(match.result)select.value=match.result;
    if(!admin){
     form.append(select);
    }else{
    const button=document.createElement('button');button.textContent='Guardar resultado';
    form.append(select,' ',button);
    form.onsubmit=run(async ()=>{
     await api('result',{id:match.id,result:select.value,secret:byId('secret').value});report('Resultado guardado');await load();
    });
    }
   }
   if(!admin){
    const saved=document.createElement('small');
    saved.dataset.matchId=String(match.id);
    form.append(saved);
    const round=rounds.get(match.stage);
    round.insertBefore(form,round.querySelector('button'));
   }else{
    const edit=document.createElement('button');
    edit.type='button';
    edit.textContent='Editar partido';
    edit.onclick=()=>{
     editingMatch=match.id;
     const publish=byId('publish');
     for(const field of ['stage','home','away'])publish.elements[field].value=match[field];
     publish.elements.kickoff.value=new Date(match.cutoff+600000-21600000).toISOString().slice(0,16);
     byId('save-match').textContent='Guardar cambios';
     byId('cancel-edit').hidden=false;
     publish.elements.home.focus();
     publish.scrollIntoView({block:'center'});
    };
    const remove=document.createElement('button');
    remove.type='button';
    remove.textContent='Eliminar partido';
    remove.onclick=run(async ()=>{
     if(!confirm('¿Eliminar '+match.home+' vs. '+match.away+'? También se eliminarán sus pronósticos y su resultado.'))return;
     remove.disabled=true;
     try{
      await api('delete-match',{id:match.id,secret:secret()});
      if(editingMatch===match.id)resetMatch();
      byId('players').replaceChildren();
      report('Partido eliminado.');
      await load();
     }finally{remove.disabled=false;}
    });
    form.append(' ',edit,' ',remove);
    byId('matches').append(form);
   }
  }
  if(!admin)await restorePicks();
  byId('ranking').replaceChildren(...data.ranking.map(p=>{const li=document.createElement('li');li.textContent=p.name+' · '+p.points+' pts';return li}));
 }
 load().catch(error=>report(error.message));
 </script></html>`;
}
const worker = {async fetch(request,env){
 const path=new URL(request.url).pathname.replace(/\/$/,'')||'/';
 if(request.method==='GET'&&['/','/admin','/participantes'].includes(path)){
  return new Response(page(path==='/admin'),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
 }
 try{
  const db=env.DB;
  if(request.method==='GET'&&path==='/api/state'){
   const [matches,ranking]=await db.batch([
    db.prepare('SELECT *,MIN(cutoff) OVER (PARTITION BY stage) AS round_cutoff,BOOL_OR(result IS NOT NULL) OVER (PARTITION BY stage) AS round_closed FROM matches ORDER BY cutoff,id'),
    db.prepare('SELECT players.name, SUM(CASE WHEN picks.pick=matches.result THEN 1 ELSE 0 END) AS points FROM players JOIN picks ON players.id=picks.player JOIN matches ON matches.id=picks.match_id GROUP BY players.id ORDER BY points DESC,players.name')
   ]);
   return send({matches:matches.results,ranking:ranking.results});
  }
  if(request.method!=='POST'||!['/api/match','/api/result','/api/register','/api/participants','/api/pick','/api/my-picks','/api/delete-match'].includes(path))return send({error:'Ruta inexistente.'},404);
  if(Number(request.headers.get('content-length'))>4096)return send({error:'Solicitud demasiado grande.'},413);
  const raw=await request.text();
  if(raw.length>4096)return send({error:'Solicitud demasiado grande.'},413);
  let data;
  try{data=JSON.parse(raw)}catch{return send({error:'Solicitud inválida.'},400)}
  if(!data||typeof data!=='object')return send({error:'Solicitud inválida.'},400);
  if(path==='/api/match'||path==='/api/result'||path==='/api/register'||path==='/api/participants'||path==='/api/delete-match'){
   if(!env.ADMIN_PASSWORD||typeof data.secret!=='string'||(await hash(data.secret))!==(await hash(env.ADMIN_PASSWORD)))return send({error:'Contraseña de administrador incorrecta.'},401);
  }
  if(path==='/api/delete-match'){
   if(!Number.isSafeInteger(data.id)||data.id<=0)return send({error:'Partido inválido.'},400);
   const deleted=await db.prepare(`
    WITH removed_picks AS (DELETE FROM picks WHERE match_id=?)
    DELETE FROM matches WHERE id=?
   `).bind(data.id,data.id).run();
   return deleted.meta.changes?send({ok:true}):send({error:'Partido inexistente.'},404);
  }
  if(path==='/api/participants'){
   const [players,matches]=await db.batch([db.prepare(`
    SELECT p.name, COALESCE(
     json_agg(json_build_object('id',m.id,'pick',k.pick)
      ORDER BY m.cutoff,m.id) FILTER (WHERE k.match_id IS NOT NULL), '[]'::json
    ) AS picks
    FROM players p LEFT JOIN picks k ON k.player=p.id
    LEFT JOIN matches m ON m.id=k.match_id
    GROUP BY p.id ORDER BY lower(p.name),p.id
   `),db.prepare('SELECT id,stage,home,away,result FROM matches ORDER BY cutoff,id')]);
   return send({players:players.results,matches:matches.results});
  }
  if(path==='/api/match'){
   const home=String(data.home||'').trim(),away=String(data.away||'').trim();
   const kickoff=typeof data.kickoff==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(data.kickoff)?Date.parse(data.kickoff+'-06:00'):NaN;
   if(!home||!away||home.toLowerCase()===away.toLowerCase()||home.length>65||away.length>65||!stages.includes(data.stage)||!Number.isFinite(kickoff))return send({error:'Revisa etapa, equipos y horario.'},400);
   if(data.id!=null){
    if(!Number.isSafeInteger(data.id)||data.id<=0)return send({error:'Partido inválido.'},400);
    const updated=await db.prepare(`
     UPDATE matches m SET stage=?,home=?,away=?,cutoff=?
     WHERE m.id=? AND (
      (m.stage=? AND lower(m.home)=lower(?) AND lower(m.away)=lower(?))
      OR (m.result IS NULL AND NOT EXISTS (SELECT 1 FROM picks WHERE match_id=m.id))
     )
    `).bind(data.stage,home,away,kickoff-600000,data.id,data.stage,home,away).run();
    return updated.meta.changes?send({ok:true}):send({
     error:'El partido no existe o ya tiene pronósticos o resultado. En ese caso solo puedes corregir mayúsculas o editar el horario.'
    },409);
   }
   await db.prepare('INSERT INTO matches(stage,home,away,cutoff) VALUES (?,?,?,?)').bind(data.stage,home,away,kickoff-600000).run();
   return send({ok:true});
  }
  if(path==='/api/result'){
   if(!Number.isSafeInteger(data.id)||!valid(data.result))return send({error:'Resultado inválido.'},400);
   const result=await db.prepare('UPDATE matches SET result=? WHERE id=?').bind(data.result,data.id).run();
   return result.meta.changes?send({ok:true}):send({error:'Partido inexistente.'},404);
  }
  if(path==='/api/register'){
   const name=typeof data.name==='string'?data.name.trim().replace(/\s+/g,' '):'';
   if(name.length<2||name.length>60)return send({error:'Escribe un nombre de 2 a 60 caracteres.'},400);
   const code=crypto.randomUUID().replaceAll('-','').toUpperCase();
   const key=name.toLowerCase();
   const created=await db.prepare('INSERT INTO players(name,token,registration_key) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM players WHERE lower(name)=?) ON CONFLICT (registration_key) DO NOTHING').bind(name,await hash(code),key,key).run();
   if(!created.meta.changes)return send({error:'Ya existe un participante con ese nombre. Usa su código original o distingue los nombres completos.'},409);
   return send({name,code});
  }
  const code=typeof data.code==='string'?data.code.trim().toUpperCase():'';
  if(!/^[0-9A-F]{32}$/.test(code))return send({error:'Escribe el código de participante que te dio el organizador.'},400);
  const player=await db.prepare('SELECT id FROM players WHERE token=?').bind(await hash(code)).first();
  if(!player)return send({error:'Código incorrecto.'},401);
  if(path==='/api/my-picks'){
   const picks=await db.prepare('SELECT match_id,pick FROM picks WHERE player=?').bind(player.id).all();
   return send({picks:picks.results});
  }
  if(!stages.includes(data.stage)||!data.picks||typeof data.picks!=='object'||Array.isArray(data.picks))return send({error:'Revisa tus pronósticos.'},400);
  const picks=Object.entries(data.picks);
  if(!picks.length||picks.some(([id,pick])=>!/^\d+$/.test(id)||!valid(pick)))return send({error:'Completa todos los pronósticos de la ronda.'},400);
  const result=await db.prepare(`
   WITH round_matches AS (SELECT id,cutoff,result FROM matches WHERE stage=?),
   submitted AS (SELECT key::integer AS id,value AS pick FROM jsonb_each_text(?::jsonb))
   INSERT INTO picks(player,match_id,pick)
   SELECT ?,m.id,s.pick FROM round_matches m JOIN submitted s ON s.id=m.id
   WHERE (SELECT COUNT(*) FROM round_matches)=(SELECT COUNT(*) FROM submitted)
     AND (SELECT COUNT(*) FROM round_matches)=(SELECT COUNT(*) FROM round_matches JOIN submitted USING(id))
     AND (SELECT MIN(cutoff) FROM round_matches)>EXTRACT(EPOCH FROM clock_timestamp())*1000
     AND NOT EXISTS(SELECT 1 FROM round_matches WHERE result IS NOT NULL)
   ON CONFLICT(player,match_id) DO UPDATE SET pick=excluded.pick
  `).bind(data.stage,JSON.stringify(data.picks),player.id).run();
  return result.meta.changes===picks.length?send({ok:true}):send({error:'La ronda cerró o cambió la lista de partidos. Actualiza la página.'},409);
 }catch(error){console.error(error.message);return send({error:'Ocurrió un error. Intenta de nuevo.'},500)}
}};

import http from 'node:http';
import pg from 'pg';
if (!process.env.DATABASE_URL || !process.env.ADMIN_PASSWORD) throw Error('Missing runtime configuration');
pg.types.setTypeParser(20, Number);
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,max:4});
await pool.query(SCHEMA);
await pool.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS registration_key TEXT');
await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS players_registration_key ON players(registration_key)');
const DB = {
 prepare(statement) {
  let count=0;
  const query=statement.replace(/\?/g,()=>'$'+(++count));
  const bind=(...params)=>({
   async run(){const result=await pool.query(query,params);return {meta:{changes:result.rowCount}};},
   async first(){return (await pool.query(query,params)).rows[0];},
   async all(){return {results:(await pool.query(query,params)).rows};}
  });
  return {...bind(),bind};
 },
 batch(items){return Promise.all(items.map(item=>item.all()));}
};
http.createServer(async (req,res)=>{
 try{
  const method=req.method;
  let body;
  if(method==='POST'){
   const chunks=[];let total=0;
   for await(const chunk of req){total+=chunk.length;if(total>4096){res.writeHead(413);res.end();return;}chunks.push(chunk);}
   body=Buffer.concat(chunks);
  }
  const response=await worker.fetch(new Request(new URL(req.url,'http://localhost'),{method,headers:req.headers,body}),{DB,ADMIN_PASSWORD:process.env.ADMIN_PASSWORD});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error(error.message);res.writeHead(500);res.end();}
}).listen(Number(process.env.PORT||10000),'0.0.0.0');
