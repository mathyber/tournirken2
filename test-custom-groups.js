// Test custom tournament with groups display
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
    body:JSON.stringify({tournamentName:'Test Custom Groups '+Date.now(), gameName:'Test Game', format:'CUSTOM', maxParticipants:4})
  });
  return r.json();
}

console.log('\n=== Creating CUSTOM tournament with groups ===');
const t = await createTournament();
console.log('Tournament:', t.id, t.format);

// Schema with group -> match -> final
const schema = {
  nodes: [
    {id:'s1',type:'start',position:{x:50,y:100},data:{label:'P1'}},
    {id:'s2',type:'start',position:{x:50,y:200},data:{label:'P2'}},
    {id:'s3',type:'start',position:{x:50,y:300},data:{label:'P3'}},
    {id:'s4',type:'start',position:{x:50,y:400},data:{label:'P4'}},
    {id:'g1',type:'group',position:{x:200,y:200},data:{label:'Group A', size:4}},
    {id:'m1',type:'match',position:{x:500,y:200},data:{label:'Final Match', round:1}},
    {id:'f1',type:'final',position:{x:700,y:200},data:{label:'Winner'}},
  ],
  edges: [
    {id:'e1',source:'s1',target:'g1',sourceHandle:'output',targetHandle:'input-1',type:'smoothstep',data:{edgeType:'participant'}},
    {id:'e2',source:'s2',target:'g1',sourceHandle:'output',targetHandle:'input-2',type:'smoothstep',data:{edgeType:'participant'}},
    {id:'e3',source:'s3',target:'g1',sourceHandle:'output',targetHandle:'input-3',type:'smoothstep',data:{edgeType:'participant'}},
    {id:'e4',source:'s4',target:'g1',sourceHandle:'output',targetHandle:'input-4',type:'smoothstep',data:{edgeType:'participant'}},
    {id:'e5',source:'g1',target:'m1',sourceHandle:'rank-1',targetHandle:'input-1',type:'smoothstep',data:{edgeType:'winner'}},
    {id:'e6',source:'g1',target:'m1',sourceHandle:'rank-2',targetHandle:'input-2',type:'smoothstep',data:{edgeType:'winner'}},
    {id:'e7',source:'m1',target:'f1',sourceHandle:'winner',targetHandle:'input',type:'smoothstep',data:{edgeType:'winner'}},
  ]
};

console.log('Saving schema...');
await fetch(`${API}/api/tournaments/${t.id}/custom-schema`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken},
  body: JSON.stringify(schema)
});

// Open registration
console.log('Opening registration...');
await fetch(`${API}/api/tournaments/${t.id}/open-registration`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken}
});

// Join users
const users = ['admin', 'testuser1', 'testuser2', 'testuser3'];
for (const login of users) {
  try {
    const loginR = await fetch(`${API}/api/auth/login`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({login, password: login+'123'})
    });
    const {accessToken: userToken} = await loginR.json();
    if (userToken) {
      await fetch(`${API}/api/tournaments/${t.id}/join`, {
        method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+userToken}
      });
    }
  } catch (e) {}
}

// Finalize
console.log('Finalizing tournament...');
const finR = await fetch(`${API}/api/tournaments/${t.id}/custom-finalize`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken}
});
console.log('Finalize status:', finR.status);

// Check groups
console.log('Checking groups...');
const groupsR = await fetch(`${API}/api/tournaments/${t.id}/groups`, {
  headers:{Authorization:'Bearer '+accessToken}
});
const groups = await groupsR.json();
console.log('Groups found:', groups.length);
if (groups.length > 0) {
  console.log('Group name:', groups[0].name);
  console.log('Group participants:', groups[0].participants.length);
  console.log('Group matches:', groups[0].matches.length);
  console.log('SUCCESS: Groups are present in CUSTOM tournament');
} else {
  console.log('FAIL: No groups found');
}

console.log('Test completed');