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
    body:JSON.stringify({tournamentName:'Test Custom Final Loser '+Date.now(), gameName:'Test Game', format:'CUSTOM', maxParticipants:2})
  });
  return r.json();
}

console.log('Creating tournament...');
const t = await createTournament();
console.log('Tournament:', t.id);

const schema = {
  nodes: [
    {id:'s1',type:'start',position:{x:50,y:100},data:{label:'P1'}},
    {id:'s2',type:'start',position:{x:50,y:200},data:{label:'P2'}},
    {id:'m1',type:'match',position:{x:300,y:150},data:{label:'Match',round:1}},
    {id:'f1',type:'final',position:{x:600,y:150},data:{label:'Winner'}},
  ],
  edges: [
    {id:'e1',source:'s1',target:'m1',sourceHandle:'output',targetHandle:'input-1',type:'smoothstep',data:{edgeType:'participant'}},
    {id:'e2',source:'s2',target:'m1',sourceHandle:'output',targetHandle:'input-2',type:'smoothstep',data:{edgeType:'participant'}},
    {id:'e3',source:'m1',target:'f1',sourceHandle:'loser',targetHandle:'input',type:'smoothstep',data:{edgeType:'loser'}},
  ]
};

console.log('Saving schema...');
await fetch(`${API}/api/tournaments/${t.id}/custom-schema`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken},
  body: JSON.stringify(schema)
});

console.log('Opening registration...');
await fetch(`${API}/api/tournaments/${t.id}/open-registration`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken}
});

// create guest user and join
const regR = await fetch(`${API}/api/auth/register`, {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({login:'testloser_'+Date.now(), email:'test@example.com', password:'test123'})
});
const regData = await regR.json();
const guestToken = regData.accessToken;

console.log('Joining tournament with admin and guest...');
await fetch(`${API}/api/tournaments/${t.id}/join`, { method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken} });
await fetch(`${API}/api/tournaments/${t.id}/join`, { method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+guestToken} });

console.log('Finalizing tournament...');
await fetch(`${API}/api/tournaments/${t.id}/custom-finalize`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken}
});

// fetch matches
const matchesR = await fetch(`${API}/api/tournaments/${t.id}/matches`, {
  headers: { Authorization: 'Bearer '+accessToken }
});
const matches = await matchesR.json();
console.log('Matches', matches);
const match = matches[0];

console.log('Setting match result (admin wins, so loser should win final)...');
await fetch(`${API}/api/matches/${match.id}/result`, {
  method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+accessToken},
  body: JSON.stringify({ player1Score: 5, player2Score: 0, isFinal: true })
});

const partsR = await fetch(`${API}/api/tournaments/${t.id}/participants`, {
  headers: { Authorization: 'Bearer '+accessToken }
});
const parts = await partsR.json();
console.log('Participants finalResult:', parts.map(p=>({user:p.user.login, finalResult:p.finalResult})));

console.log('Done');
