import { neon } from "@neondatabase/serverless";

type Env = { DATABASE_URL: string; CORS_ALLOWED_ORIGIN?: string };
type Sql = any;
type Principal = { ownerKey: string; userId?: string };
type Json = Record<string, unknown>;

const builtInTemplates = [{
  id: "beginner-full-body", kind: "built-in", name: "新手全身", description: "从大肌群开始的全身入门训练",
  tag: "全身 · 约 45 分钟", exerciseIds: ["0662", "0043", "0027", "0361", "0001"],
}];
const recommendations = [
  { id: "chest", name: "胸部", exerciseIds: ["0025", "0662"] }, { id: "back", name: "背部", exerciseIds: ["0027", "0818"] },
  { id: "upper-legs", name: "腿部", exerciseIds: ["0043", "0054"] }, { id: "shoulders", name: "肩部", exerciseIds: ["0361", "0334"] },
  { id: "core", name: "核心", exerciseIds: ["0001", "0464"] },
];

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const error = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
const text = (value: unknown) => typeof value === "string" ? value : "";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
const empty = (status = 204) => new Response(null, { status });
const iso = (value: unknown) => new Date(String(value)).toISOString();
const date = (value: unknown) => String(value).slice(0, 10);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const validGuest = (value: string) => /^[A-Za-z0-9_-]{12,100}$/.test(value);

function headers(request: Request, env: Env) {
  const origin = request.headers.get("Origin");
  const allowed = env.CORS_ALLOWED_ORIGIN;
  return origin && allowed && origin === allowed ? {
    "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Guest-ID",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", Vary: "Origin",
  } : {};
}
function respond(request: Request, env: Env, response: Response) {
  const result = new Response(response.body, response);
  for (const [key, value] of Object.entries(headers(request, env))) result.headers.set(key, value);
  return result;
}
async function body(request: Request): Promise<Json> {
  try { const value = await request.json(); return value && typeof value === "object" ? value as Json : error(400, "请求参数格式无效"); }
  catch { return error(400, "请求参数格式无效"); }
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), item => item.toString(16).padStart(2, "0")).join("");
}
const b64 = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const unb64 = (value: string) => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4)), char => char.charCodeAt(0));
async function passwordHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 }, key, 256);
  return `pbkdf2_sha256$310000$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}
async function passwordMatches(password: string, encoded: string) {
  try {
    const [algorithm, rounds, saltText, digestText] = encoded.split("$");
    if (algorithm !== "pbkdf2_sha256") return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(saltText), iterations: Number(rounds) }, key, 256));
    const expected = unb64(digestText); if (bits.length !== expected.length) return false;
    return bits.every((item, index) => item === expected[index]);
  } catch { return false; }
}
async function principal(sql: Sql, request: Request): Promise<Principal> {
  const authorization = request.headers.get("Authorization");
  if (authorization?.startsWith("Bearer ")) {
    const tokenHash = await sha256(authorization.slice(7).trim());
    const rows = await sql.query("SELECT user_id, expires_at FROM user_sessions WHERE token_hash = $1", [tokenHash]);
    if (!rows.length || new Date(String(rows[0].expires_at)) <= new Date()) error(401, "登录已过期，请重新登录");
    return { ownerKey: `user:${rows[0].user_id}`, userId: String(rows[0].user_id) };
  }
  const guestId = request.headers.get("X-Guest-ID") ?? "";
  if (!validGuest(guestId)) error(400, "缺少游客身份");
  return { ownerKey: `guest:${guestId}` };
}
function requireUser(value: Principal) { if (!value.userId) error(401, "登录后即可使用训练模板和快捷动作"); return value.userId; }
async function workout(sql: Sql, workoutId: string, ownerKey: string) {
  const rows = await sql.query("SELECT * FROM workouts WHERE id = $1 AND owner_key = $2", [workoutId, ownerKey]);
  if (!rows.length) error(404, "训练记录不存在"); return rows[0];
}
async function bundle(sql: Sql, row: any) {
  if (!row) return null;
  const exercises = await sql.query("SELECT * FROM workout_exercises WHERE workout_id = $1 ORDER BY sort_order", [row.id]);
  return { workout: { id: row.id, date: date(row.training_date), notes: row.notes, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }, exercises: await Promise.all(exercises.map(async (item: any) => ({
    workoutExercise: { id: item.id, workoutId: item.workout_id, exerciseId: item.exercise_id, sortOrder: item.sort_order },
    sets: (await sql.query("SELECT * FROM training_sets WHERE workout_exercise_id = $1 ORDER BY set_number", [item.id])).map((set: any) => ({ id: set.id, workoutExerciseId: set.workout_exercise_id, setNumber: set.set_number, ...(set.weight_kg == null ? {} : { weightKg: Number(set.weight_kg) }), ...(set.reps == null ? {} : { reps: set.reps }), createdAt: iso(set.created_at) })),
  }))) };
}
function exerciseIds(value: unknown, maximum: number, label: string) {
  if (!Array.isArray(value)) error(400, `${label}格式无效`);
  const values = [...new Set((value as unknown[]).filter((item: unknown) => typeof item === "string" && item.trim() && item.length <= 128))] as string[];
  if (!values.length || values.length > maximum) error(400, `${label}需要包含 1 到 ${maximum} 个动作`); return values;
}
function optionalNumber(value: unknown, field: string, integer = false) {
  if (value == null) return null; if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && (!Number.isInteger(value) || value < 1))) error(400, `${field} 必须是${integer ? "正整数" : "非负数字"}`); return value;
}

async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return respond(request, env, empty());
  const sql = neon(env.DATABASE_URL); const url = new URL(request.url); const path = url.pathname;
  if (path === "/api/health") return json({ ok: true, framework: "Cloudflare Workers" });
  if (path === "/api/auth/register" && request.method === "POST") {
    const input = await body(request); const email = text(input.email).trim().toLowerCase(); const password = text(input.password); const confirm = text(input.confirmPassword); const displayName = text(input.displayName || email.split("@")[0]).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error(400, "邮箱格式无效"); if (password.length < 8) error(400, "密码至少需要 8 位"); if (password !== confirm) error(400, "两次输入的密码不一致"); if (!displayName || displayName.length > 40) error(400, "昵称长度应为 1 到 40 位");
    if ((await sql.query("SELECT id FROM users WHERE email = $1", [email])).length) error(409, "该邮箱已经注册");
    const userId = id("user"), createdAt = now(); await sql.query("INSERT INTO users (id,email,display_name,password_hash,created_at) VALUES ($1,$2,$3,$4,$5)", [userId, email, displayName, await passwordHash(password), createdAt]);
    const guestId = text(input.guestId); if (validGuest(guestId)) await sql.query("UPDATE workouts SET owner_key = $1 WHERE owner_key = $2", [`user:${userId}`, `guest:${guestId}`]).catch(() => undefined);
    const token = b64(crypto.getRandomValues(new Uint8Array(32))); await sql.query("INSERT INTO user_sessions (id,user_id,token_hash,created_at,expires_at) VALUES ($1,$2,$3,$4,$5)", [id("session"), userId, await sha256(token), createdAt, new Date(Date.now() + 2592000000).toISOString()]);
    return json({ token, user: { id: userId, email, displayName, createdAt } }, 201);
  }
  if (path === "/api/auth/login" && request.method === "POST") {
    const input = await body(request); const email = text(input.email).trim().toLowerCase(); const users = await sql.query("SELECT * FROM users WHERE email = $1", [email]); if (!users.length || !await passwordMatches(text(input.password), String(users[0].password_hash))) error(401, "邮箱或密码错误");
    const user = users[0], token = b64(crypto.getRandomValues(new Uint8Array(32))), createdAt = now(); await sql.query("INSERT INTO user_sessions (id,user_id,token_hash,created_at,expires_at) VALUES ($1,$2,$3,$4,$5)", [id("session"), user.id, await sha256(token), createdAt, new Date(Date.now() + 2592000000).toISOString()]);
    return json({ token, user: { id: user.id, email: user.email, displayName: user.display_name, createdAt: iso(user.created_at) } });
  }
  if (path === "/api/auth/logout" && request.method === "POST") { const token = request.headers.get("Authorization")?.replace("Bearer ", "").trim(); if (token) await sql.query("DELETE FROM user_sessions WHERE token_hash = $1", [await sha256(token)]); return empty(); }
  const owner = await principal(sql, request);
  if (path === "/api/auth/me" && request.method === "GET") { if (!owner.userId) return json({ user: null }); const rows = await sql.query("SELECT * FROM users WHERE id = $1", [owner.userId]); if (!rows.length) error(401, "用户不存在"); const user = rows[0]; return json({ user: { id: user.id, email: user.email, displayName: user.display_name, createdAt: iso(user.created_at) } }); }
  if (path === "/api/favorite-exercises" && request.method === "GET") return json((await sql.query("SELECT exercise_id FROM favorite_exercises WHERE owner_key = $1 ORDER BY created_at", [owner.ownerKey])).map(row => row.exercise_id));
  const favorite = path.match(/^\/api\/favorite-exercises\/([^/]+)$/); if (favorite) { const exerciseId = decodeURIComponent(favorite[1]); if (request.method === "PUT") { await sql.query("INSERT INTO favorite_exercises (owner_key,exercise_id,created_at) VALUES ($1,$2,$3) ON CONFLICT (owner_key,exercise_id) DO UPDATE SET created_at = EXCLUDED.created_at", [owner.ownerKey, exerciseId, now()]); return empty(); } if (request.method === "DELETE") { await sql.query("DELETE FROM favorite_exercises WHERE owner_key = $1 AND exercise_id = $2", [owner.ownerKey, exerciseId]); return empty(); } }
  if (path === "/api/workouts/today" || path.startsWith("/api/workouts/by-date/")) { const day = path.endsWith("today") ? (url.searchParams.get("date") ?? "") : decodeURIComponent(path.split("/").pop()!); if (!validDate(day)) error(400, "date 必须是 YYYY-MM-DD"); const rows = await sql.query("SELECT * FROM workouts WHERE owner_key = $1 AND training_date = $2", [owner.ownerKey, day]); return json(await bundle(sql, rows[0])); }
  if (path === "/api/workouts/recent") { const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? 3))); const rows = await sql.query("SELECT * FROM workouts WHERE owner_key = $1 ORDER BY training_date DESC LIMIT $2", [owner.ownerKey, limit]); return json((await Promise.all(rows.map(row => bundle(sql, row)))).filter(item => item?.exercises.length)); }
  if (path === "/api/workouts" && request.method === "GET") { const month = url.searchParams.get("month"), start = url.searchParams.get("start"); if (month && !/^\d{4}-\d{2}$/.test(month)) error(400, "month 必须是 YYYY-MM"); if (start && !validDate(start)) error(400, "start 必须是 YYYY-MM-DD"); let query = "SELECT * FROM workouts WHERE owner_key = $1"; const args: unknown[] = [owner.ownerKey]; if (month) { query += " AND training_date::text LIKE $2"; args.push(`${month}%`); } if (start) { query += ` AND training_date >= $${args.length + 1}`; args.push(start); } query += " ORDER BY training_date DESC"; return json((await Promise.all((await sql.query(query, args)).map(row => bundle(sql, row)))).filter(item => item?.exercises.length)); }
  if (path === "/api/workouts" && request.method === "POST") { const input = await body(request), day = text(input.date); if (!validDate(day)) error(400, "date 必须是 YYYY-MM-DD"); let rows = await sql.query("SELECT * FROM workouts WHERE owner_key = $1 AND training_date = $2", [owner.ownerKey, day]); if (!rows.length) { const timestamp = now(), workoutId = id("workout"); await sql.query("INSERT INTO workouts (id,owner_key,training_date,notes,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)", [workoutId, owner.ownerKey, day, "", timestamp, timestamp]); rows = await sql.query("SELECT * FROM workouts WHERE id = $1", [workoutId]); } const row = rows[0]; return json({ id: row.id, date: date(row.training_date), notes: row.notes, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }); }
  const workoutMatch = path.match(/^\/api\/workouts\/([^/]+)$/); if (workoutMatch) { const workoutId = decodeURIComponent(workoutMatch[1]); if (request.method === "GET") return json(await bundle(sql, await workout(sql, workoutId, owner.ownerKey))); if (request.method === "PATCH") { const input = await body(request); if ("notes" in input && (typeof input.notes !== "string" || input.notes.length > 2000)) error(400, "备注格式无效"); await workout(sql, workoutId, owner.ownerKey); await sql.query("UPDATE workouts SET notes = COALESCE($1, notes), updated_at = $2 WHERE id = $3", [typeof input.notes === "string" ? input.notes.trim() : null, now(), workoutId]); return empty(); } if (request.method === "DELETE") { await workout(sql, workoutId, owner.ownerKey); await sql.query("DELETE FROM workouts WHERE id = $1", [workoutId]); return empty(); } }
  const addExercise = path.match(/^\/api\/workouts\/([^/]+)\/exercises$/); if (addExercise && request.method === "POST") { const workoutId = decodeURIComponent(addExercise[1]), input = await body(request), exerciseId = text(input.exerciseId); if (!exerciseId) error(400, "exerciseId 不能为空"); await workout(sql, workoutId, owner.ownerKey); const rows = await sql.query("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM workout_exercises WHERE workout_id = $1", [workoutId]); const exerciseIdValue = id("workoutExercise"); await sql.query("INSERT INTO workout_exercises (id,workout_id,exercise_id,sort_order) VALUES ($1,$2,$3,$4)", [exerciseIdValue, workoutId, exerciseId, rows[0].next]); await sql.query("INSERT INTO training_sets (id,workout_exercise_id,set_number,reps,created_at) VALUES ($1,$2,1,10,$3)", [id("set"), exerciseIdValue, now()]); await sql.query("UPDATE workouts SET updated_at=$1 WHERE id=$2", [now(), workoutId]); return json({ id: exerciseIdValue, workoutId, exerciseId, sortOrder: rows[0].next }, 201); }
  const removeExercise = path.match(/^\/api\/workouts\/([^/]+)\/exercises\/([^/]+)$/); if (removeExercise && request.method === "DELETE") { const workoutId = decodeURIComponent(removeExercise[1]), itemId = decodeURIComponent(removeExercise[2]); await workout(sql, workoutId, owner.ownerKey); const found = await sql.query("SELECT id FROM workout_exercises WHERE id=$1 AND workout_id=$2", [itemId, workoutId]); if (!found.length) error(404, "训练动作不存在"); await sql.query("DELETE FROM workout_exercises WHERE id=$1", [itemId]); await sql.query("UPDATE workouts SET updated_at=$1 WHERE id=$2", [now(), workoutId]); return empty(); }
  const addSet = path.match(/^\/api\/workouts\/([^/]+)\/exercises\/([^/]+)\/sets$/); if (addSet && request.method === "POST") { const workoutId = decodeURIComponent(addSet[1]), itemId = decodeURIComponent(addSet[2]); await workout(sql, workoutId, owner.ownerKey); const items = await sql.query("SELECT * FROM training_sets WHERE workout_exercise_id=$1 ORDER BY set_number DESC", [itemId]); if (!(await sql.query("SELECT id FROM workout_exercises WHERE id=$1 AND workout_id=$2", [itemId, workoutId])).length) error(404, "训练动作不存在"); const previous = items[0], createdAt = now(); await sql.query("INSERT INTO training_sets (id,workout_exercise_id,set_number,weight_kg,reps,created_at) VALUES ($1,$2,$3,$4,$5,$6)", [id("set"), itemId, items.length + 1, previous?.weight_kg ?? null, previous?.reps ?? 10, createdAt]); await sql.query("UPDATE workouts SET updated_at=$1 WHERE id=$2", [createdAt, workoutId]); return empty(); }
  const setMatch = path.match(/^\/api\/workouts\/([^/]+)\/sets\/([^/]+)$/); if (setMatch) { const workoutId = decodeURIComponent(setMatch[1]), setId = decodeURIComponent(setMatch[2]); await workout(sql, workoutId, owner.ownerKey); const sets = await sql.query("SELECT s.*, e.workout_id FROM training_sets s JOIN workout_exercises e ON e.id=s.workout_exercise_id WHERE s.id=$1 AND e.workout_id=$2", [setId, workoutId]); if (!sets.length) error(404, "训练组不存在"); if (request.method === "PATCH") { const input = await body(request), weight = "weightKg" in input ? optionalNumber(input.weightKg, "weightKg") : sets[0].weight_kg, reps = "reps" in input ? optionalNumber(input.reps, "reps", true) : sets[0].reps; await sql.query("UPDATE training_sets SET weight_kg=$1,reps=$2 WHERE id=$3", [weight, reps, setId]); await sql.query("UPDATE workouts SET updated_at=$1 WHERE id=$2", [now(), workoutId]); return empty(); } if (request.method === "DELETE") { await sql.query("DELETE FROM training_sets WHERE id=$1", [setId]); const rest = await sql.query("SELECT id FROM training_sets WHERE workout_exercise_id=$1 ORDER BY set_number", [sets[0].workout_exercise_id]); await Promise.all(rest.map((item, index) => sql.query("UPDATE training_sets SET set_number=$1 WHERE id=$2", [index + 1, item.id]))); await sql.query("UPDATE workouts SET updated_at=$1 WHERE id=$2", [now(), workoutId]); return empty(); } }
  if (path === "/api/workouts/complete" && request.method === "POST") { const input = await body(request), day = text(input.date), notes = text(input.notes); if (!validDate(day)) error(400, "date 必须是 YYYY-MM-DD"); if (notes.length > 2000) error(400, "备注格式无效"); const ids = exerciseIds(input.exerciseIds, 50, "动作"); const base = await handle(new Request(new URL("/api/workouts", request.url), { method: "POST", headers: request.headers, body: JSON.stringify({ date: day }) }), env); const created = await base.json() as { id: string }; await sql.query("UPDATE workouts SET notes=$1,updated_at=$2 WHERE id=$3", [notes.trim(), now(), created.id]); const existing = await sql.query("SELECT exercise_id FROM workout_exercises WHERE workout_id=$1", [created.id]); for (const exerciseId of ids.filter(value => !existing.some(row => row.exercise_id === value))) await handle(new Request(new URL(`/api/workouts/${created.id}/exercises`, request.url), { method: "POST", headers: { ...Object.fromEntries(request.headers), "Content-Type": "application/json" }, body: JSON.stringify({ exerciseId }) }), env); return json(await bundle(sql, await workout(sql, created.id, owner.ownerKey))); }
  if (path === "/api/training/templates" && request.method === "GET") { const userId = requireUser(owner); const rows = await sql.query("SELECT * FROM user_training_templates WHERE user_id=$1 ORDER BY updated_at DESC", [userId]); return json([...builtInTemplates, ...rows.map(row => ({ id: row.id, kind: "custom", name: row.name, description: `${Array.isArray(row.exercise_ids) ? row.exercise_ids.length : 0} 个动作 · 你的自定义编排`, tag: "自定义模板", exerciseIds: row.exercise_ids }))]); }
  if (path === "/api/training/templates" && request.method === "POST") { const userId = requireUser(owner), input = await body(request), name = text(input.name).trim(), ids = exerciseIds(input.exerciseIds, 12, "模板"); if (!name || name.length > 60) error(400, "模板名称长度应为 1 到 60 位"); const templateId = id("template"), timestamp = now(); try { await sql.query("INSERT INTO user_training_templates (id,user_id,name,exercise_ids,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)", [templateId, userId, name, JSON.stringify(ids), timestamp, timestamp]); } catch { error(409, "已有同名自定义模板"); } return json({ id: templateId, kind: "custom", name, description: `${ids.length} 个动作 · 你的自定义编排`, tag: "自定义模板", exerciseIds: ids }, 201); }
  const template = path.match(/^\/api\/training\/templates\/([^/]+)$/); if (template) { const userId = requireUser(owner), templateId = decodeURIComponent(template[1]); if (request.method === "DELETE") { const result = await sql.query("DELETE FROM user_training_templates WHERE id=$1 AND user_id=$2 RETURNING id", [templateId, userId]); if (!result.length) error(404, "自定义模板不存在"); return empty(); } if (request.method === "PATCH") { const input = await body(request), name = text(input.name).trim(), ids = exerciseIds(input.exerciseIds, 12, "模板"); if (!name || name.length > 60) error(400, "模板名称长度应为 1 到 60 位"); const result = await sql.query("UPDATE user_training_templates SET name=$1,exercise_ids=$2,updated_at=$3 WHERE id=$4 AND user_id=$5 RETURNING id", [name, JSON.stringify(ids), now(), templateId, userId]); if (!result.length) error(404, "自定义模板不存在"); return json({ id: templateId, kind: "custom", name, description: `${ids.length} 个动作 · 你的自定义编排`, tag: "自定义模板", exerciseIds: ids }); } }
  if (path === "/api/training/quick-exercises") { requireUser(owner); const favorites = await sql.query("SELECT exercise_id FROM favorite_exercises WHERE owner_key=$1 ORDER BY created_at DESC LIMIT 8", [owner.ownerKey]); const recent = await sql.query("SELECT e.exercise_id, COUNT(*) AS used FROM workout_exercises e JOIN workouts w ON w.id=e.workout_id WHERE w.owner_key=$1 GROUP BY e.exercise_id ORDER BY used DESC LIMIT 8", [owner.ownerKey]); return json({ favorites: favorites.map(row => row.exercise_id), recent: recent.map(row => row.exercise_id), recommended: recommendations }); }
  if (path === "/api/auth/password" && request.method === "PATCH") { const userId = requireUser(owner), input = await body(request), users = await sql.query("SELECT password_hash FROM users WHERE id=$1", [userId]); if (!users.length) error(401, "用户不存在"); if (!await passwordMatches(text(input.currentPassword), users[0].password_hash)) error(400, "当前密码不正确"); if (text(input.newPassword).length < 8) error(400, "新密码至少需要 8 位"); if (text(input.newPassword) !== text(input.confirmPassword)) error(400, "两次输入的新密码不一致"); const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? ""; await sql.query("UPDATE users SET password_hash=$1 WHERE id=$2", [await passwordHash(text(input.newPassword)), userId]); await sql.query("DELETE FROM user_sessions WHERE user_id=$1 AND token_hash<>$2", [userId, await sha256(token)]); return empty(); }
  if (path === "/api/data/export" && request.method === "GET") { const rows = await sql.query("SELECT * FROM workouts WHERE owner_key=$1", [owner.ownerKey]); const results = await Promise.all(rows.map(row => bundle(sql, row))); return json({ version: 1, workouts: results.map(item => item!.workout), workoutExercises: results.flatMap(item => item!.exercises.map(entry => entry.workoutExercise)), trainingSets: results.flatMap(item => item!.exercises.flatMap(entry => entry.sets)), favoriteExercises: (await sql.query("SELECT exercise_id,created_at FROM favorite_exercises WHERE owner_key=$1", [owner.ownerKey])).map(row => ({ exerciseId: row.exercise_id, createdAt: iso(row.created_at) })), exportedAt: now() }); }
  if (path === "/api/analysis/exercise-body-parts" && request.method === "POST") return json({});
  if (path === "/api/data/import" && request.method === "PUT") { const input = await body(request); if (input.version !== 1 || !Array.isArray(input.workouts) || !Array.isArray(input.workoutExercises) || !Array.isArray(input.trainingSets) || !Array.isArray(input.favoriteExercises)) error(400, "备份文件版本无效"); const old = await sql.query("SELECT id FROM workouts WHERE owner_key=$1", [owner.ownerKey]); await Promise.all(old.map((row: any) => sql.query("DELETE FROM workouts WHERE id=$1", [row.id]))); await sql.query("DELETE FROM favorite_exercises WHERE owner_key=$1", [owner.ownerKey]); const workoutMap = new Map<string, string>(), exerciseMap = new Map<string, string>(); for (const source of input.workouts as Json[]) { const workoutId=id("workout"), timestamp=now(); workoutMap.set(text(source.id), workoutId); await sql.query("INSERT INTO workouts (id,owner_key,training_date,notes,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)", [workoutId, owner.ownerKey, text(source.date), text(source.notes), text(source.createdAt || timestamp), text(source.updatedAt || timestamp)]); } for (const source of input.workoutExercises as Json[]) { const workoutId=workoutMap.get(text(source.workoutId)); if (!workoutId) continue; const itemId=id("workoutExercise"); exerciseMap.set(text(source.id),itemId); await sql.query("INSERT INTO workout_exercises (id,workout_id,exercise_id,sort_order) VALUES ($1,$2,$3,$4)",[itemId,workoutId,text(source.exerciseId),Number(source.sortOrder)||0]); } for (const source of input.trainingSets as Json[]) { const itemId=exerciseMap.get(text(source.workoutExerciseId)); if (!itemId) continue; await sql.query("INSERT INTO training_sets (id,workout_exercise_id,set_number,weight_kg,reps,created_at) VALUES ($1,$2,$3,$4,$5,$6)",[id("set"),itemId,Number(source.setNumber)||1,source.weightKg ?? null,source.reps ?? null,text(source.createdAt || now())]); } for (const source of input.favoriteExercises as Json[]) if (text(source.exerciseId)) await sql.query("INSERT INTO favorite_exercises (owner_key,exercise_id,created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",[owner.ownerKey,text(source.exerciseId),text(source.createdAt || now())]); return empty(); }
  if (path === "/api/data" && request.method === "DELETE") { const rows = await sql.query("SELECT id FROM workouts WHERE owner_key=$1", [owner.ownerKey]); await Promise.all(rows.map(row => sql.query("DELETE FROM workouts WHERE id=$1", [row.id]))); await sql.query("DELETE FROM favorite_exercises WHERE owner_key=$1", [owner.ownerKey]); return empty(); }
  return error(404, "接口不存在");
}

export default { async fetch(request: Request, env: Env) { try { return respond(request, env, await handle(request, env)); } catch (cause) { const value = cause as { status?: number; message?: string }; return respond(request, env, json({ error: value.message ?? "服务暂时不可用，请稍后重试" }, value.status ?? 500)); } } };
