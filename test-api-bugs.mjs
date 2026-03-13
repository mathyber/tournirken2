// Test API edge cases for CUSTOM tournament format
const API = 'http://localhost:3001';

const loginR = await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({login:'admin', password:'admin123'})
});
const {accessToken} = await loginR.json();
console.log('Admin token obtained:', !!accessToken);

async function createTournament() {
  const r = await fetch(`${API}/api/tournaments`, {
    method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken},
    body:JSON.stringify({tournamentName:'QA Test '+Date.now(), gameName:'Test Game', format:'CUSTOM', maxParticipants:4})
  });
  return r.json();
}

// =====================
// TEST A: Empty schema bypass
// =====================
console.log('\n=== TEST A: Empty schema can be saved and finalized ===');
const emptyT = await createTournament();
console.log('Tournament:', emptyT.id, emptyT.format);

const emptySave = await fetch(`${API}/api/tournaments/${emptyT.id}/custom-schema`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken},
  body: JSON.stringify({nodes:[], edges:[]})
});
console.log('Empty schema save status:', emptySave.status);

const emptyFin = await fetch(`${API}/api/tournaments/${emptyT.id}/custom-finalize`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken}
});
const emptyFinBody = await emptyFin.json();
console.log('Empty schema finalize:', emptyFin.status, JSON.stringify(emptyFinBody));

if (emptyFin.status === 200) {
  console.log('[BUG/HIGH] Backend allows finalizing empty schema - tournament becomes ACTIVE with 0 matches!');
} else {
  console.log('Empty schema finalize correctly rejected:', JSON.stringify(emptyFinBody));
}

// =====================
// TEST B: Winner edge type bug (smoothstep vs winner)
// =====================
console.log('\n=== TEST B: Edge type bug - match-to-match progression ===');
const multiT = await createTournament();
console.log('Multi-round tournament:', multiT.id);

const multiSchema = {
  nodes:[
    {id:'s1',type:'start',position:{x:50,y:100},data:{label:'P1'}},
    {id:'s2',type:'start',position:{x:50,y:200},data:{label:'P2'}},
    {id:'s3',type:'start',position:{x:50,y:300},data:{label:'P3'}},
    {id:'m1',type:'match',position:{x:300,y:150},data:{label:'Semi',round:1}},
    {id:'m2',type:'match',position:{x:600,y:250},data:{label:'Final Match',round:2}},
    {id:'f1',type:'final',position:{x:900,y:250},data:{label:'Winner'}},
  ],
  edges:[
    {id:'e1',source:'s1',target:'m1',sourceHandle:'output',targetHandle:'input-1',type:'smoothstep',data:{edgeType:'participant'}},
    {id:'e2',source:'s2',target:'m1',sourceHandle:'output',targetHandle:'input-2',type:'smoothstep',data:{edgeType:'participant'}},
    {id:'e3',source:'s3',target:'m2',sourceHandle:'output',targetHandle:'input-1',type:'smoothstep',data:{edgeType:'participant'}},
    // Winner edges: frontend stores type='smoothstep' + data.edgeType='winner'
    // Backend at line 579 checks: edges.filter(e => e.type === 'winner' || e.type === 'loser')
    // This FAILS because e.type is 'smoothstep'
    {id:'e4',source:'m1',target:'m2',sourceHandle:'winner',targetHandle:'input-2',type:'smoothstep',data:{edgeType:'winner'}},
    {id:'e5',source:'m2',target:'f1',sourceHandle:'winner',targetHandle:'input',type:'smoothstep',data:{edgeType:'winner'}},
  ]
};

await fetch(`${API}/api/tournaments/${multiT.id}/custom-schema`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken},
  body: JSON.stringify(multiSchema)
});

const fin2R = await fetch(`${API}/api/tournaments/${multiT.id}/custom-finalize`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken}
});
const fin2 = await fin2R.json();
console.log('Multi finalize:', fin2R.status, JSON.stringify(fin2));

const gridR = await fetch(`${API}/api/tournaments/${multiT.id}/grid`, {
  headers:{Authorization:'Bearer '+accessToken}
});
const grid = await gridR.json();
const matches = grid.matches || [];
console.log('Matches created:', matches.length);
for (const m of matches) {
  console.log('  id='+m.id+' round='+m.roundNumber+' nextMatchId='+m.nextMatchId+' p1='+m.player1?.user?.login+' p2='+m.player2?.user?.login);
}
const semiMatch = matches.find(m => m.roundNumber === 1);
if (semiMatch) {
  if (semiMatch.nextMatchId === null) {
    console.log('[BUG/CRITICAL] Semi-final has nextMatchId=null! Winner edge type bug CONFIRMED.');
    console.log('  Root cause: finalize reads e.type but frontend saves type="smoothstep" with data.edgeType="winner"');
  } else {
    console.log('nextMatchId correctly set:', semiMatch.nextMatchId, '(no bug or already fixed)');
  }
}

// =====================
// TEST C: Stage.findUnique by name - does it work on 2nd finalize?
// =====================
console.log('\n=== TEST C: Stage.findUnique by name (2nd tournament finalize) ===');
const stageT = await createTournament();
const stageSchema = {
  nodes:[
    {id:'s1',type:'start',position:{x:50,y:100},data:{label:'P1'}},
    {id:'s2',type:'start',position:{x:50,y:200},data:{label:'P2'}},
    {id:'m1',type:'match',position:{x:300,y:150},data:{label:'M',round:1}},
    {id:'f1',type:'final',position:{x:600,y:150},data:{label:'F'}},
  ],
  edges:[
    {id:'e1',source:'s1',target:'m1',sourceHandle:'output',targetHandle:'input-1',type:'smoothstep',data:{edgeType:'participant'}},
    {id:'e2',source:'s2',target:'m1',sourceHandle:'output',targetHandle:'input-2',type:'smoothstep',data:{edgeType:'participant'}},
    {id:'e3',source:'m1',target:'f1',sourceHandle:'winner',targetHandle:'input',type:'smoothstep',data:{edgeType:'winner'}},
  ]
};
await fetch(`${API}/api/tournaments/${stageT.id}/custom-schema`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken},
  body: JSON.stringify(stageSchema)
});
const stageFinR = await fetch(`${API}/api/tournaments/${stageT.id}/custom-finalize`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken}
});
const stageFin = await stageFinR.json();
console.log('Stage test finalize (2nd CUSTOM tournament):', stageFinR.status, JSON.stringify(stageFin));
if (stageFinR.status !== 200) {
  console.log('[BUG/CRITICAL] Finalize fails! Likely Stage.findUnique by non-@unique name field');
} else {
  console.log('Stage test passed (findUnique works or Stage.name is @unique)');
}

// =====================
// TEST D: Non-organizer access to API endpoints
// =====================
console.log('\n=== TEST D: Non-organizer access ===');
const login2 = 'qatest_' + Date.now();
const regR = await fetch(`${API}/api/auth/register`, {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({login: login2, email: login2+'@test.com', password:'test1234'})
});
const regData = await regR.json();
const userToken = regData.accessToken;
console.log('Test user registered:', regR.status, 'token:', !!userToken);

if (userToken) {
  const nonOrgSchemaResp = await fetch(`${API}/api/tournaments/${multiT.id}/custom-schema`, {
    method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+userToken},
    body: JSON.stringify({nodes:[], edges:[]})
  });
  console.log('Non-organizer schema WRITE:', nonOrgSchemaResp.status);
  if (nonOrgSchemaResp.status === 200) {
    console.log('[BUG/CRITICAL] Non-organizer can overwrite custom schema!');
  } else {
    const errBody = await nonOrgSchemaResp.json();
    console.log('Non-organizer blocked OK:', JSON.stringify(errBody));
  }

  const nonOrgFinalResp = await fetch(`${API}/api/tournaments/${multiT.id}/custom-finalize`, {
    method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+userToken}
  });
  console.log('Non-organizer finalize:', nonOrgFinalResp.status);
  if (nonOrgFinalResp.status === 200) {
    console.log('[BUG/CRITICAL] Non-organizer can finalize tournament!');
  } else {
    console.log('Non-organizer finalize blocked OK');
  }
}

// =====================
// TEST E: Anon GET /custom-schema (no auth)
// =====================
console.log('\n=== TEST E: Anonymous GET custom-schema ===');
const anonGetR = await fetch(`${API}/api/tournaments/${multiT.id}/custom-schema`);
console.log('Anon GET custom-schema:', anonGetR.status);
if (anonGetR.status === 200) {
  const anonData = await anonGetR.json();
  console.log('Schema visible to anon, schema present:', !!anonData.customSchema);
  console.log('[INFO] GET /custom-schema is a public endpoint (no auth required) - may be intentional');
}

// =====================
// TEST F: Double finalize protection
// =====================
console.log('\n=== TEST F: Double finalize prevention ===');
const doubleFinR = await fetch(`${API}/api/tournaments/${stageT.id}/custom-finalize`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken}
});
const doubleFin = await doubleFinR.json();
console.log('Double finalize:', doubleFinR.status, JSON.stringify(doubleFin));
if (doubleFinR.status === 200) {
  console.log('[BUG/HIGH] Double finalize succeeds - duplicate matches created!');
} else {
  console.log('Double finalize correctly blocked');
}

// =====================
// TEST G: Save schema with invalid JSON/data
// =====================
console.log('\n=== TEST G: Malformed schema body ===');
const malformedT = await createTournament();
const malformedR = await fetch(`${API}/api/tournaments/${malformedT.id}/custom-schema`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken},
  body: JSON.stringify({nodes: 'not-an-array', edges: null})
});
console.log('Malformed schema (nodes=string):', malformedR.status);
if (malformedR.status === 200) {
  console.log('[BUG/MEDIUM] Backend accepts malformed schema (nodes not array)');
} else {
  const errBody = await malformedR.json();
  console.log('Malformed schema rejected:', JSON.stringify(errBody));
}

// TEST H: Schema saved for non-CUSTOM format
console.log('\n=== TEST H: Save schema to non-CUSTOM tournament ===');
const singleT = await fetch(`${API}/api/tournaments`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken},
  body:JSON.stringify({tournamentName:'QA Single '+Date.now(), gameName:'Test', format:'SINGLE_ELIMINATION', maxParticipants:4})
});
const singleData = await singleT.json();
console.log('Single elim tournament:', singleData.id, singleData.format);

const singleSchemaR = await fetch(`${API}/api/tournaments/${singleData.id}/custom-schema`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken},
  body: JSON.stringify({nodes:[], edges:[]})
});
console.log('Save schema to SINGLE_ELIMINATION tournament:', singleSchemaR.status);
if (singleSchemaR.status === 200) {
  console.log('[BUG/MEDIUM] Can save custom schema to non-CUSTOM format tournament');
} else {
  const errBody = await singleSchemaR.json();
  console.log('Non-CUSTOM format rejected correctly:', JSON.stringify(errBody));
}

console.log('\n=== ALL API TESTS DONE ===');
