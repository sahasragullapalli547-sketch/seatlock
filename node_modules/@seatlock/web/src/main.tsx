import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import "./style.css";

const queryClient = new QueryClient();
const api = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
type DemoConfig = { hackathon_id: string; team_id: string; user_id: string; leader_id: string };
type RaceResult = {
  runId: string;
  timeline: Array<{ userNumber: number; status: number; message: string }>;
  winnerCount: number;
  conflictCount: number;
  memberCount: number;
  auditCount: number;
  invariantPassed: boolean;
};

function RaceLab() {
  const [result, setResult] = React.useState<RaceResult | null>(null);
  const [visible, setVisible] = React.useState(0);
  const [running, setRunning] = React.useState(false);

  async function fireRace() {
    setRunning(true);
    setResult(null);
    setVisible(0);
    const response = await fetch(`${api}/demo/race`, { method: "POST" });
    const next = await response.json() as RaceResult;
    setResult(next);
    setRunning(false);
    next.timeline.forEach((_event, index) => {
      window.setTimeout(() => setVisible(index + 1), index * 35);
    });
  }

  const shown = result?.timeline.slice(0, visible) ?? [];
  return <main>
    <p className="eyebrow">SEATLOCK / PROOF CENTER</p>
    <h1>Race <em>Lab.</em></h1>
    <p className="lede">A sandbox team has exactly one open seat. Fifty synthetic users race through separate PostgreSQL transactions. No production data is touched.</p>
    <section className="lab-panel" aria-live="polite">
      <div className="lab-heading"><div><p className="eyebrow">LIVE CONCURRENCY TEST</p><h2>One seat. Fifty attempts.</h2></div><button onClick={fireRace} disabled={running}>{running ? "Running…" : "Fire 50 joins"}</button></div>
      {running && <p className="status">Creating an isolated sandbox and releasing the barrier…</p>}
      {shown.length > 0 && <div className="timeline">{shown.map((event) => <div className={`event ${event.status === 200 ? "winner" : "conflict"}`} key={event.userNumber}><span>User {String(event.userNumber).padStart(2, "0")}</span><strong>{event.status}</strong><span>{event.message}</span></div>)}</div>}
      {result && visible >= result.timeline.length && <div className={`result ${result.invariantPassed ? "passed" : "failed"}`}><strong>{result.invariantPassed ? "✓ PROOF PASSED" : "✕ PROOF FAILED"}</strong><span>{result.winnerCount} winner · {result.conflictCount} conflicts · member_count {result.memberCount} · {result.auditCount} join audit</span></div>}
    </section>
    <a className="lab" href="/">← Back to board</a>
  </main>;
}

function TeamPage({ config }: { config: DemoConfig }) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["team", config.team_id],
    queryFn: async () => (await fetch(`${api}/demo/team/${config.team_id}`)).json() as Promise<{ team: { id: string; name: string; member_count: number; max_size: number }; members: Array<{ user_id: string; email: string; role: string; joined_at: string }>; requests: Array<{ id: string; email: string; skills: string[] }> }>
  });
  const decision = useMutation({
    mutationFn: async ({ requestId, accept }: { requestId: string; accept: boolean }) => {
      const response = await fetch(`${api}/join-requests/${requestId}/decision`, { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": config.leader_id }, body: JSON.stringify({ accept }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Decision failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team", config.team_id] })
  });
  const audit = useQuery({
    queryKey: ["audit", config.team_id],
    queryFn: async () => (await fetch(`${api}/teams/${config.team_id}/audit`, { headers: { "x-user-id": config.leader_id } })).json() as Promise<Array<{ action: string; ts: string; target_user_id: string }>>
  });
  const invite = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${api}/teams/${config.team_id}/invites`, { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": config.leader_id }, body: JSON.stringify({ maxUses: null }) });
      return response.json() as Promise<{ code?: string; expiresAt?: string; error?: string }>;
    }
  });
  const suggestions = useQuery({
    queryKey: ["suggestions", config.team_id],
    queryFn: async () => (await fetch(`${api}/teams/${config.team_id}/suggestions`, { headers: { "x-user-id": config.leader_id } })).json() as Promise<{ candidates: Array<{ email: string; score: number; explanation: string }> }>
  });
  return <main><nav className="topnav"><a href="/">← Board</a><a href="/lab">Race Lab</a></nav><p className="eyebrow">TEAM CONTROL ROOM</p><h1>{detail.data?.team.name ?? "Team"}</h1>{detail.data && <p className="lede">{detail.data.team.member_count} / {detail.data.team.max_size} seats filled · database-backed team state</p>}<section><h2>Invite teammates</h2><button onClick={() => invite.mutate()}>Generate 24h invite</button>{invite.data?.code && <p className="invite-code"><strong>{invite.data.code}</strong> · expires {new Date(invite.data.expiresAt!).toLocaleString()}</p>}</section><section><h2>Members</h2>{detail.data?.members.map((member) => <article className="card compact" key={member.user_id}><div><strong>{member.email}</strong><span>{member.role}</span></div><small>{new Date(member.joined_at).toLocaleString()}</small></article>)}</section><section><h2>Pending requests</h2>{detail.data?.requests.length ? detail.data.requests.map((request) => <article className="card compact" key={request.id}><div><strong>{request.email}</strong><span>{request.skills?.join(", ") || "No skills listed"}</span></div><div className="actions"><button onClick={() => decision.mutate({ requestId: request.id, accept: true })}>Accept</button><button className="secondary" onClick={() => decision.mutate({ requestId: request.id, accept: false })}>Decline</button></div></article>) : <p className="muted">No pending requests.</p>}</section><section><h2>Suggestions</h2>{suggestions.data?.candidates.slice(0, 5).map((candidate) => <article className="card compact" key={candidate.email}><div><strong>{candidate.email}</strong><span>{candidate.explanation}</span></div><strong>{candidate.score}/100</strong></article>)}</section><section><h2>Audit trail</h2>{audit.data?.map((row, index) => <div className="audit-row" key={`${row.ts}-${index}`}><strong>{row.action}</strong><span>{new Date(row.ts).toLocaleString()}</span></div>)}</section></main>;
}

function Board() {
  const queryClient = useQueryClient();
  const config = useQuery({
    queryKey: ["demo-config"],
    queryFn: async () => {
      const response = await fetch(`${api}/demo/config`);
      if (!response.ok) throw new Error("Run npm run seed in the API project first.");
      return response.json() as Promise<DemoConfig>;
    }
  });
  const demo = config.data;
  const teams = useQuery({
    queryKey: ["board", demo?.hackathon_id],
    enabled: Boolean(demo),
    queryFn: async () => (await fetch(`${api}/board?hackathonId=${demo!.hackathon_id}`)).json() as Promise<{ items: Array<{ id: string; name: string; member_count: number; max_size: number }> }>
  });
  const request = useMutation({
    mutationFn: async (teamId: string) => {
      const response = await fetch(`${api}/teams/${teamId}/requests`, { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": demo!.user_id, "idempotency-key": crypto.randomUUID() }, body: "{}" });
      const body = await response.json() as { requestId?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Request failed");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["board"] })
  });
  React.useEffect(() => {
    if (!demo) return;
    const stream = new EventSource(`${api}/events/board`);
    stream.onmessage = () => queryClient.invalidateQueries({ queryKey: ["board"] });
    return () => stream.close();
  }, [demo, queryClient]);
  return <main><nav className="topnav"><strong>SEATLOCK</strong><span>Demo workspace</span><a href="/lab">Race Lab ↗</a></nav><p className="eyebrow">RACE-PROOF TEAM FORMATION</p><h1>Find your people.<br /><em>Keep every seat honest.</em></h1><p className="lede">A live board where every seat change is transactional, auditable, and safe under a crowd of simultaneous clicks.</p><section aria-live="polite"><div className="section-head"><h2>Open teams</h2>{demo && <a href={`/team/${demo.team_id}`}>Open team control room →</a>}</div>{config.isLoading && <p>Loading the seeded demo…</p>}{config.error && <p role="alert">{(config.error as Error).message}</p>}{teams.data?.items.map((team) => <article className="card" key={team.id}><div><h3>{team.name}</h3><span>{team.member_count} / {team.max_size} seats filled</span></div><button disabled={request.isPending} onClick={() => request.mutate(team.id)}>{request.isPending ? "Sending…" : "Request a seat"}</button></article>)}{request.error && <p role="alert">{(request.error as Error).message}</p>}{request.isSuccess && <p role="status">Join request created. Open the team control room to accept it.</p>}</section><div className="feature-grid"><div><strong>Postgres locked</strong><span>Capacity is protected at the database boundary.</span></div><div><strong>Audit included</strong><span>Every state change leaves a tamper-evident trail.</span></div></div></main>;
}

function App() {
  const config = useQuery({ queryKey: ["demo-config"], queryFn: async () => (await fetch(`${api}/demo/config`)).json() as Promise<DemoConfig> });
  const path = window.location.pathname;
  return <><a className="skip" href="#main">Skip to content</a><div id="main">{path === "/lab" ? <RaceLab /> : path.startsWith("/team/") && config.data ? <TeamPage config={config.data} /> : <Board />}</div></>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
