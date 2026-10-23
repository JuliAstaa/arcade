/*
 * Snippets for `code` mode, from the kind of work in Juli's stack: Go services,
 * Python with FastAPI, and PostgreSQL. Short enough for a round, real enough to
 * compile or run in context. Indentation is typed for the player, so lines may
 * nest freely; Go keeps its tabs here and shows them four columns wide.
 *
 * Written with String.raw so backslashes stay as typed. No backticks inside.
 */

export type CodeLang = 'go' | 'python' | 'sql';

export interface Snippet {
	lang: CodeLang;
	file: string;
	code: string;
}

const go = (file: string, code: string): Snippet => ({ lang: 'go', file, code });
const python = (file: string, code: string): Snippet => ({ lang: 'python', file, code });
const sql = (file: string, code: string): Snippet => ({ lang: 'sql', file, code });

export const snippets: Snippet[] = [
	go(
		'handlers/health.go',
		String.raw`
func health(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), time.Second)
		defer cancel()
		if err := db.PingContext(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}`,
	),
	go(
		'jobs/pool.go',
		String.raw`
func process(ctx context.Context, jobs <-chan Job) error {
	g, ctx := errgroup.WithContext(ctx)
	for range 4 {
		g.Go(func() error {
			for job := range jobs {
				if err := job.Run(ctx); err != nil {
					return fmt.Errorf("job %d: %w", job.ID, err)
				}
			}
			return nil
		})
	}
	return g.Wait()
}`,
	),
	go(
		'cmd/api/main.go',
		String.raw`
func getenv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func main() {
	addr := getenv("ADDR", ":8080")
	log.Printf("listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, routes()))
}`,
	),
	go(
		'middleware/ratelimit.go',
		String.raw`
func allow(ctx context.Context, rdb *redis.Client, ip string) bool {
	key := "rate:" + ip
	n, err := rdb.Incr(ctx, key).Result()
	if err != nil {
		return true
	}
	if n == 1 {
		rdb.Expire(ctx, key, time.Minute)
	}
	return n <= 60
}`,
	),
	go(
		'httpx/decode.go',
		String.raw`
func decode[T any](r *http.Request) (T, error) {
	var v T
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&v); err != nil {
		return v, fmt.Errorf("decode: %w", err)
	}
	return v, nil
}`,
	),
	go(
		'slug/slug_test.go',
		String.raw`
func TestSlug(t *testing.T) {
	tests := []struct{ in, want string }{
		{"Hello World", "hello-world"},
		{"Go & SQL", "go-sql"},
	}
	for _, tt := range tests {
		if got := Slug(tt.in); got != tt.want {
			t.Errorf("Slug(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}`,
	),

	python(
		'app/routes/users.py',
		String.raw`
@router.get("/users/{user_id}")
async def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="not found")
    return user`,
	),
	python(
		'scripts/backup.py',
		String.raw`
def backup(src: Path, dest: Path, keep: int = 7) -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    target = dest / f"{src.name}-{stamp}"
    shutil.copytree(src, target)
    old = sorted(dest.glob(f"{src.name}-*"))[:-keep]
    for path in old:
        shutil.rmtree(path)
    return target`,
	),
	python(
		'scripts/check.py',
		String.raw`
async def check(urls: list[str]) -> dict[str, int]:
    async with httpx.AsyncClient(timeout=5) as client:
        responses = await asyncio.gather(
            *(client.get(url) for url in urls),
            return_exceptions=True,
        )
    return {
        url: getattr(r, "status_code", 0)
        for url, r in zip(urls, responses)
    }`,
	),
	python(
		'app/models.py',
		String.raw`
class Server(BaseModel):
    name: str
    host: str
    port: int = 22
    tags: list[str] = []

    @field_validator("port")
    @classmethod
    def valid_port(cls, v: int) -> int:
        if not 0 < v < 65536:
            raise ValueError("port out of range")
        return v`,
	),
	python(
		'app/cache.py',
		String.raw`
def cached(ttl: int = 60):
    def wrap(fn):
        @functools.wraps(fn)
        def inner(*args):
            key = f"{fn.__name__}:{args}"
            if (hit := redis.get(key)) is not None:
                return json.loads(hit)
            value = fn(*args)
            redis.setex(key, ttl, json.dumps(value))
            return value
        return inner
    return wrap`,
	),
	python(
		'scripts/top_paths.py',
		String.raw`
pattern = re.compile(r'"(GET|POST) (\S+)')
hits = Counter()
with open("/var/log/nginx/access.log") as log:
    for line in log:
        if match := pattern.search(line):
            hits[match.group(2)] += 1

for path, count in hits.most_common(5):
    print(f"{count:>6} {path}")`,
	),

	sql(
		'reports/top_customers.sql',
		String.raw`
SELECT c.name, sum(o.total) AS revenue
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at >= now() - interval '30 days'
GROUP BY c.name
ORDER BY revenue DESC
LIMIT 10;`,
	),
	sql(
		'reports/last_payment.sql',
		String.raw`
WITH ranked AS (
  SELECT
    user_id,
    amount,
    row_number() OVER (
      PARTITION BY user_id ORDER BY created_at DESC
    ) AS rn
  FROM payments
)
SELECT user_id, amount
FROM ranked
WHERE rn = 1;`,
	),
	sql(
		'queries/upsert_server.sql',
		String.raw`
INSERT INTO servers (name, host, last_seen)
VALUES ('db-1', '100.64.0.12', now())
ON CONFLICT (name) DO UPDATE
SET host = EXCLUDED.host,
    last_seen = EXCLUDED.last_seen
RETURNING id;`,
	),
	sql(
		'migrations/004_sessions.sql',
		String.raw`
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id bigint NOT NULL REFERENCES users (id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);`,
	),
	sql(
		'reports/daily_active.sql',
		String.raw`
SELECT date_trunc('day', created_at) AS day,
       count(DISTINCT user_id) AS dau
FROM events
WHERE created_at > now() - interval '14 days'
GROUP BY 1
ORDER BY 1;`,
	),
	sql(
		'ops/slow_queries.sql',
		String.raw`
SELECT query, calls,
       round(mean_exec_time::numeric, 2) AS avg_ms
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 5;`,
	),
];

/** A snippet ready to type: tabs as four spaces, no trailing whitespace, no blank edges. */
export const tidy = (code: string) =>
	code
		.replace(/^\n+|\s+$/g, '')
		.split('\n')
		.map((line) => line.replace(/^\t+/, (tabs) => '    '.repeat(tabs.length)).trimEnd())
		.join('\n');

/** A random snippet in `lang` (any language for `mix`), never `last` again when there's a choice. */
export const pickSnippet = (lang: CodeLang | 'mix', last?: Snippet) => {
	const pool = snippets.filter((snippet) => lang === 'mix' || snippet.lang === lang);
	const fresh = pool.filter((snippet) => snippet !== last);
	const from = fresh.length ? fresh : pool;
	return from[Math.floor(Math.random() * from.length)];
};
