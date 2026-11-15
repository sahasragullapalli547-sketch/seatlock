import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import "./style.css";
const queryClient = new QueryClient();
const api = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
function RaceLab() {
    const [result, setResult] = React.useState(null);
    const [visible, setVisible] = React.useState(0);
    const [running, setRunning] = React.useState(false);
    async function fireRace() {
        setRunning(true);
        setResult(null);
        setVisible(0);
        const response = await fetch(`${api}/demo/race`, { method: "POST" });
        const next = await response.json();
        setResult(next);
        setRunning(false);
        next.timeline.forEach((_event, index) => {
            window.setTimeout(() => setVisible(index + 1), index * 35);
        });
    }
    const shown = result?.timeline.slice(0, visible) ?? [];
    return _jsxs("main", { children: [_jsx("p", { className: "eyebrow", children: "SEATLOCK / PROOF CENTER" }), _jsxs("h1", { children: ["Race ", _jsx("em", { children: "Lab." })] }), _jsx("p", { className: "lede", children: "A sandbox team has exactly one open seat. Fifty synthetic users race through separate PostgreSQL transactions. No production data is touched." }), _jsxs("section", { className: "lab-panel", "aria-live": "polite", children: [_jsxs("div", { className: "lab-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "LIVE CONCURRENCY TEST" }), _jsx("h2", { children: "One seat. Fifty attempts." })] }), _jsx("button", { onClick: fireRace, disabled: running, children: running ? "Running…" : "Fire 50 joins" })] }), running && _jsx("p", { className: "status", children: "Creating an isolated sandbox and releasing the barrier\u2026" }), shown.length > 0 && _jsx("div", { className: "timeline", children: shown.map((event) => _jsxs("div", { className: `event ${event.status === 200 ? "winner" : "conflict"}`, children: [_jsxs("span", { children: ["User ", String(event.userNumber).padStart(2, "0")] }), _jsx("strong", { children: event.status }), _jsx("span", { children: event.message })] }, event.userNumber)) }), result && visible >= result.timeline.length && _jsxs("div", { className: `result ${result.invariantPassed ? "passed" : "failed"}`, children: [_jsx("strong", { children: result.invariantPassed ? "✓ PROOF PASSED" : "✕ PROOF FAILED" }), _jsxs("span", { children: [result.winnerCount, " winner \u00B7 ", result.conflictCount, " conflicts \u00B7 member_count ", result.memberCount, " \u00B7 ", result.auditCount, " join audit"] })] })] }), _jsx("a", { className: "lab", href: "/", children: "\u2190 Back to board" })] });
}
function TeamPage({ config }) {
    const queryClient = useQueryClient();
    const detail = useQuery({
        queryKey: ["team", config.team_id],
        queryFn: async () => (await fetch(`${api}/demo/team/${config.team_id}`)).json()
    });
    const decision = useMutation({
        mutationFn: async ({ requestId, accept }) => {
            const response = await fetch(`${api}/join-requests/${requestId}/decision`, { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": config.leader_id }, body: JSON.stringify({ accept }) });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "Decision failed");
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team", config.team_id] })
    });
    const audit = useQuery({
        queryKey: ["audit", config.team_id],
        queryFn: async () => (await fetch(`${api}/teams/${config.team_id}/audit`, { headers: { "x-user-id": config.leader_id } })).json()
    });
    const invite = useMutation({
        mutationFn: async () => {
            const response = await fetch(`${api}/teams/${config.team_id}/invites`, { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": config.leader_id }, body: JSON.stringify({ maxUses: null }) });
            return response.json();
        }
    });
    const suggestions = useQuery({
        queryKey: ["suggestions", config.team_id],
        queryFn: async () => (await fetch(`${api}/teams/${config.team_id}/suggestions`, { headers: { "x-user-id": config.leader_id } })).json()
    });
    return _jsxs("main", { children: [_jsxs("nav", { className: "topnav", children: [_jsx("a", { href: "/", children: "\u2190 Board" }), _jsx("a", { href: "/lab", children: "Race Lab" })] }), _jsx("p", { className: "eyebrow", children: "TEAM CONTROL ROOM" }), _jsx("h1", { children: detail.data?.team.name ?? "Team" }), detail.data && _jsxs("p", { className: "lede", children: [detail.data.team.member_count, " / ", detail.data.team.max_size, " seats filled \u00B7 database-backed team state"] }), _jsxs("section", { children: [_jsx("h2", { children: "Invite teammates" }), _jsx("button", { onClick: () => invite.mutate(), children: "Generate 24h invite" }), invite.data?.code && _jsxs("p", { className: "invite-code", children: [_jsx("strong", { children: invite.data.code }), " \u00B7 expires ", new Date(invite.data.expiresAt).toLocaleString()] })] }), _jsxs("section", { children: [_jsx("h2", { children: "Members" }), detail.data?.members.map((member) => _jsxs("article", { className: "card compact", children: [_jsxs("div", { children: [_jsx("strong", { children: member.email }), _jsx("span", { children: member.role })] }), _jsx("small", { children: new Date(member.joined_at).toLocaleString() })] }, member.user_id))] }), _jsxs("section", { children: [_jsx("h2", { children: "Pending requests" }), detail.data?.requests.length ? detail.data.requests.map((request) => _jsxs("article", { className: "card compact", children: [_jsxs("div", { children: [_jsx("strong", { children: request.email }), _jsx("span", { children: request.skills?.join(", ") || "No skills listed" })] }), _jsxs("div", { className: "actions", children: [_jsx("button", { onClick: () => decision.mutate({ requestId: request.id, accept: true }), children: "Accept" }), _jsx("button", { className: "secondary", onClick: () => decision.mutate({ requestId: request.id, accept: false }), children: "Decline" })] })] }, request.id)) : _jsx("p", { className: "muted", children: "No pending requests." })] }), _jsxs("section", { children: [_jsx("h2", { children: "Suggestions" }), suggestions.data?.candidates.slice(0, 5).map((candidate) => _jsxs("article", { className: "card compact", children: [_jsxs("div", { children: [_jsx("strong", { children: candidate.email }), _jsx("span", { children: candidate.explanation })] }), _jsxs("strong", { children: [candidate.score, "/100"] })] }, candidate.email))] }), _jsxs("section", { children: [_jsx("h2", { children: "Audit trail" }), audit.data?.map((row, index) => _jsxs("div", { className: "audit-row", children: [_jsx("strong", { children: row.action }), _jsx("span", { children: new Date(row.ts).toLocaleString() })] }, `${row.ts}-${index}`))] })] });
}
function Board() {
    const queryClient = useQueryClient();
    const config = useQuery({
        queryKey: ["demo-config"],
        queryFn: async () => {
            const response = await fetch(`${api}/demo/config`);
            if (!response.ok)
                throw new Error("Run npm run seed in the API project first.");
            return response.json();
        }
    });
    const demo = config.data;
    const teams = useQuery({
        queryKey: ["board", demo?.hackathon_id],
        enabled: Boolean(demo),
        queryFn: async () => (await fetch(`${api}/board?hackathonId=${demo.hackathon_id}`)).json()
    });
    const request = useMutation({
        mutationFn: async (teamId) => {
            const response = await fetch(`${api}/teams/${teamId}/requests`, { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": demo.user_id, "idempotency-key": crypto.randomUUID() }, body: "{}" });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "Request failed");
            return body;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["board"] })
    });
    React.useEffect(() => {
        if (!demo)
            return;
        const stream = new EventSource(`${api}/events/board`);
        stream.onmessage = () => queryClient.invalidateQueries({ queryKey: ["board"] });
        return () => stream.close();
    }, [demo, queryClient]);
    return _jsxs("main", { children: [_jsxs("nav", { className: "topnav", children: [_jsx("strong", { children: "SEATLOCK" }), _jsx("span", { children: "Demo workspace" }), _jsx("a", { href: "/lab", children: "Race Lab \u2197" })] }), _jsx("p", { className: "eyebrow", children: "RACE-PROOF TEAM FORMATION" }), _jsxs("h1", { children: ["Find your people.", _jsx("br", {}), _jsx("em", { children: "Keep every seat honest." })] }), _jsx("p", { className: "lede", children: "A live board where every seat change is transactional, auditable, and safe under a crowd of simultaneous clicks." }), _jsxs("section", { "aria-live": "polite", children: [_jsxs("div", { className: "section-head", children: [_jsx("h2", { children: "Open teams" }), demo && _jsx("a", { href: `/team/${demo.team_id}`, children: "Open team control room \u2192" })] }), config.isLoading && _jsx("p", { children: "Loading the seeded demo\u2026" }), config.error && _jsx("p", { role: "alert", children: config.error.message }), teams.data?.items.map((team) => _jsxs("article", { className: "card", children: [_jsxs("div", { children: [_jsx("h3", { children: team.name }), _jsxs("span", { children: [team.member_count, " / ", team.max_size, " seats filled"] })] }), _jsx("button", { disabled: request.isPending, onClick: () => request.mutate(team.id), children: request.isPending ? "Sending…" : "Request a seat" })] }, team.id)), request.error && _jsx("p", { role: "alert", children: request.error.message }), request.isSuccess && _jsx("p", { role: "status", children: "Join request created. Open the team control room to accept it." })] }), _jsxs("div", { className: "feature-grid", children: [_jsxs("div", { children: [_jsx("strong", { children: "Postgres locked" }), _jsx("span", { children: "Capacity is protected at the database boundary." })] }), _jsxs("div", { children: [_jsx("strong", { children: "Audit included" }), _jsx("span", { children: "Every state change leaves a tamper-evident trail." })] })] })] });
}
function App() {
    const config = useQuery({ queryKey: ["demo-config"], queryFn: async () => (await fetch(`${api}/demo/config`)).json() });
    const path = window.location.pathname;
    return _jsxs(_Fragment, { children: [_jsx("a", { className: "skip", href: "#main", children: "Skip to content" }), _jsx("div", { id: "main", children: path === "/lab" ? _jsx(RaceLab, {}) : path.startsWith("/team/") && config.data ? _jsx(TeamPage, { config: config.data }) : _jsx(Board, {}) })] });
}
createRoot(document.getElementById("root")).render(_jsx(QueryClientProvider, { client: queryClient, children: _jsx(App, {}) }));
